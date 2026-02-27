import { useState, useEffect } from 'react';
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
    Clock
} from 'lucide-react';
import { Card, CardContent, CardHeader } from '@/components/ui/Card';
import {
    BarChart,
    Bar,
    XAxis,
    YAxis,
    CartesianGrid,
    Tooltip,
    ResponsiveContainer,
    Legend
} from 'recharts';
import axios from 'axios';
import { format } from 'date-fns';
import { useCacheData } from '@/hooks/useCacheData';

interface HistoricalLiquidation {
    timestamp: number;
    long_volume: number;
    short_volume: number;
    total_volume: number;
    long_short_ratio: number;
    price: number;
}

export function LiquidationTest() {
    const [apiKey, setApiKey] = useState(localStorage.getItem('coinalyze_api_key') || 'FREE');
    const [symbol, setSymbol] = useState('BTCUSDT_PERP.A');
    const [months, setMonths] = useState(12);
    const [priceInterval, setPriceInterval] = useState(0);
    const [amountMin, setAmountMin] = useState<string>('');
    const [amountMax, setAmountMax] = useState<string>('');
    const [side, setSide] = useState<'all' | 'long' | 'short'>('all');
    const [status, setStatus] = useState<{ message: string; type: 'success' | 'error' | 'loading' | null }>({ message: '', type: null });
    const [data, setData] = useState<HistoricalLiquidation[]>([]);
    const [processedData, setProcessedData] = useState<HistoricalLiquidation[]>([]);
    const [lastFetchTime, setLastFetchTime] = useState<number | null>(null);

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

            const min = amountMin && !isNaN(parseFloat(amountMin)) ? parseFloat(amountMin) : 0;
            const max = amountMax && !isNaN(parseFloat(amountMax)) ? parseFloat(amountMax) : Infinity;

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
                    : `Dados atualizados (${rawHistory.length} registros). Filtrados para ${mapped.length}.`,
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
        setProcessedData(aggregateByPriceInterval(data, priceInterval));
    }, [data, priceInterval, side]);

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

                    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3 pt-2 border-t border-border">
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
                            <label className="text-sm font-medium">Chave API (Coinalyze)</label>
                            <input
                                type="password"
                                value={apiKey}
                                onChange={(e) => setApiKey(e.target.value)}
                                className="w-full h-9 rounded-md border border-input bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-ring opacity-50 focus:opacity-100 transition-opacity"
                            />
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
                            <ResponsiveContainer width="100%" height="100%">
                                <BarChart data={processedData}>
                                    <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                                    <XAxis
                                        dataKey="price"
                                        tickFormatter={(val) => formatCurrency(val)}
                                        fontSize={12}
                                    />
                                    <YAxis
                                        tickFormatter={(val) => formatCurrency(val)}
                                        fontSize={12}
                                    />
                                    <Tooltip
                                        contentStyle={{
                                            backgroundColor: 'hsl(var(--card))',
                                            border: '1px solid hsl(var(--border))',
                                            borderRadius: '8px'
                                        }}
                                        formatter={(value: number) => formatCurrency(value)}
                                    />
                                    <Legend />
                                    <Bar dataKey="long_volume" name="Longs" fill="#10b981" radius={[4, 4, 0, 0]} />
                                    <Bar dataKey="short_volume" name="Shorts" fill="#ef4444" radius={[4, 4, 0, 0]} />
                                </BarChart>
                            </ResponsiveContainer>
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
