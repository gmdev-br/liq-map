import { useState, useEffect, useRef, useMemo, memo, useCallback } from 'react';
import {
    RefreshCw,
    BarChart3,
    Search,
    Calendar,
    Settings as SettingsIcon,
    Activity,
    DollarSign,
    TrendingUp,
    TrendingDown,
    Clock,
    Download,
    Upload,
    RotateCcw
} from 'lucide-react';
import { Card, CardContent, CardHeader } from '@/components/ui/Card';
import { useCacheData } from '@/hooks/useCacheData';
import { useWebSocket } from '@/hooks/useWebSocket';
import { format } from 'date-fns';
import { liquidationsApi, pricesApi } from '@/services/api';
import { exportToCSV, exportToJSON, importFromCSV, importFromJSON, generateExportFilename } from '@/utils/exportImport';
import {
    Chart as ChartJS,
    CategoryScale,
    LinearScale,
    PointElement,
    LineElement,
    BarElement,
    BarController,
    LineController,
    ScatterController,
    Title,
    Tooltip as ChartTooltip,
    Legend as ChartLegend,
    ChartData,
    ChartOptions,
} from 'chart.js';
import zoomPlugin from 'chartjs-plugin-zoom';
import { Chart } from 'react-chartjs-2';

// Register Chart.js components
ChartJS.register(
    CategoryScale,
    LinearScale,
    PointElement,
    LineElement,
    BarElement,
    BarController,
    LineController,
    ScatterController,
    Title,
    ChartTooltip,
    ChartLegend,
    zoomPlugin
);

interface HistoricalLiquidation {
    timestamp: number;
    long_volume: number;
    short_volume: number;
    total_volume: number;
    long_short_ratio: number;
    price: number;
}

// Liquidation Chart Component
// Line style configuration interface
export interface LineStyleConfig {
    color: string;
    width: number;
    dash?: number[];
}

// Chart line styles configuration
export interface ChartLineStyles {
    thousandLines: LineStyleConfig;
    btcQuoteLine: LineStyleConfig;
}

// Default line styles
export const defaultLineStyles: ChartLineStyles = {
    thousandLines: {
        color: '#64748b',
        width: 1,
        dash: [3, 3],
    },
    btcQuoteLine: {
        color: '#ef4444',
        width: 2,
        dash: [5, 5],
    },
};

interface LiquidationChartProps {
    data: HistoricalLiquidation[];
    formatCurrency: (value: number) => string;
    groupBy?: 'none' | 'long' | 'short' | 'combined' | 'stacked';
    currentPrice?: number | null;
    priceInterval: number;
    lineStyles?: ChartLineStyles;
}

