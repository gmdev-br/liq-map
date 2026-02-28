import { useState, useEffect, useRef, useMemo } from 'react';
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
import axios from 'axios';
import { format } from 'date-fns';
import { useCacheData } from '@/hooks/useCacheData';
import { exportToCSV, exportToJSON, importFromCSV, importFromJSON, generateExportFilename } from '@/utils/exportImport';
import {
    Chart as ChartJS,
    CategoryScale,
    LinearScale,
    PointElement,
    BarElement,
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
    BarElement,
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
interface LiquidationChartProps {
    data: HistoricalLiquidation[];
    formatCurrency: (value: number) => string;
    groupBy?: 'none' | 'long' | 'short' | 'combined' | 'stacked';
}

function LiquidationChart({ data, formatCurrency, groupBy = 'none' }: LiquidationChartProps) {
    const chartRef = useRef<any>(null);
    
    const resetZoom = () => {
        if (chartRef.current) {
            chartRef.current.resetZoom();
        }
    };

    // Sort data by price for proper x-axis ordering
    const sortedData = [...data].sort((a, b) => a.price - b.price);

    // Create chart data based on groupBy selection
    const chartData: ChartData<'bar'> = {
        labels: sortedData.map((d) => formatCurrency(d.price)),
        datasets: groupBy === 'stacked' 
            ? [{
                label: 'Total Volume',
                data: sortedData.map((d) => d.long_volume + d.short_volume),
                backgroundColor: '#3b82f6',
                borderRadius: 4,
            }]
            : [
                {
                    label: 'Longs',
                    data: sortedData.map((d) => d.long_volume),
                    backgroundColor: '#10b981',
                    borderRadius: 4,
                },
                {
                    label: 'Shorts',
                    data: sortedData.map((d) => d.short_volume),
                    backgroundColor: '#ef4444',
                    borderRadius: 4,
                },
            ],
    };

    const chartOptions: any = {
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
    };

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
}

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
    const [status, setStatus] = useState<{ message: string; type: 'success' | 'error' | 'loading' | null }>({ message: '', type: null });
    const [data, setData] = useState<HistoricalLiquidation[]>([]);
    const [processedData, setProcessedData] = useState<HistoricalLiquidation[]>([]);
    const [lastFetchTime, setLastFetchTime] = useState<number | null>(null);
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

    const formatCurrency = (value: number) => {
        if (value >= 1_000_000_000) return `$${(value / 1_000_000_000).toFixed(2)}B`;
        if (value >= 1_000_000) return `$${(value / 1_000_000).toFixed(2)}M`;
        if (value >= 1_000) return `$${(value / 1_000).toFixed(2)}K`;
        return `$${value.toFixed(2)}`;
    };

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

        filtered.forEach(item => {
            const price = item.price || 0;
            const priceRange = Math.floor(price / interval) * interval;
            const rangeKey = `${priceRange}-${priceRange + interval}`;

            if (!aggregated[rangeKey]) {
                aggregated[rangeKey] = {
                    priceRange: priceRange,
                    priceRangeEnd: priceRange + interval,
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

    const fetchLiquidationData = async () => {
        setStatus({ message: 'Fetching liquidation data...', type: 'loading' });

        if (apiKey && apiKey !== 'FREE') {
            localStorage.setItem('coinalyze_api_key', apiKey);
        }

        const end = Math.floor(Date.now() / 1000);
        const start = months === 0 ? end - (10 * 365 * 24 * 60 * 60) : end - (months * 30 * 24 * 60 * 60);

        try {
            const response = await axios.get('/api/liquidation-history', {
                params: {
                    symbols: symbol,
                    interval: 'daily',
                    from: start,
                    to: end,
                    api_key: apiKey
                }
            });

            const priceResponse = await axios.get('/api/price-history', {
                params: {
                    symbols: symbol,
                    from: start,
                    to: end
                }
            });

            return { liquidation: response.data, price: priceResponse.data };
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
            const priceData = Array.isArray(price) ? price : [];
            const priceMap = new Map();
            priceData.forEach((p: any) => {
                const dateKey = new Date(p.t * 1000).toISOString().split('T')[0];
                priceMap.set(dateKey, p.c);
            });

            let rawHistory = [];
            const resData = liquidation;
            if (Array.isArray(resData)) {
                rawHistory = resData[0]?.history || resData;
            } else if (resData?.history) {
                rawHistory = resData.history;
            } else if (resData?.data) {
                rawHistory = resData.data;
            }

            const min = 0;
            const max = Infinity;

            const mapped: HistoricalLiquidation[] = rawHistory.reduce((acc: HistoricalLiquidation[], item: any) => {
                const longBase = item.l || item.long_volume || 0;
                const shortBase = item.s || item.short_volume || 0;
                const timestamp = item.t || item.time || item.timestamp;

                const dateKey = new Date(timestamp * 1000).toISOString().split('T')[0];
                const price = Number(item.price || priceMap.get(dateKey) || 0);

                const longUSD = longBase * (price || 1);
                const shortUSD = shortBase * (price || 1);
                const totalUSD = longUSD + shortUSD;

                if (totalUSD >= min && (max === Infinity || totalUSD <= max)) {
                    acc.push({
                        timestamp: timestamp,
                        long_volume: longUSD,
                        short_volume: shortUSD,
                        total_volume: totalUSD,
                        long_short_ratio: longUSD / (shortUSD || 1),
                        price: price
                    });
                }
                return acc;
            }, []);

            setData(mapped);
            setLastFetchTime(Date.now());
            setStatus({
                message: isFromCache 
                    ? `Dados carregados do cache (${mapped.length} registros). Última atualização: ${new Date(lastFetchTime || Date.now()).toLocaleString('pt-BR')}`
                    : `Dados carregados (${rawHistory.length} registros).`,
                type: 'success'
            });
        },
        onError: (error) => {
            console.error('Fetch error:', error);
            const errorMessage = error?.message || error?.toString() || 'Error fetching data';
            setStatus({ message: errorMessage, type: 'error' });
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

    // Filter data for chart display based on groupBy selection
    const chartData = useMemo(() => {
        if (groupBy === 'none' || groupBy === 'combined' || groupBy === 'stacked') {
            return processedData;
        }
        return processedData.map(item => ({
            ...item,
            long_volume: groupBy === 'long' ? item.long_volume : 0,
            short_volume: groupBy === 'short' ? item.short_volume : 0,
            total_volume: groupBy === 'long' ? item.long_volume : groupBy === 'short' ? item.short_volume : item.total_volume
        }));
    }, [processedData, groupBy]);

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
                            <LiquidationChart data={chartData} formatCurrency={formatCurrency} groupBy={groupBy} />
                        </CardContent>
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
