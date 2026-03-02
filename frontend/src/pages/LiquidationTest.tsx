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
    gridLineInterval?: number;
    stdDevData?: {
        mean: number;
        stdDev: number;
        regions: { sd0_25: [number, number]; sd0_5: [number, number]; sd1: [number, number]; sd2: [number, number]; sd3: [number, number] };
    } | null;
    showMeanLine?: boolean;
    showSD0_25?: boolean;
    showSD0_5?: boolean;
    showSD1?: boolean;
    showSD2?: boolean;
    showSD3?: boolean;
}

const LiquidationChart = memo(function LiquidationChart({
    data,
    formatCurrency,
    groupBy = 'none',
    currentPrice,
    priceInterval,
    lineStyles = defaultLineStyles,
    gridLineInterval = 1000,
    stdDevData,
    showMeanLine = true,
    showSD0_25 = false,
    showSD0_5 = false,
    showSD1 = true,
    showSD2 = true,
    showSD3 = true
}: LiquidationChartProps) {
    const chartRef = useRef<any>(null);

    const resetZoom = () => {
        if (chartRef.current) {
            chartRef.current.resetZoom();
        }
    };

    // Sort data by price for proper x-axis ordering - memoized to prevent unnecessary re-renders
    const sortedData = useMemo(() => [...data].sort((a, b) => a.price - b.price), [data]);

    // Centralized yMax calculation for all vertical lines
    const yMax = useMemo(() => {
        if (sortedData.length === 0) return 0;
        const maxVolume = Math.max(...sortedData.map(d => d.long_volume + d.short_volume));
        return maxVolume * 1.1;
    }, [sortedData]);

    // Memoize vertical lines at multiples of gridLineInterval - only recalculates when sortedData changes
    // NOT when currentPrice changes, avoiding unnecessary re-renders
    // OPTIMIZATION: Uses a single dataset with segments instead of multiple datasets
    const verticalLinesDataset = useMemo(() => {
        if (sortedData.length === 0 || gridLineInterval <= 0) return null;

        // Create labels array for lookup (same as used in the chart)
        const priceLabels = sortedData.map(d => formatCurrency(d.price));

        // Get the price range of the displayed data
        const minDataPrice = sortedData[0].price;
        const maxDataPrice = sortedData[sortedData.length - 1].price;

        // Calculate multiples of gridLineInterval within the data range
        const firstMultiple = Math.ceil(minDataPrice / gridLineInterval) * gridLineInterval;
        const lastMultiple = Math.floor(maxDataPrice / gridLineInterval) * gridLineInterval;

        // Build a single dataset with all vertical line segments
        const lineData: any[] = [];

        // Add vertical line for each multiple of gridLine interval
        for (let multiple = firstMultiple; multiple <= lastMultiple; multiple += gridLineInterval) {
            // Find the index closest to this price multiple
            const prices = sortedData.map(d => d.price);
            const closestIndex = prices.reduce((closestIdx, price, idx) => {
                return Math.abs(price - multiple) < Math.abs(prices[closestIdx] - multiple) ? idx : closestIdx;
            }, 0);

            // Use the formatted label string as x value for category scale alignment
            const closestLabel = priceLabels[closestIndex];

            // Add two points for the vertical line (bottom to top)
            lineData.push(
                { x: closestLabel, y: 0 },
                { x: closestLabel, y: yMax }
            );

            // Add null to create a gap before the next line
            if (multiple + gridLineInterval <= lastMultiple) {
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
            yAxisID: 'y-markers',
            xAxisID: 'x',
            order: 0,
            spanGaps: false, // Important: creates separate segments for each vertical line
        };
    }, [sortedData, yMax, lineStyles.thousandLines, gridLineInterval]);

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
            // Get the price range of the displayed data
            const minDataPrice = sortedData[0].price;
            const maxDataPrice = sortedData[sortedData.length - 1].price;

            // Only draw the line if current price is within or near the displayed data range
            const priceMargin = (maxDataPrice - minDataPrice) * 0.05;

            if (currentPrice >= minDataPrice - priceMargin && currentPrice <= maxDataPrice + priceMargin) {
                // Create labels array for lookup
                const priceLabels = sortedData.map(d => formatCurrency(d.price));

                // Find the index closest to current price for vertical line placement
                const prices = sortedData.map(d => d.price);
                const closestIndex = prices.reduce((closestIdx, price, idx) => {
                    return Math.abs(price - currentPrice) < Math.abs(prices[closestIdx] - currentPrice) ? idx : closestIdx;
                }, 0);

                const closestLabel = priceLabels[closestIndex];

                // Create a vertical line using label for alignment
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
                    yAxisID: 'y-markers',
                    xAxisID: 'x',
                    order: 0,
                    showLine: true, // Connect points with a line to create vertical line
                });
            }
        }

        // Add standard deviation regions and mean line if data is available
        if (stdDevData && sortedData.length > 0) {
            const prices = sortedData.map(d => d.price);
            const priceLabels = sortedData.map(d => formatCurrency(d.price));

            // Helper function to find closest label for a price
            const findClosestLabel = (targetPrice: number) => {
                const closestIndex = prices.reduce((closestIdx, price, idx) => {
                    return Math.abs(price - targetPrice) < Math.abs(prices[closestIdx] - targetPrice) ? idx : closestIdx;
                }, 0);
                return priceLabels[closestIndex];
            };

            const { mean, regions } = stdDevData;
            const dataMin = Math.min(...prices);
            const dataMax = Math.max(...prices);

            // Add mean line (purple solid) - only if enabled
            if (showMeanLine && mean >= dataMin && mean <= dataMax) {
                const meanLabel = findClosestLabel(mean);
                datasets.push({
                    type: 'scatter' as const,
                    label: 'Média',
                    data: [
                        { x: meanLabel, y: 0 },
                        { x: meanLabel, y: yMax },
                    ],
                    borderColor: '#8b5cf6', // Purple
                    backgroundColor: 'transparent',
                    borderWidth: 2,
                    pointRadius: 0,
                    pointHoverRadius: 0,
                    yAxisID: 'y-markers',
                    xAxisID: 'x',
                    order: 0,
                    showLine: true,
                });
            }

            // Add ±0.25σ region boundaries (pink) - only if enabled
            if (showSD0_25) {
                const sd0_25MinLabel = findClosestLabel(regions.sd0_25[0]);
                const sd0_25MaxLabel = findClosestLabel(regions.sd0_25[1]);
                datasets.push({
                    type: 'scatter' as const,
                    label: '±0.25σ (20%)',
                    data: [
                        { x: sd0_25MinLabel, y: 0 },
                        { x: sd0_25MinLabel, y: yMax },
                        { x: null, y: null },
                        { x: sd0_25MaxLabel, y: 0 },
                        { x: sd0_25MaxLabel, y: yMax },
                    ],
                    borderColor: '#ec4899', // Pink
                    backgroundColor: 'transparent',
                    borderWidth: 2,
                    borderDash: [2, 2],
                    pointRadius: 0,
                    pointHoverRadius: 0,
                    yAxisID: 'y-markers',
                    xAxisID: 'x',
                    order: 0,
                    showLine: true,
                    spanGaps: false,
                });
            }

            // Add ±0.5σ region boundaries (cyan) - only if enabled
            if (showSD0_5) {
                const sd0_5MinLabel = findClosestLabel(regions.sd0_5[0]);
                const sd0_5MaxLabel = findClosestLabel(regions.sd0_5[1]);
                datasets.push({
                    type: 'scatter' as const,
                    label: '±0.5σ (38%)',
                    data: [
                        { x: sd0_5MinLabel, y: 0 },
                        { x: sd0_5MinLabel, y: yMax },
                        { x: null, y: null },
                        { x: sd0_5MaxLabel, y: 0 },
                        { x: sd0_5MaxLabel, y: yMax },
                    ],
                    borderColor: '#06b6d4', // Cyan
                    backgroundColor: 'transparent',
                    borderWidth: 2,
                    borderDash: [3, 3],
                    pointRadius: 0,
                    pointHoverRadius: 0,
                    yAxisID: 'y-markers',
                    xAxisID: 'x',
                    order: 0,
                    showLine: true,
                    spanGaps: false,
                });
            }

            // Add ±1σ region boundaries (green) - only if enabled
            if (showSD1) {
                const sd1MinLabel = findClosestLabel(regions.sd1[0]);
                const sd1MaxLabel = findClosestLabel(regions.sd1[1]);
                datasets.push({
                    type: 'scatter' as const,
                    label: '±1σ (68%)',
                    data: [
                        { x: sd1MinLabel, y: 0 },
                        { x: sd1MinLabel, y: yMax },
                        { x: null, y: null },
                        { x: sd1MaxLabel, y: 0 },
                        { x: sd1MaxLabel, y: yMax },
                    ],
                    borderColor: '#10b981', // Green
                    backgroundColor: 'transparent',
                    borderWidth: 2,
                    borderDash: [5, 5],
                    pointRadius: 0,
                    pointHoverRadius: 0,
                    yAxisID: 'y-markers',
                    xAxisID: 'x',
                    order: 0,
                    showLine: true,
                    spanGaps: false,
                });
            }

            // Add ±2σ region boundaries (yellow) - only if enabled
            if (showSD2) {
                const sd2MinLabel = findClosestLabel(regions.sd2[0]);
                const sd2MaxLabel = findClosestLabel(regions.sd2[1]);
                datasets.push({
                    type: 'scatter' as const,
                    label: '±2σ (95%)',
                    data: [
                        { x: sd2MinLabel, y: 0 },
                        { x: sd2MinLabel, y: yMax },
                        { x: null, y: null },
                        { x: sd2MaxLabel, y: 0 },
                        { x: sd2MaxLabel, y: yMax },
                    ],
                    borderColor: '#f59e0b', // Yellow/Orange
                    backgroundColor: 'transparent',
                    borderWidth: 2,
                    borderDash: [8, 4],
                    pointRadius: 0,
                    pointHoverRadius: 0,
                    yAxisID: 'y-markers',
                    xAxisID: 'x',
                    order: 0,
                    showLine: true,
                    spanGaps: false,
                });
            }

            // Add ±3σ region boundaries (red) - only if enabled
            if (showSD3) {
                const sd3MinLabel = findClosestLabel(regions.sd3[0]);
                const sd3MaxLabel = findClosestLabel(regions.sd3[1]);
                datasets.push({
                    type: 'scatter' as const,
                    label: '±3σ (99.7%)',
                    data: [
                        { x: sd3MinLabel, y: 0 },
                        { x: sd3MinLabel, y: yMax },
                        { x: null, y: null },
                        { x: sd3MaxLabel, y: 0 },
                        { x: sd3MaxLabel, y: yMax },
                    ],
                    borderColor: '#ef4444', // Red
                    backgroundColor: 'transparent',
                    borderWidth: 2,
                    borderDash: [10, 5, 2, 5],
                    pointRadius: 0,
                    pointHoverRadius: 0,
                    yAxisID: 'y-markers',
                    xAxisID: 'x',
                    order: 0,
                    showLine: true,
                    spanGaps: false,
                });
            }
        }

        return {
            labels,
            datasets,
        };
    }, [sortedData, groupBy, formatCurrency, currentPrice, verticalLinesDataset, lineStyles, stdDevData, showMeanLine, showSD0_25, showSD0_5, showSD1, showSD2, showSD3, yMax]);

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
            'y-markers': {
                display: false, // Hide numeric labels for markers
                stacked: false, // DO NOT stack marker datasets
                min: 0,
                max: yMax,
            },
        },
    }), [groupBy, sortedData, priceInterval, formatCurrency, yMax]);

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
    const [gridLineInterval, setGridLineInterval] = useState(() => Number(localStorage.getItem('liquidation_test_grid_line_interval')) || 1000);
    const [smartIntervalEnabled, setSmartIntervalEnabled] = useState(() => localStorage.getItem('liquidation_test_smart_interval_enabled') === 'true');
    const [fixedIntervalCount, setFixedIntervalCount] = useState(() => Number(localStorage.getItem('liquidation_test_fixed_interval_count')) || 50);
    const [useFixedIntervalCount, setUseFixedIntervalCount] = useState(() => localStorage.getItem('liquidation_test_use_fixed_interval_count') === 'true');
    const [adaptiveScope, setAdaptiveScope] = useState<'complete' | 'range'>(() => {
        const saved = localStorage.getItem('liquidation_test_adaptive_scope');
        return saved === 'range' ? 'range' : 'complete';
    });
    // Normal Distribution Analysis State
    const [normalDistributionEnabled, setNormalDistributionEnabled] = useState(() => localStorage.getItem('liquidation_test_normal_distribution_enabled') === 'true');
    const [stdDevData, setStdDevData] = useState<{
        mean: number;
        stdDev: number;
        regions: { sd0_25: [number, number]; sd0_5: [number, number]; sd1: [number, number]; sd2: [number, number]; sd3: [number, number] };
    } | null>(null);
    // Individual deviation display toggles
    const [showMeanLine, setShowMeanLine] = useState(() => localStorage.getItem('liquidation_test_show_mean') !== 'false');
    const [showSD0_25, setShowSD0_25] = useState(() => localStorage.getItem('liquidation_test_show_sd0_25') === 'true');
    const [showSD0_5, setShowSD0_5] = useState(() => localStorage.getItem('liquidation_test_show_sd0_5') === 'true');
    const [showSD1, setShowSD1] = useState(() => localStorage.getItem('liquidation_test_show_sd1') !== 'false');
    const [showSD2, setShowSD2] = useState(() => localStorage.getItem('liquidation_test_show_sd2') !== 'false');
    const [showSD3, setShowSD3] = useState(() => localStorage.getItem('liquidation_test_show_sd3') !== 'false');
    // Normal distribution scope - 'complete' uses all data, 'range' uses only price range
    const [normalDistScope, setNormalDistScope] = useState<'complete' | 'range'>(() => {
        const saved = localStorage.getItem('liquidation_test_normal_dist_scope');
        return saved === 'range' ? 'range' : 'complete';
    });
    const [clusterDensity, setClusterDensity] = useState(() => {
        const saved = Number(localStorage.getItem('liquidation_test_cluster_density'));
        // Migrate old 1-10 values to 1-100 range, or use default 50
        if (saved && saved >= 1 && saved <= 10) {
            return Math.round(saved * 10);
        }
        return saved && saved >= 1 && saved <= 100 ? saved : 50;
    });
    const [minInterval, setMinInterval] = useState(() => Number(localStorage.getItem('liquidation_test_min_interval')) || 1);
    const [maxInterval, setMaxInterval] = useState(() => Number(localStorage.getItem('liquidation_test_max_interval')) || 10000);
    const [status, setStatus] = useState<{ message: string; type: 'success' | 'error' | 'loading' | null }>({ message: '', type: null });
    const [validationError, setValidationError] = useState<string | null>(null);
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

    useEffect(() => {
        localStorage.setItem('liquidation_test_grid_line_interval', String(gridLineInterval));
    }, [gridLineInterval]);

    useEffect(() => {
        localStorage.setItem('liquidation_test_smart_interval_enabled', String(smartIntervalEnabled));
    }, [smartIntervalEnabled]);

    useEffect(() => {
        localStorage.setItem('liquidation_test_fixed_interval_count', String(fixedIntervalCount));
    }, [fixedIntervalCount]);

    useEffect(() => {
        localStorage.setItem('liquidation_test_use_fixed_interval_count', String(useFixedIntervalCount));
    }, [useFixedIntervalCount]);

    useEffect(() => {
        localStorage.setItem('liquidation_test_adaptive_scope', adaptiveScope);
    }, [adaptiveScope]);

    useEffect(() => {
        localStorage.setItem('liquidation_test_normal_distribution_enabled', String(normalDistributionEnabled));
    }, [normalDistributionEnabled]);

    useEffect(() => {
        localStorage.setItem('liquidation_test_show_mean', String(showMeanLine));
    }, [showMeanLine]);

    useEffect(() => {
        localStorage.setItem('liquidation_test_show_sd0_25', String(showSD0_25));
    }, [showSD0_25]);

    useEffect(() => {
        localStorage.setItem('liquidation_test_show_sd0_5', String(showSD0_5));
    }, [showSD0_5]);

    useEffect(() => {
        localStorage.setItem('liquidation_test_show_sd1', String(showSD1));
    }, [showSD1]);

    useEffect(() => {
        localStorage.setItem('liquidation_test_show_sd2', String(showSD2));
    }, [showSD2]);

    useEffect(() => {
        localStorage.setItem('liquidation_test_show_sd3', String(showSD3));
    }, [showSD3]);

    useEffect(() => {
        localStorage.setItem('liquidation_test_normal_dist_scope', normalDistScope);
    }, [normalDistScope]);

    useEffect(() => {
        localStorage.setItem('liquidation_test_cluster_density', String(clusterDensity));
    }, [clusterDensity]);

    useEffect(() => {
        localStorage.setItem('liquidation_test_normal_distribution_enabled', String(normalDistributionEnabled));
    }, [normalDistributionEnabled]);

    useEffect(() => {
        localStorage.setItem('liquidation_test_min_interval', String(minInterval));
    }, [minInterval]);

    useEffect(() => {
        localStorage.setItem('liquidation_test_max_interval', String(maxInterval));
    }, [maxInterval]);

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

    /**
     * Adaptive/Dynamic Interval Clustering Algorithm
     *
     * Creates variable-sized buckets based on data density:
     * - High density areas (many liquidations close together) → smaller intervals (more detail)
     * - Low density areas (few/sparse liquidations) → larger intervals (less noise)
     *
     * Algorithm steps:
     * 1. Sort data by price
     * 2. Calculate local density using sliding window
     * 3. Detect peaks (high concentration areas)
     * 4. Create variable-sized buckets around peaks with smaller intervals
     * 5. Merge sparse areas into larger buckets
     *
     * @param rawData - Array of liquidation data
     * @param density - Density sensitivity (1-100), higher = more granular splitting
     * @param userMinInterval - Optional minimum allowed interval size (default: 1)
     * @param userMaxInterval - Optional maximum allowed interval size (default: 10000)
     * @returns Aggregated data with adaptive intervals
     */
    const aggregateByAdaptiveInterval = (
        rawData: HistoricalLiquidation[],
        density: number,
        userMinInterval?: number,
        userMaxInterval?: number
    ): HistoricalLiquidation[] => {
        // 1. Apply side filter first
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

        let filtered = sideAffectedData;
        if (side !== 'all') {
            filtered = sideAffectedData.filter(item => item.total_volume > 0);
        }

        if (filtered.length === 0) return [];

        // 2. Sort by price
        const sortedData = [...filtered].sort((a, b) => a.price - b.price);

        const prices = sortedData.map(d => d.price);
        const minPrice = Math.min(...prices);
        const maxPrice = Math.max(...prices);
        const priceRange = maxPrice - minPrice;

        if (priceRange <= 0) return sortedData;

        // 3. Calculate density sensitivity parameters based on the slider (1-100)
        // density 1 = low sensitivity (fewer, larger clusters)
        // density 100 = high sensitivity (more, smaller clusters in dense areas)
        const densityFactor = density / 50; // 0.02 to 2.0 (normalized for 1-100 range)

        // Base interval calculation - target number of clusters scales with density
        const minClusters = Math.max(5, Math.floor(10 * densityFactor));
        const maxClusters = Math.max(20, Math.floor(100 * densityFactor));
        const targetBaseInterval = priceRange / ((minClusters + maxClusters) / 2);

        // 4. Calculate local density using sliding window with improved algorithm
        // Density is measured by total volume within a window relative to the window size
        // Higher density = more liquidations per price unit = needs smaller intervals
        const windowSize = Math.max(3, Math.floor(sortedData.length / (20 * densityFactor)));
        const densityScores: number[] = [];

        // Calculate total volume for relative density comparison
        const totalVolume = sortedData.reduce((sum, d) => sum + d.total_volume, 0);
        const avgVolumePerItem = totalVolume / sortedData.length;

        for (let i = 0; i < sortedData.length; i++) {
            const windowStart = Math.max(0, i - Math.floor(windowSize / 2));
            const windowEnd = Math.min(sortedData.length, i + Math.floor(windowSize / 2) + 1);
            const windowData = sortedData.slice(windowStart, windowEnd);

            const windowVolume = windowData.reduce((sum, d) => sum + d.total_volume, 0);
            const windowPriceRange = windowData[windowData.length - 1]?.price - windowData[0]?.price || 1;

            // Density score: volume per unit of price range, normalized by average
            // This gives a relative measure: >1 means denser than average, <1 means sparser
            const rawDensity = (windowVolume / windowData.length) / Math.max(windowPriceRange, targetBaseInterval / 10);
            const normalizedByAvg = rawDensity / (avgVolumePerItem || 1);
            densityScores.push(normalizedByAvg);
        }

        // Normalize density scores to 0-1 range for interval calculation
        const maxDensity = Math.max(...densityScores, 0.001); // Avoid division by zero
        const minDensity = Math.min(...densityScores);
        const densityRange = maxDensity - minDensity || 1;

        // Normalize to 0-1 scale, but preserve relative differences
        const normalizedDensities = densityScores.map(d => (d - minDensity) / densityRange);

        // 5. Detect peaks (local maxima in density)
        const peaks: number[] = [];
        const peakWindow = Math.max(2, Math.floor(windowSize / 2));

        for (let i = peakWindow; i < sortedData.length - peakWindow; i++) {
            const localSlice = normalizedDensities.slice(i - peakWindow, i + peakWindow + 1);
            const localMax = Math.max(...localSlice);

            // It's a peak if it's the local max and above threshold
            if (normalizedDensities[i] === localMax && normalizedDensities[i] > 0.3) {
                peaks.push(i);
            }
        }

        // 6. Create adaptive buckets
        const buckets: {
            priceStart: number;
            priceEnd: number;
            items: HistoricalLiquidation[];
            targetInterval: number;
        }[] = [];

        // Define interval sizes based on local density
        // Dense areas (near peaks): smaller intervals
        // Sparse areas: larger intervals
        const calculatedMinInterval = targetBaseInterval / (2 * densityFactor);
        const calculatedMaxInterval = targetBaseInterval * (2 / densityFactor);

        // Apply user-defined bounds if provided
        const absoluteMinInterval = userMinInterval !== undefined ? userMinInterval : 1;
        const absoluteMaxInterval = userMaxInterval !== undefined ? userMaxInterval : 10000;

        // Clamp the calculated intervals to respect user bounds
        const minInterval = Math.max(calculatedMinInterval, absoluteMinInterval);
        const maxInterval = Math.min(calculatedMaxInterval, absoluteMaxInterval);

        // Debug logging to verify inverse relationship
        const debugInfo: { price: number; density: number; interval: number }[] = [];

        let currentBucketStart = 0;

        while (currentBucketStart < sortedData.length) {
            const currentPrice = sortedData[currentBucketStart].price;
            const currentDensity = normalizedDensities[currentBucketStart];

            // Calculate adaptive interval using INVERSE relationship to density
            // Formula: interval = maxInterval / (1 + density * sensitivity)
            // This ensures:
            // - When density is 2x higher → interval is ~2x smaller
            // - When density → 0, interval → maxInterval
            // - When density → 1, interval → maxInterval / (1 + sensitivity)
            const sensitivity = 3.0; // Controls strength of inverse relationship
            const densityMultiplier = 1 + (currentDensity * sensitivity);
            let adaptiveInterval = maxInterval / densityMultiplier;

            // Clamp to ensure we respect bounds
            adaptiveInterval = Math.max(minInterval, Math.min(maxInterval, adaptiveInterval));

            // Debug: Log first few iterations to verify inverse relationship
            if (debugInfo.length < 10) {
                debugInfo.push({
                    price: currentPrice,
                    density: Math.round(currentDensity * 100) / 100,
                    interval: Math.round(adaptiveInterval)
                });
            }

            // Find the end of this bucket
            let bucketEnd = currentBucketStart;
            const priceStart = sortedData[currentBucketStart].price;
            let priceEnd = priceStart + adaptiveInterval;

            // Expand bucket to include all items within the price range
            while (bucketEnd < sortedData.length && sortedData[bucketEnd].price < priceEnd) {
                bucketEnd++;
            }

            // Ensure minimum number of items per bucket (avoid too many tiny buckets)
            const minItemsPerBucket = Math.max(1, Math.floor(3 / densityFactor));
            if (bucketEnd - currentBucketStart < minItemsPerBucket && bucketEnd < sortedData.length) {
                bucketEnd = Math.min(currentBucketStart + minItemsPerBucket, sortedData.length);
                priceEnd = sortedData[bucketEnd - 1].price;
            }

            // Create bucket
            const bucketItems = sortedData.slice(currentBucketStart, bucketEnd);
            if (bucketItems.length > 0) {
                buckets.push({
                    priceStart: priceStart,
                    priceEnd: priceEnd,
                    items: bucketItems,
                    targetInterval: adaptiveInterval
                });
            }

            currentBucketStart = bucketEnd;
        }

        // 7. Merge very small adjacent buckets in sparse areas (optional optimization)
        const mergedBuckets: typeof buckets = [];
        let i = 0;

        while (i < buckets.length) {
            const current = buckets[i];
            let merged = { ...current };

            // Try to merge with next bucket if both are in low-density areas
            while (i + 1 < buckets.length) {
                const next = buckets[i + 1];
                const avgDensity = (normalizedDensities[currentBucketStart] || 0);

                // Merge if both buckets are small and in sparse area
                const isSparseArea = avgDensity < 0.3;
                const isSmallBucket = merged.items.length < 3 && next.items.length < 3;
                const combinedSize = merged.items.length + next.items.length;
                const wouldBeReasonableSize = combinedSize <= Math.max(10, 15 / densityFactor);

                if (isSparseArea && isSmallBucket && wouldBeReasonableSize) {
                    merged = {
                        priceStart: merged.priceStart,
                        priceEnd: next.priceEnd,
                        items: [...merged.items, ...next.items],
                        targetInterval: merged.targetInterval + next.targetInterval
                    };
                    i++;
                } else {
                    break;
                }
            }

            mergedBuckets.push(merged);
            i++;
        }

        // 8. Aggregate data within each bucket
        const aggregated: HistoricalLiquidation[] = mergedBuckets.map(bucket => {
            const items = bucket.items;
            const totalLongVolume = items.reduce((sum, item) => sum + item.long_volume, 0);
            const totalShortVolume = items.reduce((sum, item) => sum + item.short_volume, 0);
            const totalVolume = totalLongVolume + totalShortVolume;

            // Calculate weighted average price
            const weightedPriceSum = items.reduce((sum, item) =>
                sum + item.price * item.total_volume, 0);
            const avgPrice = totalVolume > 0 ? weightedPriceSum / totalVolume :
                (bucket.priceStart + bucket.priceEnd) / 2;

            return {
                timestamp: bucket.priceStart, // Use price start as timestamp for range identification
                price: avgPrice,
                long_volume: totalLongVolume,
                short_volume: totalShortVolume,
                total_volume: totalVolume,
                long_short_ratio: totalLongVolume / (totalShortVolume || 1)
            };
        });

        // Debug: Log the inverse density-interval relationship
        if (debugInfo.length > 0) {
            console.log('=== Adaptive Interval Algorithm Debug ===');
            console.log(`Min Interval: ${minInterval}, Max Interval: ${maxInterval}, Sensitivity: 3.0`);
            console.log('Price | Density | Interval (inverse relationship)');
            console.log('------|---------|----------');
            debugInfo.forEach(info => {
                console.log(`${info.price.toFixed(0).padStart(5)} | ${info.density.toFixed(2).padStart(7)} | ${info.interval}`);
            });
            console.log('=== End Debug ===');
        }

        return aggregated.sort((a, b) => a.price - b.price);
    };

    /**
     * Fixed Count Interval Clustering Algorithm
     *
     * Creates exactly N buckets of uniform size across the price range:
     * - Calculates interval size as (maxPrice - minPrice) / targetCount
     * - Creates exactly targetCount buckets of equal size
     * - Aggregates data within each bucket
     *
     * @param rawData - Array of liquidation data
     * @param targetCount - Exact number of intervals/buckets to create (e.g., 77)
     * @returns Aggregated data with exactly targetCount items
     */
    const aggregateByFixedCount = (
        rawData: HistoricalLiquidation[],
        targetCount: number
    ): HistoricalLiquidation[] => {
        // Validate target count
        const validTargetCount = Math.max(1, Math.min(500, targetCount));

        // 1. Apply side filter first
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

        let filtered = sideAffectedData;
        if (side !== 'all') {
            filtered = sideAffectedData.filter(item => item.total_volume > 0);
        }

        if (filtered.length === 0) return [];

        // 2. Sort by price
        const sortedData = [...filtered].sort((a, b) => a.price - b.price);

        const prices = sortedData.map(d => d.price);
        const minPrice = Math.min(...prices);
        const maxPrice = Math.max(...prices);
        const priceRange = maxPrice - minPrice;

        if (priceRange <= 0) return sortedData;

        // 3. Calculate uniform interval size
        const intervalSize = priceRange / validTargetCount;

        // 4. Create exactly targetCount buckets
        const buckets: {
            priceStart: number;
            priceEnd: number;
            items: HistoricalLiquidation[];
        }[] = [];

        for (let i = 0; i < validTargetCount; i++) {
            const priceStart = minPrice + (i * intervalSize);
            const priceEnd = minPrice + ((i + 1) * intervalSize);

            // Find items within this bucket's price range
            const bucketItems = sortedData.filter(item =>
                item.price >= priceStart && (i === validTargetCount - 1 ? item.price <= priceEnd : item.price < priceEnd)
            );

            buckets.push({
                priceStart,
                priceEnd,
                items: bucketItems
            });
        }

        // 5. Aggregate data within each bucket
        const aggregated: HistoricalLiquidation[] = buckets.map(bucket => {
            const items = bucket.items;
            const totalLongVolume = items.reduce((sum, item) => sum + item.long_volume, 0);
            const totalShortVolume = items.reduce((sum, item) => sum + item.short_volume, 0);
            const totalVolume = totalLongVolume + totalShortVolume;

            // Calculate weighted average price
            const weightedPriceSum = items.reduce((sum, item) =>
                sum + item.price * item.total_volume, 0);
            const avgPrice = totalVolume > 0 ? weightedPriceSum / totalVolume :
                (bucket.priceStart + bucket.priceEnd) / 2;

            return {
                timestamp: bucket.priceStart, // Use price start as timestamp for range identification
                price: avgPrice,
                long_volume: totalLongVolume,
                short_volume: totalShortVolume,
                total_volume: totalVolume,
                long_short_ratio: totalLongVolume / (totalShortVolume || 1)
            };
        });

        // Filter out empty buckets and return
        return aggregated
            .filter(bucket => bucket.total_volume > 0 || buckets.length <= 100)
            .sort((a, b) => a.price - b.price);
    };

    // Calculate a "smart" interval based on price range and desired cluster density
    const calculateSmartInterval = (rawData: HistoricalLiquidation[], density: number): number => {
        if (!rawData || rawData.length === 0) return 1000;

        // Find min and max prices in the data
        const prices = rawData.map(item => item.price).filter(p => p > 0);
        if (prices.length === 0) return 1000;

        const minPrice = Math.min(...prices);
        const maxPrice = Math.max(...prices);
        const priceRange = maxPrice - minPrice;

        if (priceRange <= 0) return 1000;

        // Map density (1-100) to target cluster count (5-200)
        // density 1 = 5 clusters (fewer, larger intervals)
        // density 100 = 200 clusters (more, smaller intervals)
        const minClusters = 5;
        const maxClusters = 200;
        const targetClusterCount = minClusters + ((density - 1) / 99) * (maxClusters - minClusters);

        // Calculate raw interval
        const rawInterval = priceRange / targetClusterCount;

        // Round to a "nice" number
        const niceNumbers = [100, 250, 500, 1000, 2500, 5000, 10000, 25000, 50000];

        // Find the closest nice number
        let bestInterval = niceNumbers[0];
        let minDiff = Math.abs(rawInterval - niceNumbers[0]);

        for (const nice of niceNumbers) {
            const diff = Math.abs(rawInterval - nice);
            if (diff < minDiff) {
                minDiff = diff;
                bestInterval = nice;
            }
        }

        // If the raw interval is larger than the largest nice number, round to nearest 10000
        if (rawInterval > niceNumbers[niceNumbers.length - 1]) {
            bestInterval = Math.ceil(rawInterval / 10000) * 10000;
        }

        return bestInterval;
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

    // Helper to get adaptive interval statistics for display
    const getAdaptiveIntervalStats = (processedData: HistoricalLiquidation[]): { min: number; max: number; avg: number; count: number } => {
        if (processedData.length < 2) return { min: 0, max: 0, avg: 0, count: processedData.length };

        const intervals: number[] = [];
        for (let i = 1; i < processedData.length; i++) {
            const interval = processedData[i].price - processedData[i - 1].price;
            if (interval > 0) intervals.push(interval);
        }

        if (intervals.length === 0) return { min: 0, max: 0, avg: 0, count: processedData.length };

        return {
            min: Math.min(...intervals),
            max: Math.max(...intervals),
            avg: intervals.reduce((a, b) => a + b, 0) / intervals.length,
            count: processedData.length
        };
    };

    /**
     * Normal Distribution Analysis
     *
     * Calculates weighted mean and standard deviation from liquidation data.
     * Weights are based on volume (higher volume = more weight in calculation).
     *
     * @param data - Array of liquidation data
     * @returns Statistics including mean, stdDev, and standard deviation regions
     */
    const calculateNormalDistribution = (data: HistoricalLiquidation[]) => {
        if (data.length === 0) return null;

        // Calculate weighted mean (price weighted by volume)
        let totalVolume = 0;
        let weightedPriceSum = 0;

        data.forEach(item => {
            const volume = item.total_volume;
            totalVolume += volume;
            weightedPriceSum += item.price * volume;
        });

        if (totalVolume === 0) return null;

        const mean = weightedPriceSum / totalVolume;

        // Calculate weighted standard deviation
        let weightedVarianceSum = 0;

        data.forEach(item => {
            const volume = item.total_volume;
            const diff = item.price - mean;
            weightedVarianceSum += (diff * diff) * volume;
        });

        const variance = weightedVarianceSum / totalVolume;
        const stdDev = Math.sqrt(variance);

        // Define standard deviation regions
        const regions = {
            sd0_25: [mean - 0.25 * stdDev, mean + 0.25 * stdDev] as [number, number],  // 20% of data
            sd0_5: [mean - 0.5 * stdDev, mean + 0.5 * stdDev] as [number, number],  // 38% of data
            sd1: [mean - stdDev, mean + stdDev] as [number, number],  // 68% of data
            sd2: [mean - 2 * stdDev, mean + 2 * stdDev] as [number, number],  // 95% of data
            sd3: [mean - 3 * stdDev, mean + 3 * stdDev] as [number, number],  // 99.7% of data
        };

        return {
            mean,
            stdDev,
            regions,
        };
    };

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

        // Apply price range filter if using fixed interval count mode
        let dataForProcessing = amountFiltered;
        if (useFixedIntervalCount) {
            const priceMin = priceRangeMin && !isNaN(parseFloat(priceRangeMin)) ? parseFloat(priceRangeMin) : null;
            const priceMax = priceRangeMax && !isNaN(parseFloat(priceRangeMax)) ? parseFloat(priceRangeMax) : null;

            if (priceMin !== null && priceMax !== null) {
                const actualMin = Math.min(priceMin, priceMax);
                const actualMax = Math.max(priceMin, priceMax);
                dataForProcessing = amountFiltered.filter(item => item.price >= actualMin && item.price <= actualMax);
            }
        }

        // Use fixed count mode, adaptive clustering, or uniform aggregation based on selection
        if (useFixedIntervalCount) {
            // Use fixed number of intervals
            const fixedCountData = aggregateByFixedCount(dataForProcessing, fixedIntervalCount);
            setProcessedData(fixedCountData);
        } else if (smartIntervalEnabled) {
            let dataForAdaptive = amountFiltered;

            // If scope is 'range', filter by price range BEFORE applying adaptive clustering
            if (adaptiveScope === 'range') {
                const priceMin = priceRangeMin && !isNaN(parseFloat(priceRangeMin)) ? parseFloat(priceRangeMin) : null;
                const priceMax = priceRangeMax && !isNaN(parseFloat(priceRangeMax)) ? parseFloat(priceRangeMax) : null;

                if (priceMin !== null && priceMax !== null) {
                    const actualMin = Math.min(priceMin, priceMax);
                    const actualMax = Math.max(priceMin, priceMax);
                    dataForAdaptive = amountFiltered.filter(item => item.price >= actualMin && item.price <= actualMax);
                }
            }

            // Use the new adaptive/dynamic interval clustering with min/max bounds
            const adaptiveData = aggregateByAdaptiveInterval(dataForAdaptive, clusterDensity, minInterval, maxInterval);
            setProcessedData(adaptiveData);
        } else {
            // Use uniform interval aggregation
            setProcessedData(aggregateByPriceInterval(amountFiltered, priceInterval));
        }
    }, [data, priceInterval, side, amountMin, amountMax, ratioFilter, ratioFilterMax, smartIntervalEnabled, clusterDensity, minInterval, maxInterval, adaptiveScope, priceRangeMin, priceRangeMax, useFixedIntervalCount, fixedIntervalCount]);

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

    // Calculate normal distribution statistics when enabled and data changes
    useEffect(() => {
        if (normalDistributionEnabled && processedData.length > 0) {
            let dataForNormalDist = processedData;

            // If scope is 'range', filter by price range before calculating
            if (normalDistScope === 'range') {
                const priceMin = priceRangeMin && !isNaN(parseFloat(priceRangeMin)) ? parseFloat(priceRangeMin) : null;
                const priceMax = priceRangeMax && !isNaN(parseFloat(priceRangeMax)) ? parseFloat(priceRangeMax) : null;

                if (priceMin !== null && priceMax !== null) {
                    const actualMin = Math.min(priceMin, priceMax);
                    const actualMax = Math.max(priceMin, priceMax);
                    dataForNormalDist = processedData.filter(item => item.price >= actualMin && item.price <= actualMax);
                }
            }

            const stats = calculateNormalDistribution(dataForNormalDist);
            setStdDevData(stats);
        } else {
            setStdDevData(null);
        }
    }, [normalDistributionEnabled, processedData, normalDistScope, priceRangeMin, priceRangeMax]);

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
                                disabled={smartIntervalEnabled || useFixedIntervalCount}
                                className={`w-full h-9 rounded-md border border-input bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-ring ${(smartIntervalEnabled || useFixedIntervalCount) ? 'opacity-50 cursor-not-allowed bg-muted' : ''}`}
                            />
                            <p className="text-[10px] text-muted-foreground">Útil para ver volumes por faixas de preço específicas</p>
                        </div>

                        {/* Smart Interval Controls */}
                        <div className="space-y-3">
                            <div className="flex items-center justify-between">
                                <div className="flex items-center gap-2">
                                    <label className="text-sm font-medium">Intervalo Adaptativo</label>
                                    <span className="text-[10px] px-1.5 py-0.5 bg-primary/10 text-primary rounded">βeta</span>
                                </div>
                                <button
                                    onClick={() => {
                                        setSmartIntervalEnabled(!smartIntervalEnabled);
                                        if (!smartIntervalEnabled) {
                                            setUseFixedIntervalCount(false);
                                        }
                                    }}
                                    disabled={useFixedIntervalCount}
                                    className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${smartIntervalEnabled ? 'bg-primary' : 'bg-muted'} ${useFixedIntervalCount ? 'opacity-50 cursor-not-allowed' : ''}`}
                                >
                                    <span
                                        className={`inline-block h-4 w-4 transform rounded-full bg-background transition-transform ${smartIntervalEnabled ? 'translate-x-6' : 'translate-x-1'}`}
                                    />
                                </button>
                            </div>
                            {smartIntervalEnabled && (
                                <div className="space-y-3 p-3 bg-muted/50 rounded-md border border-border">
                                    {/* Adaptive Scope Selection */}
                                    <div className="space-y-2">
                                        <label className="text-xs font-medium text-foreground">Aplicar em:</label>
                                        <div className="flex gap-2">
                                            <button
                                                onClick={() => setAdaptiveScope('complete')}
                                                className={`flex-1 h-8 rounded-md text-xs font-medium transition-all ${adaptiveScope === 'complete'
                                                    ? 'bg-primary text-primary-foreground'
                                                    : 'bg-muted text-muted-foreground hover:bg-accent'
                                                    }`}
                                                title="Analisa densidade em todos os dados disponíveis"
                                            >
                                                Série completa
                                            </button>
                                            <button
                                                onClick={() => setAdaptiveScope('range')}
                                                className={`flex-1 h-8 rounded-md text-xs font-medium transition-all ${adaptiveScope === 'range'
                                                    ? 'bg-primary text-primary-foreground'
                                                    : 'bg-muted text-muted-foreground hover:bg-accent'
                                                    }`}
                                                title="Analisa densidade apenas na faixa de preço selecionada"
                                            >
                                                Intervalo definido
                                            </button>
                                        </div>
                                        <p className="text-[10px] text-muted-foreground leading-relaxed">
                                            {adaptiveScope === 'complete'
                                                ? "Série completa: analisa densidade em todos os dados."
                                                : "Intervalo definido: analisa densidade apenas na faixa de preço selecionada."}
                                        </p>
                                        {adaptiveScope === 'range' && (!priceRangeMin || !priceRangeMax) && (
                                            <p className="text-[10px] text-amber-500 flex items-center gap-1">
                                                <span>⚠️</span>
                                                <span>Defina a faixa de preço (Min - Max) abaixo para usar esta opção</span>
                                            </p>
                                        )}
                                    </div>

                                    <div className="border-t border-border pt-2" />

                                    <p className="text-[10px] text-muted-foreground leading-relaxed">
                                        Cria intervalos dinâmicos baseados na densidade dos dados:
                                        <span className="text-green-500 font-medium"> áreas densas → intervalos menores</span>,
                                        <span className="text-blue-500 font-medium"> áreas esparsas → intervalos maiores</span>.
                                    </p>
                                    <div className="space-y-2">
                                        <div className="flex justify-between items-center">
                                            <label className="text-xs font-medium text-muted-foreground">Sensibilidade à Densidade</label>
                                            <span className="text-xs font-semibold text-primary">{clusterDensity}</span>
                                        </div>
                                        <input
                                            type="range"
                                            min="1"
                                            max="100"
                                            step="1"
                                            value={clusterDensity}
                                            onChange={(e) => setClusterDensity(Number(e.target.value))}
                                            className="w-full h-2 bg-muted rounded-lg appearance-none cursor-pointer accent-primary"
                                        />
                                        <div className="flex justify-between text-[10px] text-muted-foreground">
                                            <span>1 (menos granular)</span>
                                            <span>100 (mais granular)</span>
                                        </div>
                                    </div>

                                    {/* Min/Max Interval Controls */}
                                    <div className="space-y-3 pt-2 border-t border-border">
                                        <p className="text-xs font-medium text-foreground">Limites de Intervalo</p>
                                        <p className="text-[10px] text-muted-foreground leading-relaxed">
                                            Limita o tamanho dos intervalos adaptativos
                                        </p>
                                        <div className="grid grid-cols-2 gap-3">
                                            <div className="space-y-1">
                                                <label className="text-[10px] text-muted-foreground">Intervalo Mínimo ($)</label>
                                                <input
                                                    type="number"
                                                    min="1"
                                                    max="100000"
                                                    step="1"
                                                    value={minInterval}
                                                    onChange={(e) => {
                                                        const value = Number(e.target.value);
                                                        if (value >= 1 && value <= 100000) {
                                                            setMinInterval(value);
                                                            if (value >= maxInterval) {
                                                                setValidationError('O intervalo mínimo deve ser menor que o máximo');
                                                            } else {
                                                                setValidationError(null);
                                                            }
                                                        }
                                                    }}
                                                    className="w-full h-8 rounded-md border border-input bg-background px-2 text-sm outline-none focus:ring-2 focus:ring-ring"
                                                />
                                            </div>
                                            <div className="space-y-1">
                                                <label className="text-[10px] text-muted-foreground">Intervalo Máximo ($)</label>
                                                <input
                                                    type="number"
                                                    min="2"
                                                    max="100000"
                                                    step="1"
                                                    value={maxInterval}
                                                    onChange={(e) => {
                                                        const value = Number(e.target.value);
                                                        if (value >= 2 && value <= 100000) {
                                                            setMaxInterval(value);
                                                            if (value <= minInterval) {
                                                                setValidationError('O intervalo máximo deve ser maior que o mínimo');
                                                            } else {
                                                                setValidationError(null);
                                                            }
                                                        }
                                                    }}
                                                    className="w-full h-8 rounded-md border border-input bg-background px-2 text-sm outline-none focus:ring-2 focus:ring-ring"
                                                />
                                            </div>
                                        </div>
                                        {validationError && (
                                            <p className="text-[10px] text-red-500">{validationError}</p>
                                        )}
                                    </div>

                                    <div className="pt-2 border-t border-border space-y-1">
                                        <p className="text-xs font-medium text-foreground">Intervalos Adaptativos</p>
                                        {(() => {
                                            const stats = getAdaptiveIntervalStats(processedData);
                                            return stats.count > 0 ? (
                                                <div className="space-y-1">
                                                    <div className="flex justify-between text-[10px]">
                                                        <span className="text-muted-foreground">Clusters:</span>
                                                        <span className="font-semibold text-foreground">{stats.count}</span>
                                                    </div>
                                                    <div className="flex justify-between text-[10px]">
                                                        <span className="text-muted-foreground">Intervalo mín:</span>
                                                        <span className="font-semibold text-green-500">{formatCurrency(stats.min)}</span>
                                                    </div>
                                                    <div className="flex justify-between text-[10px]">
                                                        <span className="text-muted-foreground">Intervalo máx:</span>
                                                        <span className="font-semibold text-blue-500">{formatCurrency(stats.max)}</span>
                                                    </div>
                                                    <div className="flex justify-between text-[10px]">
                                                        <span className="text-muted-foreground">Intervalo médio:</span>
                                                        <span className="font-semibold text-foreground">{formatCurrency(stats.avg)}</span>
                                                    </div>
                                                    <p className="text-[10px] text-muted-foreground mt-1 italic">
                                                        {stats.max > stats.min * 10
                                                            ? "✓ Alta variabilidade: áreas densas têm intervalos menores"
                                                            : "✓ Distribuição uniforme de intervalos"}
                                                    </p>
                                                </div>
                                            ) : (
                                                <p className="text-[10px] text-muted-foreground">Carregue dados para ver estatísticas</p>
                                            );
                                        })()}
                                    </div>
                                </div>
                            )}
                        </div>

                        {/* Normal Distribution Controls */}
                        <div className="space-y-3">
                            <div className="flex items-center justify-between">
                                <div className="flex items-center gap-2">
                                    <label className="text-sm font-medium">Distribuição Normal</label>
                                    <span className="text-[10px] px-1.5 py-0.5 bg-purple-500/10 text-purple-500 rounded">Novo</span>
                                </div>
                                <button
                                    onClick={() => setNormalDistributionEnabled(!normalDistributionEnabled)}
                                    className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${normalDistributionEnabled ? 'bg-purple-500' : 'bg-muted'}`}
                                >
                                    <span
                                        className={`inline-block h-4 w-4 transform rounded-full bg-background transition-transform ${normalDistributionEnabled ? 'translate-x-6' : 'translate-x-1'}`}
                                    />
                                </button>
                            </div>
                            {normalDistributionEnabled && (
                                <div className="space-y-3 p-3 bg-purple-500/5 rounded-md border border-purple-500/20">
                                    <p className="text-[10px] text-muted-foreground leading-relaxed">
                                        Analisa a distribuição estatística dos preços ponderada pelo volume de liquidação.
                                        <span className="text-purple-500 font-medium"> Calcula média e desvio padrão</span> para identificar regiões de concentração.
                                    </p>

                                    {/* Scope Selection */}
                                    <div className="space-y-2 pt-2 border-t border-border/50">
                                        <label className="text-xs font-medium text-foreground">Aplicar em:</label>
                                        <div className="flex gap-2">
                                            <button
                                                onClick={() => setNormalDistScope('complete')}
                                                className={`flex-1 h-8 rounded-md text-xs font-medium transition-all ${normalDistScope === 'complete'
                                                    ? 'bg-purple-500 text-white'
                                                    : 'bg-muted text-muted-foreground hover:bg-accent'
                                                    }`}
                                                title="Analisa distribuição em todos os dados disponíveis"
                                            >
                                                Série completa
                                            </button>
                                            <button
                                                onClick={() => setNormalDistScope('range')}
                                                className={`flex-1 h-8 rounded-md text-xs font-medium transition-all ${normalDistScope === 'range'
                                                    ? 'bg-purple-500 text-white'
                                                    : 'bg-muted text-muted-foreground hover:bg-accent'
                                                    }`}
                                                title="Analisa distribuição apenas na faixa de preço selecionada"
                                            >
                                                Intervalo definido
                                            </button>
                                        </div>
                                        <p className="text-[10px] text-muted-foreground leading-relaxed">
                                            {normalDistScope === 'complete'
                                                ? "Série completa: calcula estatísticas em todos os dados carregados."
                                                : "Intervalo definido: calcula estatísticas apenas na faixa de preço (Min - Max) definida abaixo."}
                                        </p>
                                        {normalDistScope === 'range' && (!priceRangeMin || !priceRangeMax) && (
                                            <p className="text-[10px] text-amber-500 flex items-center gap-1">
                                                <span>⚠️</span>
                                                <span>Defina a faixa de preço (Min - Max) abaixo para usar esta opção</span>
                                            </p>
                                        )}
                                    </div>

                                    {stdDevData ? (
                                        <div className="space-y-2 pt-2 border-t border-border/50">
                                            <div className="flex justify-between text-[10px]">
                                                <span className="text-muted-foreground">Preço Médio (Ponderado):</span>
                                                <span className="font-semibold text-purple-500">{formatCurrency(stdDevData.mean)}</span>
                                            </div>
                                            <div className="flex justify-between text-[10px]">
                                                <span className="text-muted-foreground">Desvio Padrão (σ):</span>
                                                <span className="font-semibold text-purple-500">{formatCurrency(stdDevData.stdDev)}</span>
                                            </div>
                                            <div className="space-y-2 pt-2">
                                                <p className="text-[10px] font-medium text-foreground">Exibir no Gráfico:</p>

                                                {/* Toggle Média */}
                                                <div className="flex items-center justify-between">
                                                    <div className="flex items-center gap-2">
                                                        <div className="w-3 h-0.5 bg-purple-500"></div>
                                                        <span className="text-[10px] text-muted-foreground">Linha da Média</span>
                                                    </div>
                                                    <button
                                                        onClick={() => setShowMeanLine(!showMeanLine)}
                                                        className={`relative inline-flex h-4 w-8 items-center rounded-full transition-colors ${showMeanLine ? 'bg-purple-500' : 'bg-muted'}`}
                                                    >
                                                        <span className={`inline-block h-3 w-3 transform rounded-full bg-background transition-transform ${showMeanLine ? 'translate-x-4' : 'translate-x-0.5'}`} />
                                                    </button>
                                                </div>

                                                {/* Toggle ±0.25σ */}
                                                <div className="flex items-center justify-between">
                                                    <div className="flex items-center gap-2">
                                                        <div className="w-3 h-0.5" style={{ borderTop: '2px dashed #ec4899' }}></div>
                                                        <span className="text-[10px] text-muted-foreground">±0.25σ (20%)</span>
                                                        <span className="text-[10px] text-pink-500">{formatCurrency(stdDevData.regions.sd0_25[0])} - {formatCurrency(stdDevData.regions.sd0_25[1])}</span>
                                                    </div>
                                                    <button
                                                        onClick={() => setShowSD0_25(!showSD0_25)}
                                                        className={`relative inline-flex h-4 w-8 items-center rounded-full transition-colors ${showSD0_25 ? 'bg-pink-500' : 'bg-muted'}`}
                                                    >
                                                        <span className={`inline-block h-3 w-3 transform rounded-full bg-background transition-transform ${showSD0_25 ? 'translate-x-4' : 'translate-x-0.5'}`} />
                                                    </button>
                                                </div>

                                                {/* Toggle ±0.5σ */}
                                                <div className="flex items-center justify-between">
                                                    <div className="flex items-center gap-2">
                                                        <div className="w-3 h-0.5" style={{ borderTop: '2px dashed #06b6d4' }}></div>
                                                        <span className="text-[10px] text-muted-foreground">±0.5σ (38%)</span>
                                                        <span className="text-[10px] text-cyan-500">{formatCurrency(stdDevData.regions.sd0_5[0])} - {formatCurrency(stdDevData.regions.sd0_5[1])}</span>
                                                    </div>
                                                    <button
                                                        onClick={() => setShowSD0_5(!showSD0_5)}
                                                        className={`relative inline-flex h-4 w-8 items-center rounded-full transition-colors ${showSD0_5 ? 'bg-cyan-500' : 'bg-muted'}`}
                                                    >
                                                        <span className={`inline-block h-3 w-3 transform rounded-full bg-background transition-transform ${showSD0_5 ? 'translate-x-4' : 'translate-x-0.5'}`} />
                                                    </button>
                                                </div>

                                                {/* Toggle ±1σ */}
                                                <div className="flex items-center justify-between">
                                                    <div className="flex items-center gap-2">
                                                        <div className="w-3 h-0.5" style={{ borderTop: '2px dashed #10b981' }}></div>
                                                        <span className="text-[10px] text-muted-foreground">±1σ (68%)</span>
                                                        <span className="text-[10px] text-green-500">{formatCurrency(stdDevData.regions.sd1[0])} - {formatCurrency(stdDevData.regions.sd1[1])}</span>
                                                    </div>
                                                    <button
                                                        onClick={() => setShowSD1(!showSD1)}
                                                        className={`relative inline-flex h-4 w-8 items-center rounded-full transition-colors ${showSD1 ? 'bg-green-500' : 'bg-muted'}`}
                                                    >
                                                        <span className={`inline-block h-3 w-3 transform rounded-full bg-background transition-transform ${showSD1 ? 'translate-x-4' : 'translate-x-0.5'}`} />
                                                    </button>
                                                </div>

                                                {/* Toggle ±2σ */}
                                                <div className="flex items-center justify-between">
                                                    <div className="flex items-center gap-2">
                                                        <div className="w-3 h-0.5" style={{ borderTop: '2px dashed #f59e0b' }}></div>
                                                        <span className="text-[10px] text-muted-foreground">±2σ (95%)</span>
                                                        <span className="text-[10px] text-amber-500">{formatCurrency(stdDevData.regions.sd2[0])} - {formatCurrency(stdDevData.regions.sd2[1])}</span>
                                                    </div>
                                                    <button
                                                        onClick={() => setShowSD2(!showSD2)}
                                                        className={`relative inline-flex h-4 w-8 items-center rounded-full transition-colors ${showSD2 ? 'bg-amber-500' : 'bg-muted'}`}
                                                    >
                                                        <span className={`inline-block h-3 w-3 transform rounded-full bg-background transition-transform ${showSD2 ? 'translate-x-4' : 'translate-x-0.5'}`} />
                                                    </button>
                                                </div>

                                                {/* Toggle ±3σ */}
                                                <div className="flex items-center justify-between">
                                                    <div className="flex items-center gap-2">
                                                        <div className="w-3 h-0.5" style={{ borderTop: '2px dashed #ef4444' }}></div>
                                                        <span className="text-[10px] text-muted-foreground">±3σ (99.7%)</span>
                                                        <span className="text-[10px] text-red-500">{formatCurrency(stdDevData.regions.sd3[0])} - {formatCurrency(stdDevData.regions.sd3[1])}</span>
                                                    </div>
                                                    <button
                                                        onClick={() => setShowSD3(!showSD3)}
                                                        className={`relative inline-flex h-4 w-8 items-center rounded-full transition-colors ${showSD3 ? 'bg-red-500' : 'bg-muted'}`}
                                                    >
                                                        <span className={`inline-block h-3 w-3 transform rounded-full bg-background transition-transform ${showSD3 ? 'translate-x-4' : 'translate-x-0.5'}`} />
                                                    </button>
                                                </div>
                                            </div>
                                        </div>
                                    ) : (
                                        <p className="text-[10px] text-muted-foreground">Carregue dados para ver estatísticas de distribuição</p>
                                    )}
                                </div>
                            )}
                        </div>

                        {/* Fixed Interval Count Controls */}
                        <div className="space-y-3">
                            <div className="flex items-center justify-between">
                                <div className="flex items-center gap-2">
                                    <label className="text-sm font-medium">Número Fixo de Intervalos</label>
                                    <span className="text-[10px] px-1.5 py-0.5 bg-green-500/10 text-green-500 rounded">Novo</span>
                                </div>
                                <button
                                    onClick={() => {
                                        setUseFixedIntervalCount(!useFixedIntervalCount);
                                        if (!useFixedIntervalCount) {
                                            setSmartIntervalEnabled(false);
                                        }
                                    }}
                                    className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${useFixedIntervalCount ? 'bg-green-500' : 'bg-muted'}`}
                                >
                                    <span
                                        className={`inline-block h-4 w-4 transform rounded-full bg-background transition-transform ${useFixedIntervalCount ? 'translate-x-6' : 'translate-x-1'}`}
                                    />
                                </button>
                            </div>
                            {useFixedIntervalCount && (
                                <div className="space-y-3 p-3 bg-green-500/5 rounded-md border border-green-500/20">
                                    <p className="text-[10px] text-muted-foreground leading-relaxed">
                                        Divide a faixa de preço selecionada em exatamente
                                        <span className="text-green-500 font-medium"> N intervalos de tamanho igual</span>.
                                        Defina a faixa de preço (Min - Max) abaixo.
                                    </p>
                                    <div className="space-y-2">
                                        <div className="flex justify-between items-center">
                                            <label className="text-xs font-medium text-muted-foreground">Quantidade de Intervalos</label>
                                            <span className="text-xs font-semibold text-green-500">{fixedIntervalCount}</span>
                                        </div>
                                        <input
                                            type="range"
                                            min="1"
                                            max="500"
                                            step="1"
                                            value={fixedIntervalCount}
                                            onChange={(e) => setFixedIntervalCount(Number(e.target.value))}
                                            className="w-full h-2 bg-muted rounded-lg appearance-none cursor-pointer accent-green-500"
                                        />
                                        <div className="flex justify-between text-[10px] text-muted-foreground">
                                            <span>1</span>
                                            <span>250</span>
                                            <span>500</span>
                                        </div>
                                        {/* Direct number input for exact value */}
                                        <div className="pt-2 border-t border-border/50">
                                            <label className="text-[10px] text-muted-foreground">Valor exato:</label>
                                            <input
                                                type="number"
                                                min="1"
                                                max="500"
                                                step="1"
                                                value={fixedIntervalCount}
                                                onChange={(e) => {
                                                    const value = Number(e.target.value);
                                                    if (value >= 1 && value <= 500) {
                                                        setFixedIntervalCount(value);
                                                    }
                                                }}
                                                className="w-full h-8 mt-1 rounded-md border border-input bg-background px-2 text-sm outline-none focus:ring-2 focus:ring-green-500/50"
                                            />
                                        </div>
                                    </div>
                                    {(!priceRangeMin || !priceRangeMax) && (
                                        <p className="text-[10px] text-amber-500 flex items-center gap-1">
                                            <span>⚠️</span>
                                            <span>Defina a faixa de preço (Min - Max) abaixo para usar esta opção</span>
                                        </p>
                                    )}
                                    <div className="pt-2 border-t border-border/50 space-y-1">
                                        <p className="text-xs font-medium text-foreground">Intervalos Fixos</p>
                                        {processedData.length > 0 ? (
                                            <div className="space-y-1">
                                                <div className="flex justify-between text-[10px]">
                                                    <span className="text-muted-foreground">Total de barras:</span>
                                                    <span className="font-semibold text-green-500">{processedData.length}</span>
                                                </div>
                                                <p className="text-[10px] text-muted-foreground mt-1 italic">
                                                    {processedData.length === fixedIntervalCount
                                                        ? "✓ Exatamente o número solicitado de intervalos"
                                                        : `✓ Distribuição uniforme em ${fixedIntervalCount} faixas de preço`}
                                                </p>
                                            </div>
                                        ) : (
                                            <p className="text-[10px] text-muted-foreground">Carregue dados para ver estatísticas</p>
                                        )}
                                    </div>
                                </div>
                            )}
                        </div>

                        {/* Line Styles Configuration */}
                        <div className="space-y-3 border-t border-border pt-4 mt-4">
                            <label className="text-sm font-medium">Estilo das Linhas de Grade</label>
                            <div className="space-y-2">
                                <label className="text-[10px] text-muted-foreground">Intervalo das Linhas ($)</label>
                                <input
                                    type="number"
                                    min="100"
                                    step="100"
                                    value={gridLineInterval}
                                    onChange={(e) => setGridLineInterval(Number(e.target.value))}
                                    placeholder="Ex: 1000"
                                    className="w-full h-8 rounded-md border border-input bg-background px-2 text-sm outline-none focus:ring-2 focus:ring-ring"
                                />
                            </div>
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
                                gridLineInterval={gridLineInterval}
                                stdDevData={stdDevData}
                                showMeanLine={showMeanLine}
                                showSD0_25={showSD0_25}
                                showSD0_5={showSD0_5}
                                showSD1={showSD1}
                                showSD2={showSD2}
                                showSD3={showSD3}
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