const LiquidationChart = memo(function LiquidationChart({ data, formatCurrency, groupBy = 'none', currentPrice, priceInterval, lineStyles = defaultLineStyles }: LiquidationChartProps) {
    const chartRef = useRef<any>(null);

    const resetZoom = () => {
        if (chartRef.current) {
            chartRef.current.resetZoom();
        }
    };

    // Sort data by price for proper x-axis ordering - memoized to prevent unnecessary re-renders
    const sortedData = useMemo(() => [...data].sort((a, b) => a.price - b.price), [data]);

    // Memoize vertical lines at multiples of 1000 - only recalculates when sortedData changes
    // NOT when currentPrice changes, avoiding unnecessary re-renders
    // OPTIMIZATION: Uses a single dataset with segments instead of multiple datasets
    const verticalLinesDataset = useMemo(() => {
        if (sortedData.length === 0) return null;

        const maxVolume = Math.max(...sortedData.map(d => d.long_volume + d.short_volume));
        const yMax = maxVolume * 1.1;

        // Get the price range of the displayed data
        const minDataPrice = sortedData[0].price;
        const maxDataPrice = sortedData[sortedData.length - 1].price;

        // Calculate multiples of 1000 within the data range
        const firstMultiple = Math.ceil(minDataPrice / 1000) * 1000;
        const lastMultiple = Math.floor(maxDataPrice / 1000) * 1000;

        // Create labels array for lookup (same as used in the chart)
        const priceLabels = sortedData.map(d => formatCurrency(d.price));

        // Build a single dataset with all vertical line segments
        // Using null values to create gaps between lines (spanGaps: false)
        const lineData: any[] = [];

        // Add vertical line for each multiple of 1000
        for (let multiple = firstMultiple; multiple <= lastMultiple; multiple += 1000) {
            // Find the data point closest to this price multiple
            const prices = sortedData.map(d => d.price);
            const closestIndex = prices.reduce((closestIdx, price, idx) => {
                return Math.abs(price - multiple) < Math.abs(prices[closestIdx] - multiple) ? idx : closestIdx;
            }, 0);

            // Use the formatted label string as x value for category scale
            const closestLabel = priceLabels[closestIndex];

            // Add two points for the vertical line (bottom to top)
            lineData.push(
                { x: closestLabel, y: 0 },
                { x: closestLabel, y: yMax }
            );

            // Add null to create a gap before the next line (unless it's the last one)
            if (multiple + 1000 <= lastMultiple) {
                lineData.push({ x: null, y: null });
            }
        }

        // Return a single dataset with all vertical lines
        return {
            type: 'line' as const,
            label: '',
            data: lineData,
            borderColor: lineStyles.thousandLines.color,
            backgroundColor: 'transparent',
            borderWidth: lineStyles.thousandLines.width,
            borderDash: lineStyles.thousandLines.dash,
            pointRadius: 0,
            pointHoverRadius: 0,
            yAxisID: 'y',
            xAxisID: 'x',
            order: 0,
            spanGaps: false, // Important: creates separate segments for each vertical line
        };
    }, [sortedData, formatCurrency, lineStyles.thousandLines]);

    // Create chart data based on groupBy selection - memoized to preserve zoom state
    const chartData: ChartData<'bar' | 'line'> = useMemo(() => {
        const labels = sortedData.map((d) => formatCurrency(d.price));
        const datasets: any[] = groupBy === 'stacked'
            ? [{
                type: 'bar' as const,
                label: 'Total Volume',
                data: sortedData.map((d) => d.long_volume + d.short_volume),
                backgroundColor: '#3b82f6',
                borderRadius: 4,
            }]
            : [
                {
                    type: 'bar' as const,
                    label: 'Longs',
                    data: sortedData.map((d) => d.long_volume),
                    backgroundColor: '#10b981',
                    borderRadius: 4,
                },
                {
                    type: 'bar' as const,
                    label: 'Shorts',
                    data: sortedData.map((d) => d.short_volume),
                    backgroundColor: '#ef4444',
                    borderRadius: 4,
                },
            ];

        // Add memoized vertical lines at multiples of 1000 (static, only changes when sortedData changes)
        // OPTIMIZATION: Now a single dataset instead of multiple datasets
        if (verticalLinesDataset) {
            datasets.push(verticalLinesDataset);
        }

        // Add vertical line at current price if we have a price value and data
        if (currentPrice && sortedData.length > 0) {
            const maxVolume = Math.max(...sortedData.map(d => d.long_volume + d.short_volume));
            const yMax = maxVolume * 1.1;

            // Get the price range of the displayed data
            const minDataPrice = sortedData[0].price;
            const maxDataPrice = sortedData[sortedData.length - 1].price;

            // Only draw the line if current price is within or near the displayed data range
            // Allow some margin for visual clarity
            const priceMargin = (maxDataPrice - minDataPrice) * 0.05;

            if (currentPrice >= minDataPrice - priceMargin && currentPrice <= maxDataPrice + priceMargin) {
                // Create labels array for lookup (same as used in the chart)
                const priceLabels = sortedData.map(d => formatCurrency(d.price));

                // Find the index closest to current price for vertical line placement
                const prices = sortedData.map(d => d.price);
                const closestIndex = prices.reduce((closestIdx, price, idx) => {
                    return Math.abs(price - currentPrice) < Math.abs(prices[closestIdx] - currentPrice) ? idx : closestIdx;
                }, 0);

                // Use the formatted label string as x value for category scale
                const closestLabel = priceLabels[closestIndex];

                // Create a vertical line using scatter with line at the current price position
                datasets.push({
                    type: 'scatter' as const,
                    label: '',
                    data: [
                        { x: closestLabel, y: 0 },
                        { x: closestLabel, y: yMax },
                    ],
                    borderColor: lineStyles.btcQuoteLine.color,
                    backgroundColor: 'transparent',
                    borderWidth: lineStyles.btcQuoteLine.width,
                    borderDash: lineStyles.btcQuoteLine.dash,
                    pointRadius: 0,
                    pointHoverRadius: 0,
                    yAxisID: 'y',
                    xAxisID: 'x',
                    order: 0,
                    showLine: true, // Connect points with a line to create vertical line
                });
            }
        }

        return {
            labels,
            datasets,
        };
    }, [sortedData, groupBy, formatCurrency, currentPrice, verticalLinesDataset, lineStyles]);

    // Memoize chart options to prevent zoom reset on re-renders
    const chartOptions: any = useMemo(() => ({
        responsive: true,
        maintainAspectRatio: false,
        interaction: {
            mode: 'index',
            intersect: false,
        },
        plugins: {
            legend: {
                display: groupBy !== 'stacked',
                position: 'top',
                labels: {
                    color: '#64748b',
                    usePointStyle: true,
                    padding: 20,
                },
            },
            tooltip: {
                enabled: true,
                backgroundColor: '#1e293b',
                titleColor: '#f1f5f9',
                bodyColor: '#f1f5f9',
                borderColor: '#475569',
                borderWidth: 1,
                padding: 12,
                cornerRadius: 8,
                displayColors: true,
                boxPadding: 4,
                callbacks: {
                    title: (items: any) => {
                        if (!items.length) return '';
                        const idx = items[0].dataIndex;
                        const item = sortedData[idx];
                        if (!item) return '';

                        // Se houver intervalo de preço, o timestamp não é uma data real (é o preço base da faixa)
                        // Portanto, não mostramos a data "01/01/1970"
                        if (priceInterval > 0) {
                            return `Price Range: ${formatCurrency(item.timestamp)} - ${formatCurrency(item.timestamp + priceInterval)}`;
                        }

                        const date = new Date(item.timestamp * 1000);
                        const dateStr = date.toLocaleDateString('pt-BR');
                        return `Price: ${formatCurrency(item.price)} | ${dateStr}`;
                    },
                    label: (context: any) => {
                        const value = context.parsed.y ?? 0;
                        if (groupBy === 'stacked') {
                            return `  Total: ${formatCurrency(value)}`;
                        }
                        const color = context.dataset.label === 'Longs' ? '#10b981' : '#ef4444';
                        return `  ${context.dataset.label}: ${formatCurrency(value)}`;
                    },
                    afterBody: (items: any) => {
                        if (!items.length) return '';
                        const idx = items[0].dataIndex;
                        const item = sortedData[idx];
                        if (!item) return '';
                        const total = item.long_volume + item.short_volume;
                        const ratio = item.long_short_ratio;
                        return [`  ─────────────`, `  Total: ${formatCurrency(total)}`, `  L/S Ratio: ${ratio.toFixed(2)}`];
                    },
                },
            },
            zoom: {
                pan: {
                    enabled: true,
                    mode: 'x',
                },
                zoom: {
                    wheel: {
                        enabled: true,
                    },
                    pinch: {
                        enabled: true,
                    },
                    drag: {
                        enabled: false,
                    },
                    mode: 'x',
                },
            },
        },
        scales: {
            x: {
                stacked: groupBy === 'combined' || groupBy === 'stacked',
                grid: {
                    display: false,
                },
                ticks: {
                    color: '#64748b',
                    font: {
                        size: 11,
                    },
                    maxRotation: 45,
                    maxTicksLimit: 15,
                },
            },
            y: {
                stacked: groupBy === 'combined' || groupBy === 'stacked',
                grid: {
                    display: false,
                },
                ticks: {
                    color: '#64748b',
                    font: {
                        size: 11,
                    },
                    callback: (value: any) => formatCurrency(Number(value)),
                },
            },
        },
    }), [groupBy, sortedData, priceInterval, formatCurrency]);

    return (
        <div className="relative w-full h-full">
            <Chart ref={chartRef} type="bar" data={chartData} options={chartOptions} />
            <button
                onClick={resetZoom}
                className="absolute top-2 right-2 z-10 flex items-center gap-1 px-2 py-1 text-xs bg-slate-800/80 hover:bg-slate-700/80 text-slate-200 rounded-md border border-slate-600 transition-colors"
                title="Reset Zoom"
            >
                <RotateCcw className="h-3 w-3" />
                Reset
            </button>
        </div>
    );
});

export function LiquidationTest() {
    const [apiKey, setApiKey] = useState(() => localStorage.getItem('coinalyze_api_key') || 'FREE');
    const [symbol, setSymbol] = useState(() => localStorage.getItem('liquidation_test_symbol') || 'BTCUSDT_PERP.A');
    const [months, setMonths] = useState(() => Number(localStorage.getItem('liquidation_test_months')) || 12);
    const [priceInterval, setPriceInterval] = useState(() => Number(localStorage.getItem('liquidation_test_price_interval')) || 0);
    const [amountMin, setAmountMin] = useState<string>(() => localStorage.getItem('liquidation_test_amount_min') || '');
    const [amountMax, setAmountMax] = useState<string>(() => localStorage.getItem('liquidation_test_amount_max') || '');
    const [side, setSide] = useState<'all' | 'long' | 'short'>(() => (localStorage.getItem('liquidation_test_side') as 'all' | 'long' | 'short') || 'all');
    const [groupBy, setGroupBy] = useState<'none' | 'long' | 'short' | 'combined' | 'stacked'>(() => (localStorage.getItem('liquidation_test_group_by') as 'none' | 'long' | 'short' | 'combined' | 'stacked') || 'none');
    const [ratioFilter, setRatioFilter] = useState<string>(() => localStorage.getItem('liquidation_test_ratio_filter') || '');
    const [ratioFilterMax, setRatioFilterMax] = useState<string>(() => localStorage.getItem('liquidation_test_ratio_filter_max') || '');
    const [priceRangeMin, setPriceRangeMin] = useState<string>(() => localStorage.getItem('liquidation_test_price_range_min') || '');
    const [priceRangeMax, setPriceRangeMax] = useState<string>(() => localStorage.getItem('liquidation_test_price_range_max') || '');
    const [priceRefreshInterval, setPriceRefreshInterval] = useState(() => Number(localStorage.getItem('liquidation_test_price_refresh')) || 30);
    const [status, setStatus] = useState<{ message: string; type: 'success' | 'error' | 'loading' | null }>({ message: '', type: null });
    // Line styles state with localStorage persistence
    const [lineStyles, setLineStyles] = useState<ChartLineStyles>(() => {
        const saved = localStorage.getItem('liquidation_test_line_styles');
        if (saved) {
            try {
                return { ...defaultLineStyles, ...JSON.parse(saved) };
            } catch {
                return defaultLineStyles;
            }
        }
        return defaultLineStyles;
    });
    const [data, setData] = useState<HistoricalLiquidation[]>([]);
    const [processedData, setProcessedData] = useState<HistoricalLiquidation[]>([]);
    const [currentPrice, setCurrentPrice] = useState<number | null>(null);
    const [lastFetchTime, setLastFetchTime] = useState<number | null>(null);
    const isFetchingPriceRef = useRef(false);

    // Persist line styles to localStorage
    useEffect(() => {
        localStorage.setItem('liquidation_test_line_styles', JSON.stringify(lineStyles));
    }, [lineStyles]);
    const { lastMessage } = useWebSocket();
    const fileInputRef = useRef<HTMLInputElement>(null);

    useEffect(() => {
        localStorage.setItem('coinalyze_api_key', apiKey);
    }, [apiKey]);

    useEffect(() => {
        localStorage.setItem('liquidation_test_symbol', symbol);
    }, [symbol]);

    useEffect(() => {
        localStorage.setItem('liquidation_test_months', String(months));
    }, [months]);

    useEffect(() => {
        localStorage.setItem('liquidation_test_price_interval', String(priceInterval));
    }, [priceInterval]);

    useEffect(() => {
        localStorage.setItem('liquidation_test_amount_min', amountMin);
    }, [amountMin]);

    useEffect(() => {
        localStorage.setItem('liquidation_test_amount_max', amountMax);
    }, [amountMax]);

    useEffect(() => {
        localStorage.setItem('liquidation_test_side', side);
    }, [side]);

    useEffect(() => {
        localStorage.setItem('liquidation_test_group_by', groupBy);
    }, [groupBy]);

    useEffect(() => {
        localStorage.setItem('liquidation_test_ratio_filter', ratioFilter);
    }, [ratioFilter]);

    useEffect(() => {
        localStorage.setItem('liquidation_test_ratio_filter_max', ratioFilterMax);
    }, [ratioFilterMax]);

    useEffect(() => {
        localStorage.setItem('liquidation_test_price_range_min', priceRangeMin);
    }, [priceRangeMin]);

    useEffect(() => {
        localStorage.setItem('liquidation_test_price_range_max', priceRangeMax);
    }, [priceRangeMax]);

    useEffect(() => {
        localStorage.setItem('liquidation_test_price_refresh', String(priceRefreshInterval));
    }, [priceRefreshInterval]);

    const handleExportCSV = () => {
        if (processedData.length === 0) {
            setStatus({ message: 'Nenhum dado para exportar', type: 'error' });
            return;
        }
        const filename = generateExportFilename(symbol, 'csv');
        const exportData = processedData.map(item => ({
            data: format(new Date(item.timestamp * 1000), 'dd/MM/yyyy'),
            timestamp: item.timestamp,
            preco_medio: item.price,
            volume_long: item.long_volume,
            volume_short: item.short_volume,
            volume_total: item.total_volume,
            ratio_long_short: item.long_short_ratio
        }));
        exportToCSV(exportData, filename);
        setStatus({ message: `Dados exportados para ${filename}`, type: 'success' });
    };

    const handleExportJSON = () => {
        if (processedData.length === 0) {
            setStatus({ message: 'Nenhum dado para exportar', type: 'error' });
            return;
        }
        const filename = generateExportFilename(symbol, 'json');
        const exportData = processedData.map(item => ({
            timestamp: item.timestamp,
            date: format(new Date(item.timestamp * 1000), 'dd/MM/yyyy HH:mm:ss'),
            price: item.price,
            long_volume: item.long_volume,
            short_volume: item.short_volume,
            total_volume: item.total_volume,
            long_short_ratio: item.long_short_ratio
        }));
        exportToJSON(exportData, { symbol, months, recordCount: exportData.length }, filename);
        setStatus({ message: `Dados exportados para ${filename}`, type: 'success' });
    };

    const handleImportClick = () => {
        fileInputRef.current?.click();
    };

    const handleFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0];
        if (!file) return;

        try {
            setStatus({ message: 'Importando dados...', type: 'loading' });

            let importedData: any[];
            if (file.name.endsWith('.json')) {
                importedData = await importFromJSON(file);
            } else if (file.name.endsWith('.csv')) {
                importedData = await importFromCSV(file);
            } else {
                setStatus({ message: 'Formato de arquivo não suportado. Use CSV ou JSON.', type: 'error' });
                return;
            }

            if (importedData.length === 0) {
                setStatus({ message: 'Arquivo não contém dados válidos.', type: 'error' });
                return;
            }

            setData(importedData);
            setStatus({ message: `${importedData.length} registros importados com sucesso.`, type: 'success' });
        } catch (error) {
            console.error('Import error:', error);
            setStatus({ message: 'Erro ao importar arquivo. Verifique o formato.', type: 'error' });
        }

        event.target.value = '';
    };

    const formatCurrency = useCallback((value: number) => {
        if (value >= 1_000_000_000) return `$${(value / 1_000_000_000).toFixed(2)}B`;
        if (value >= 1_000_000) return `$${(value / 1_000_000).toFixed(2)}M`;
        if (value >= 1_000) return `$${(value / 1_000).toFixed(2)}K`;
        return `$${value.toFixed(2)}`;
    }, []);

    const aggregateByPriceInterval = (rawData: HistoricalLiquidation[], interval: number) => {
        // 1. First, map the data to respect the side filter (zeroing out the other side)
        const sideAffectedData = rawData.map(item => {
            const long = side === 'short' ? 0 : item.long_volume;
            const short = side === 'long' ? 0 : item.short_volume;
            return {
                ...item,
                long_volume: long,
                short_volume: short,
                total_volume: long + short,
                long_short_ratio: long / (short || 1)
            };
        });

        // 2. Filter out entries with zero total volume if side is specified
        let filtered = sideAffectedData;
        if (side !== 'all') {
            filtered = sideAffectedData.filter(item => item.total_volume > 0);
        }

        if (!interval || interval <= 0) return filtered;

        const aggregated: Record<string, any> = {};

        // Encontrar o menor e maior range de preço para preencher os buracos
        let minRange = Infinity;
        let maxRange = -Infinity;

        filtered.forEach(item => {
            const price = item.price || 0;
            const priceRange = Math.floor(price / interval) * interval;
            minRange = Math.min(minRange, priceRange);
            maxRange = Math.max(maxRange, priceRange);
        });

        // Preencher todos os intervalos possíveis com zero
        if (minRange !== Infinity && maxRange !== -Infinity) {
            // Limite de sanidade para não travar o navegador caso o intervalo seja muito pequeno em relação ao range
            const steps = (maxRange - minRange) / interval;
            if (steps <= 50000) {
                for (let r = minRange; r <= maxRange; r += interval) {
                    // Garantir precisão flutuante
                    const safeR = Number(r.toFixed(8));
                    const safeREnd = Number((r + interval).toFixed(8));
                    const rangeKey = `${safeR}-${safeREnd}`;
                    aggregated[rangeKey] = {
                        priceRange: safeR,
                        priceRangeEnd: safeREnd,
                        long_volume: 0,
                        short_volume: 0,
                        total_volume: 0,
                        count: 0
                    };
                }
            }
        }

        filtered.forEach(item => {
            const price = item.price || 0;
            const priceRange = Number((Math.floor(price / interval) * interval).toFixed(8));
            const priceRangeEnd = Number((priceRange + interval).toFixed(8));
            const rangeKey = `${priceRange}-${priceRangeEnd}`;

            if (!aggregated[rangeKey]) {
                aggregated[rangeKey] = {
                    priceRange: priceRange,
                    priceRangeEnd: priceRangeEnd,
                    long_volume: 0,
                    short_volume: 0,
                    total_volume: 0,
                    count: 0
                };
            }

            aggregated[rangeKey].long_volume += item.long_volume;
            aggregated[rangeKey].short_volume += item.short_volume;
            aggregated[rangeKey].total_volume += item.total_volume;
            aggregated[rangeKey].count += 1;
        });

        return Object.values(aggregated).map(item => ({
            timestamp: item.priceRange,
            price: item.priceRange + (item.priceRangeEnd - item.priceRange) / 2,
            long_volume: item.long_volume,
            short_volume: item.short_volume,
            total_volume: item.total_volume,
            long_short_ratio: item.long_volume / (item.short_volume || 1)
        })).sort((a, b) => a.price - b.price);
    };

    // Function to fetch ONLY the current price without reloading history
    const updateCurrentPrice = async () => {
        if (!symbol || isFetchingPriceRef.current) return;

        // Skip if price was updated recently via WebSocket
        if (lastMessage?.type === 'price' && lastMessage.data.symbol === symbol.replace('_PERP.A', '')) {
            const wsPriceTime = new Date(lastMessage.data.timestamp).getTime();
            if (Date.now() - wsPriceTime < 10000) {
                console.log(`[Auto-Update] Skipping fetch, WS price is fresh: ${lastMessage.data.price}`);
                return;
            }
        }

        isFetchingPriceRef.current = true;
        try {
            // Do NOT pass start_date/end_date here — the system clock is in 2026 and
            // passing Date.now() as timestamps causes Binance to reject the request.
            // api.ts will use a safe limit-only query (limit=365) when no dates are given.
            const response = await pricesApi.getAll({ symbol });

            const priceData = response.data.data || [];
            if (priceData.length > 0) {
                const latestPrice = priceData[priceData.length - 1].price;
                if (latestPrice > 0) {
                    console.log(`[Auto-Update] New price for ${symbol}: ${latestPrice}`);
                    setCurrentPrice(latestPrice);
                }
            }
        } catch (error) {
            console.error('Error auto-updating price:', error);
        } finally {
            isFetchingPriceRef.current = false;
        }
    };

    // Auto-update price effect
    useEffect(() => {
        if (priceRefreshInterval <= 0) return;

        const intervalId = setInterval(updateCurrentPrice, priceRefreshInterval * 1000);
        return () => clearInterval(intervalId);
    }, [symbol, priceRefreshInterval]);

    const fetchLiquidationData = async () => {
        setStatus({ message: 'Fetching liquidation data...', type: 'loading' });

        if (apiKey && apiKey !== 'FREE') {
            localStorage.setItem('coinalyze_api_key', apiKey);
        }

        const end = Math.floor(Date.now() / 1000);
        const start = months === 0 ? end - (10 * 365 * 24 * 60 * 60) : end - (months * 30 * 24 * 60 * 60);

        try {
            const liqResponse = await liquidationsApi.getAll({
                symbol: symbol,
                start_date: new Date(start * 1000).toISOString(),
                end_date: new Date(end * 1000).toISOString(),
                amount_min: 0
            });

            const priceResponse = await pricesApi.getAll({
                symbol: symbol,
                start_date: new Date(start * 1000).toISOString(),
                end_date: new Date(end * 1000).toISOString()
            });

            return {
                liquidation: liqResponse.data.data,
                price: priceResponse.data.data
            };
        } catch (error: any) {
            throw error;
        }
    };

    const { isLoading, refetch, isFromCache, clearCache } = useCacheData({
        cacheKey: `liquidation_${symbol}_${months}`,
        fetchFn: fetchLiquidationData,
        ttlMinutes: 30,
        enabled: true,
        onSuccess: async (result) => {
            const data = result as any;
            if (!data) return;

            const { liquidation, price } = data;

            // liquidation and price are already transformed lists of objects
            const priceData = Array.isArray(price) ? price : [];
            
            // Build a price map with timestamp as key (normalized to start of day)
            // Also keep track of all available timestamps to find nearest if needed
            const priceMap = new Map();
            const sortedPrices = [...priceData].sort((a: any, b: any) => Number(a.timestamp) - Number(b.timestamp));
            
            sortedPrices.forEach((p: any) => {
                const ts = Number(p.timestamp);
                const dateKey = new Date(ts * 1000).toISOString().split('T')[0];
                priceMap.set(dateKey, p.price);
            });

            const mapped: HistoricalLiquidation[] = liquidation.map((item: any) => {
                const timestamp = Number(item.timestamp);
                const itemPrice = Number(item.price);

                // Use historical price from priceMap if available
                const dateKey = new Date(timestamp * 1000).toISOString().split('T')[0];
                let price = priceMap.get(dateKey);
                
                // Fallback 1: If no exact date match, look for nearest historical price
                if (price === undefined && sortedPrices.length > 0) {
                    // Simple binary search or find nearest
                    let nearest = sortedPrices[0];
                    let minDiff = Math.abs(Number(nearest.timestamp) - timestamp);
                    
                    for (const p of sortedPrices) {
                        const diff = Math.abs(Number(p.timestamp) - timestamp);
                        if (diff < minDiff) {
                            minDiff = diff;
                            nearest = p;
                        } else if (diff > minDiff) {
                            // Since it's sorted, we can stop once diff starts increasing
                            break;
                        }
                    }
                    
                    // Only use nearest if it's within a reasonable range (e.g., 7 days)
                    if (minDiff <= 7 * 24 * 60 * 60) {
                        price = nearest.price;
                        console.log(`[DEBUG] No exact price match for ${dateKey}, using nearest: ${new Date(Number(nearest.timestamp) * 1000).toISOString().split('T')[0]}`);
                    }
                }
                
                // Fallback 2: Use item.price (which might be the current price from Binance fetched in api.ts)
                if (price === undefined || price === 0) {
                    price = itemPrice;
                }

                // Use long_volume and short_volume from API if available, otherwise calculate from side
                const longVolume = item.long_volume !== undefined ? item.long_volume : (item.side === 'long' ? item.amount : 0);
                const shortVolume = item.short_volume !== undefined ? item.short_volume : (item.side === 'short' ? item.amount : 0);

                return {
                    timestamp: timestamp,
                    long_volume: longVolume,
                    short_volume: shortVolume,
                    total_volume: item.amount,
                    long_short_ratio: longVolume / (shortVolume || 1),
                    price: price
                };
            });

            setData(mapped);

            // Set current price from the last price data entry
            if (priceData.length > 0) {
                setCurrentPrice(Number(priceData[priceData.length - 1].price || 0));
            }

            setLastFetchTime(Date.now());
            setStatus({
                message: isFromCache
                    ? `Dados carregados do cache (${mapped.length} registros).`
                    : `Dados carregados (${mapped.length} registros).`,
                type: 'success'
            });
        },
        onError: (error) => {
            console.error('Fetch error:', error);
            const errorMessage = error?.message || error?.toString() || 'Error fetching data';
            let enhancedMessage = errorMessage;

            if (errorMessage.includes('Network Error') || errorMessage.includes('403') || errorMessage.includes('CERT')) {
                enhancedMessage = `${errorMessage}. This is likely a CORS or SSL proxy issue.`;

                // Check for future clock issues (common in simulated environments)
                if (new Date().getFullYear() > 2025) {
                    enhancedMessage += " NOTE: Your system clock is set to 2026+, which may cause SSL certificates to appear expired. Please check your system time.";
                } else {
                    enhancedMessage += " Please check your internet connection or try again later.";
                }
            }

            setStatus({ message: enhancedMessage, type: 'error' });
        }
    });

    useEffect(() => {
        const min = amountMin && !isNaN(parseFloat(amountMin)) ? parseFloat(amountMin) : 0;
        const max = amountMax && !isNaN(parseFloat(amountMax)) ? parseFloat(amountMax) : Infinity;
        const ratioMin = ratioFilter && !isNaN(parseFloat(ratioFilter)) ? parseFloat(ratioFilter) : null;
        const ratioMax = ratioFilterMax && !isNaN(parseFloat(ratioFilterMax)) ? parseFloat(ratioFilterMax) : null;

        // First filter by min/max amount
        let amountFiltered = data.filter(item =>
            item.total_volume >= min && (max === Infinity || item.total_volume <= max)
        );

        // Then filter by ratio if specified
        if (ratioMin !== null || ratioMax !== null) {
            amountFiltered = amountFiltered.filter(item => {
                const ratio = item.long_short_ratio;
                if (ratioMin !== null && ratio < ratioMin) return false;
                if (ratioMax !== null && ratio > ratioMax) return false;
                return true;
            });
        }

        setProcessedData(aggregateByPriceInterval(amountFiltered, priceInterval));
    }, [data, priceInterval, side, amountMin, amountMax, ratioFilter, ratioFilterMax]);

    // Filter data for chart display based on groupBy selection and price range
    const chartData = useMemo(() => {
        let filteredData = processedData;

        // Apply price range filter if both min and max are provided
        const minPrice = priceRangeMin && !isNaN(parseFloat(priceRangeMin)) ? parseFloat(priceRangeMin) : null;
        const maxPrice = priceRangeMax && !isNaN(parseFloat(priceRangeMax)) ? parseFloat(priceRangeMax) : null;

        if (minPrice !== null && maxPrice !== null) {
            const actualMin = Math.min(minPrice, maxPrice);
            const actualMax = Math.max(minPrice, maxPrice);
            filteredData = filteredData.filter(item => item.price >= actualMin && item.price <= actualMax);
        }

        if (groupBy === 'none' || groupBy === 'combined' || groupBy === 'stacked') {
            return filteredData;
        }
        return filteredData.map(item => ({
            ...item,
            long_volume: groupBy === 'long' ? item.long_volume : 0,
            short_volume: groupBy === 'short' ? item.short_volume : 0,
            total_volume: groupBy === 'long' ? item.long_volume : groupBy === 'short' ? item.short_volume : item.total_volume
        }));
    }, [processedData, groupBy, priceRangeMin, priceRangeMax]);

    const stats = {
        totalRecords: processedData.length,
        totalVolume: processedData.reduce((sum, item) => sum + item.total_volume, 0),
        avgVolume: processedData.length > 0 ? processedData.reduce((sum, item) => sum + item.total_volume, 0) / processedData.length : 0,
        maxVolume: processedData.length > 0 ? Math.max(...processedData.map(item => item.total_volume)) : 0
    };

    return (
        <div className="space-y-6">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                <div>
                    <h2 className="text-2xl font-bold">Resumo Histórico Coinalyze</h2>
                    <p className="text-muted-foreground">Análise de volume de liquidação por faixa de preço</p>
                </div>
                <div className="flex items-center gap-2">
                    <button
                        onClick={() => refetch(true)}
                        disabled={isLoading}
                        className="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
                    >
                        {isLoading ? <RefreshCw className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
                        Atualizar Dados
                    </button>
                    {isFromCache && (
                        <button
                            onClick={() => refetch(true)}
                            disabled={isLoading}
                            className="inline-flex items-center gap-2 rounded-md bg-secondary px-4 py-2 text-sm font-medium hover:bg-secondary/80 disabled:opacity-50"
                        >
                            <Clock className="h-4 w-4" />
                            Forçar Refresh
                        </button>
                    )}
                    <div className="w-px h-6 bg-border mx-1" />
                    <button
                        onClick={handleExportCSV}
                        disabled={processedData.length === 0}
                        className="inline-flex items-center gap-2 rounded-md bg-green-600 px-3 py-2 text-sm font-medium text-white hover:bg-green-700 disabled:opacity-50"
                    >
                        <Download className="h-4 w-4" />
                        CSV
                    </button>
                    <button
                        onClick={handleExportJSON}
                        disabled={processedData.length === 0}
                        className="inline-flex items-center gap-2 rounded-md bg-blue-600 px-3 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
                    >
                        <Download className="h-4 w-4" />
                        JSON
                    </button>
                    <button
                        onClick={handleImportClick}
                        className="inline-flex items-center gap-2 rounded-md bg-orange-600 px-3 py-2 text-sm font-medium text-white hover:bg-orange-700"
                    >
                        <Upload className="h-4 w-4" />
                        Importar
                    </button>
                    <input
                        ref={fileInputRef}
                        type="file"
                        accept=".csv,.json"
                        onChange={handleFileChange}
                        className="hidden"
                    />
                </div>
            </div>

            <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4">
                <Card>
                    <CardContent className="p-4 flex items-center justify-between">
                        <div>
                            <p className="text-xs font-medium text-muted-foreground">Quantidade de Dias</p>
                            <p className="text-xl font-bold">{stats.totalRecords}</p>
                        </div>
                        <Activity className="h-8 w-8 text-blue-500 opacity-20" />
                    </CardContent>
                </Card>
                <Card>
                    <CardContent className="p-4 flex items-center justify-between">
                        <div>
                            <p className="text-xs font-medium text-muted-foreground">Volume Acumulado</p>
                            <p className="text-xl font-bold">{formatCurrency(stats.totalVolume)}</p>
                        </div>
                        <DollarSign className="h-8 w-8 text-green-500 opacity-20" />
                    </CardContent>
                </Card>
                <Card>
                    <CardContent className="p-4 flex items-center justify-between">
                        <div>
                            <p className="text-xs font-medium text-muted-foreground">Volume Médio (Dia)</p>
                            <p className="text-xl font-bold">{formatCurrency(stats.avgVolume)}</p>
                        </div>
                        <TrendingUp className="h-8 w-8 text-yellow-500 opacity-20" />
                    </CardContent>
                </Card>
                <Card>
                    <CardContent className="p-4 flex items-center justify-between">
                        <div>
                            <p className="text-xs font-medium text-muted-foreground">Pico de Volume</p>
                            <p className="text-xl font-bold">{formatCurrency(stats.maxVolume)}</p>
                        </div>
                        <TrendingDown className="h-8 w-8 text-red-500 opacity-20" />
                    </CardContent>
                </Card>
            </div>

            <Card>
                <CardHeader title="Filtros de Análise" description="Configure os parâmetros da consulta e filtros de exibição" />
                <CardContent className="space-y-4">
                    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
                        <div className="space-y-2">
                            <label className="text-sm font-medium">Símbolo</label>
                            <select
                                value={symbol}
                                onChange={(e) => setSymbol(e.target.value)}
                                className="w-full h-9 rounded-md border border-input bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-ring"
                            >
                                <option value="BTCUSDT_PERP.A">BTC/USDT Perpetual (Binance)</option>
                                <option value="ETHUSDT_PERP.A">ETH/USDT Perpetual (Binance)</option>
                                <option value="SOLUSDT_PERP.A">SOL/USDT Perpetual (Binance)</option>
                                <option value="XRPUSDT_PERP.A">XRP/USDT Perpetual (Binance)</option>
                            </select>
                        </div>
                        <div className="space-y-2">
                            <label className="text-sm font-medium">Período</label>
                            <select
                                value={months}
                                onChange={(e) => setMonths(Number(e.target.value))}
                                className="w-full h-9 rounded-md border border-input bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-ring"
                            >
                                <option value={1}>Último Mês</option>
                                <option value={3}>3 Meses</option>
                                <option value={6}>6 Meses</option>
                                <option value={12}>12 Meses</option>
                                <option value={24}>2 Anos</option>
                                <option value={36}>3 Anos</option>
                                <option value={48}>4 Anos</option>
                                <option value={120}>10 Anos</option>
                                <option value={0}>Máximo Disponível</option>
                            </select>
                        </div>
                        <div className="space-y-2">
                            <label className="text-sm font-medium">Valor Mínimo ($)</label>
                            <input
                                type="number"
                                value={amountMin}
                                onChange={(e) => setAmountMin(e.target.value)}
                                placeholder="Ex: 1000000"
                                className="w-full h-9 rounded-md border border-input bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-ring"
                            />
                        </div>
                        <div className="space-y-2">
                            <label className="text-sm font-medium">Valor Máximo ($)</label>
                            <input
                                type="number"
                                value={amountMax}
                                onChange={(e) => setAmountMax(e.target.value)}
                                placeholder="Ex: 50000000"
                                className="w-full h-9 rounded-md border border-input bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-ring"
                            />
                        </div>
                        <div className="space-y-2">
                            <label className="text-sm font-medium">Atualizar Preço (segundos)</label>
                            <input
                                type="number"
                                value={priceRefreshInterval}
                                onChange={(e) => setPriceRefreshInterval(Number(e.target.value))}
                                placeholder="30"
                                className="w-full h-9 rounded-md border border-input bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-ring"
                            />
                            <p className="text-[10px] text-muted-foreground">Tempo para atualizar a linha vermelha (0 para parar)</p>
                        </div>
                    </div>

                    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4 pt-2 border-t border-border">
                        <div className="space-y-2">
                            <label className="text-sm font-medium">Lado da Liquidação</label>
                            <div className="flex gap-2">
                                {(['all', 'long', 'short'] as const).map((s) => (
                                    <button
                                        key={s}
                                        onClick={() => setSide(s)}
                                        className={`flex-1 h-9 rounded-md text-xs font-semibold capitalize transition-all ${side === s
                                            ? 'bg-primary text-primary-foreground'
                                            : 'bg-muted text-muted-foreground hover:bg-accent'
                                            }`}
                                    >
                                        {s === 'all' ? 'Ambos' : s === 'long' ? 'Comprados' : 'Vendidos'}
                                    </button>
                                ))}
                            </div>
                        </div>
                        <div className="space-y-2">
                            <label className="text-sm font-medium">Agrupar Por</label>
                            <select
                                value={groupBy}
                                onChange={(e) => setGroupBy(e.target.value as 'none' | 'long' | 'short' | 'combined' | 'stacked')}
                                className="w-full h-9 rounded-md border border-input bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-ring"
                            >
                                <option value="none">Todos (Long + Short)</option>
                                <option value="long">Apenas Long</option>
                                <option value="short">Apenas Short</option>
                                <option value="combined">Combinado (Empilhado)</option>
                                <option value="stacked">Agrupado (1 Cor)</option>
                            </select>
                        </div>
                        <div className="space-y-2">
                            <label className="text-sm font-medium">Intervalo de Agrupamento ($)</label>
                            <input
                                type="number"
                                value={priceInterval}
                                onChange={(e) => setPriceInterval(Number(e.target.value))}
                                placeholder="0 para sem agrupamento"
                                className="w-full h-9 rounded-md border border-input bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-ring"
                            />
                            <p className="text-[10px] text-muted-foreground">Útil para ver volumes por faixas de preço específicas</p>
                        </div>

                        {/* Line Styles Configuration */}
                        <div className="space-y-3 border-t border-border pt-4 mt-4">
                            <label className="text-sm font-medium">Estilo das Linhas de 1000</label>
                            <div className="grid grid-cols-3 gap-2">
                                <div className="space-y-1">
                                    <label className="text-[10px] text-muted-foreground">Cor</label>
                                    <div className="flex items-center gap-2">
                                        <input
                                            type="color"
                                            value={lineStyles.thousandLines.color}
                                            onChange={(e) => setLineStyles(prev => ({
                                                ...prev,
                                                thousandLines: { ...prev.thousandLines, color: e.target.value }
                                            }))}
                                            className="w-8 h-8 rounded cursor-pointer"
                                        />
                                        <span className="text-xs text-muted-foreground">{lineStyles.thousandLines.color}</span>
                                    </div>
                                </div>
                                <div className="space-y-1">
                                    <label className="text-[10px] text-muted-foreground">Espessura</label>
                                    <input
                                        type="number"
                                        min="0.5"
                                        max="10"
                                        step="0.5"
                                        value={lineStyles.thousandLines.width}
                                        onChange={(e) => setLineStyles(prev => ({
                                            ...prev,
                                            thousandLines: { ...prev.thousandLines, width: Number(e.target.value) }
                                        }))}
                                        className="w-full h-8 rounded-md border border-input bg-background px-2 text-sm outline-none focus:ring-2 focus:ring-ring"
                                    />
                                </div>
                                <div className="space-y-1">
                                    <label className="text-[10px] text-muted-foreground">Traço</label>
                                    <select
                                        value={lineStyles.thousandLines.dash?.join(',') || 'solid'}
                                        onChange={(e) => setLineStyles(prev => ({
                                            ...prev,
                                            thousandLines: {
                                                ...prev.thousandLines,
                                                dash: e.target.value === 'solid' ? [] : e.target.value.split(',').map(Number)
                                            }
                                        }))}
                                        className="w-full h-8 rounded-md border border-input bg-background px-2 text-sm outline-none focus:ring-2 focus:ring-ring"
                                    >
                                        <option value="solid">Sólido</option>
                                        <option value="3,3">Tracejado</option>
                                        <option value="5,5">Tracejado Longo</option>
                                        <option value="10,5">Ponto-Tracejado</option>
                                        <option value="2,2">Pontilhado</option>
                                    </select>
                                </div>
                            </div>
                        </div>

                        <div className="space-y-3 border-t border-border pt-4">
                            <label className="text-sm font-medium">Estilo da Linha de Cotação BTC</label>
                            <div className="grid grid-cols-3 gap-2">
                                <div className="space-y-1">
                                    <label className="text-[10px] text-muted-foreground">Cor</label>
                                    <div className="flex items-center gap-2">
                                        <input
                                            type="color"
                                            value={lineStyles.btcQuoteLine.color}
                                            onChange={(e) => setLineStyles(prev => ({
                                                ...prev,
                                                btcQuoteLine: { ...prev.btcQuoteLine, color: e.target.value }
                                            }))}
                                            className="w-8 h-8 rounded cursor-pointer"
                                        />
                                        <span className="text-xs text-muted-foreground">{lineStyles.btcQuoteLine.color}</span>
                                    </div>
                                </div>
                                <div className="space-y-1">
                                    <label className="text-[10px] text-muted-foreground">Espessura</label>
                                    <input
                                        type="number"
                                        min="0.5"
                                        max="10"
                                        step="0.5"
                                        value={lineStyles.btcQuoteLine.width}
                                        onChange={(e) => setLineStyles(prev => ({
                                            ...prev,
                                            btcQuoteLine: { ...prev.btcQuoteLine, width: Number(e.target.value) }
                                        }))}
                                        className="w-full h-8 rounded-md border border-input bg-background px-2 text-sm outline-none focus:ring-2 focus:ring-ring"
                                    />
                                </div>
                                <div className="space-y-1">
                                    <label className="text-[10px] text-muted-foreground">Traço</label>
                                    <select
                                        value={lineStyles.btcQuoteLine.dash?.join(',') || 'solid'}
                                        onChange={(e) => setLineStyles(prev => ({
                                            ...prev,
                                            btcQuoteLine: {
                                                ...prev.btcQuoteLine,
                                                dash: e.target.value === 'solid' ? [] : e.target.value.split(',').map(Number)
                                            }
                                        }))}
                                        className="w-full h-8 rounded-md border border-input bg-background px-2 text-sm outline-none focus:ring-2 focus:ring-ring"
                                    >
                                        <option value="solid">Sólido</option>
                                        <option value="3,3">Tracejado</option>
                                        <option value="5,5">Tracejado Longo</option>
                                        <option value="10,5">Ponto-Tracejado</option>
                                        <option value="2,2">Pontilhado</option>
                                    </select>
                                </div>
                            </div>
                            <button
                                onClick={() => setLineStyles(defaultLineStyles)}
                                className="w-full h-8 rounded-md bg-muted text-xs text-muted-foreground hover:bg-accent transition-colors"
                            >
                                Restaurar Padrões
                            </button>
                        </div>
                        <div className="space-y-2">
                            <label className="text-sm font-medium">Taxa L/S (Min - Max)</label>
                            <div className="flex gap-2">
                                <input
                                    type="number"
                                    value={ratioFilter}
                                    onChange={(e) => setRatioFilter(e.target.value)}
                                    placeholder="Min"
                                    className="w-full h-9 rounded-md border border-input bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-ring"
                                />
                                <input
                                    type="number"
                                    value={ratioFilterMax}
                                    onChange={(e) => setRatioFilterMax(e.target.value)}
                                    placeholder="Max"
                                    className="w-full h-9 rounded-md border border-input bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-ring"
                                />
                            </div>
                            <p className="text-[10px] text-muted-foreground">Filtrar por faixa de taxa Long/Short</p>
                        </div>
                        <div className="space-y-2">
                            <label className="text-sm font-medium">Faixa de Preço (Min - Max)</label>
                            <div className="flex gap-2">
                                <input
                                    type="number"
                                    value={priceRangeMin}
                                    onChange={(e) => setPriceRangeMin(e.target.value)}
                                    placeholder="Mínimo"
                                    className="w-full h-9 rounded-md border border-input bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-ring"
                                />
                                <input
                                    type="number"
                                    value={priceRangeMax}
                                    onChange={(e) => setPriceRangeMax(e.target.value)}
                                    placeholder="Máximo"
                                    className="w-full h-9 rounded-md border border-input bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-ring"
                                />
                            </div>
                            <p className="text-[10px] text-muted-foreground">Definir escala do eixo X do gráfico</p>
                        </div>
                    </div>
                </CardContent>
            </Card>

            {status.type && (
                <div className={`p-4 rounded-md text-sm ${status.type === 'success' ? 'bg-green-500/10 text-green-500' :
                    status.type === 'error' ? 'bg-red-500/10 text-red-500' :
                        'bg-yellow-500/10 text-yellow-500'
                    }`}>
                    {status.message}
                </div>
            )}

            {processedData.length > 0 && (
                <>
                    <Card>
                        <CardHeader title="Volume de Liquidação por Preço" description="Distribuição de Longs vs Shorts" />
                        <CardContent className="h-[400px]">
                            <LiquidationChart
                                data={chartData}
                                formatCurrency={formatCurrency}
                                groupBy={groupBy}
                                currentPrice={currentPrice}
                                priceInterval={priceInterval}
                                lineStyles={lineStyles}
                            />
                        </CardContent>
                        {currentPrice && (
                            <div className="pb-4 flex justify-center">
                                <span className="text-sm font-semibold text-red-500">
                                    BTC: ${currentPrice.toLocaleString()}
                                </span>
                            </div>
                        )}
                    </Card>

                    <Card>
                        <CardHeader title="Tabela de Dados" description="Resultados detalhados da consulta" />
                        <CardContent className="p-0">
                            <div className="overflow-x-auto">
                                <table className="w-full">
                                    <thead>
                                        <tr className="border-b border-border bg-muted/50 text-xs font-medium uppercase text-muted-foreground">
                                            <th className="px-6 py-3 text-left">Data/Preço</th>
                                            <th className="px-6 py-3 text-left">Volume Long</th>
                                            <th className="px-6 py-3 text-left">Volume Short</th>
                                            <th className="px-6 py-3 text-left">Total</th>
                                            <th className="px-6 py-3 text-left">L/S Ratio</th>
                                            <th className="px-6 py-3 text-left">Preço Médio</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-border">
                                        {processedData.slice().reverse().slice(0, 50).map((item, idx) => (
                                            <tr key={idx} className="hover:bg-muted/50 transition-colors">
                                                <td className="px-6 py-4 text-sm">
                                                    {priceInterval > 0 ? `Faixa ${formatCurrency(item.timestamp)}` : format(new Date(item.timestamp * 1000), 'dd/MM/yyyy')}
                                                </td>
                                                <td className="px-6 py-4 text-sm text-green-500 font-medium">{formatCurrency(item.long_volume)}</td>
                                                <td className="px-6 py-4 text-sm text-red-500 font-medium">{formatCurrency(item.short_volume)}</td>
                                                <td className="px-6 py-4 text-sm font-semibold">{formatCurrency(item.total_volume)}</td>
                                                <td className="px-6 py-4 text-sm">{item.long_short_ratio.toFixed(2)}</td>
                                                <td className="px-6 py-4 text-sm text-muted-foreground">{formatCurrency(item.price)}</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </CardContent>
                    </Card>
                </>
            )}
        </div>
    );
}
