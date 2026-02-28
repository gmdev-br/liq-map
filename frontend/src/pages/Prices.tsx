import { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { TrendingUp, TrendingDown, RefreshCw, Loader2 } from 'lucide-react';
import { exchangesApi, symbolsApi } from '@/services/api';
import { useTechnicalIndicators } from '@/hooks/usePrices';
import { Card, CardContent, CardHeader } from '@/components/ui/Card';
import { clsx } from 'clsx';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  BarElement,
  Title,
  Tooltip,
  Legend,
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
  Title,
  Tooltip,
  Legend,
  zoomPlugin
);

export function Prices() {
  const [selectedExchange, setSelectedExchange] = useState<string>('binance');
  const [selectedSymbol, setSelectedSymbol] = useState<string>('BTC/USDT');
  const [timeInterval, setTimeInterval] = useState<string>('1h');
  const [groupBy, setGroupBy] = useState<'none' | 'long' | 'short'>('none');

  // Fetch exchanges
  const { data: exchanges } = useQuery({
    queryKey: ['exchanges'],
    queryFn: async () => {
      const response = await exchangesApi.getAll();
      console.log('Exchanges API response:', response);
      console.log('Exchanges data:', response.data);
      return response.data.exchanges;
    },
  });

  // Fetch symbols for selected exchange
  const { data: symbols } = useQuery({
    queryKey: ['symbols', selectedExchange],
    queryFn: () => symbolsApi.getByExchange(selectedExchange),
    enabled: !!selectedExchange,
  });

  // Fetch technical indicators
  const { data: indicators, isLoading: indicatorsLoading } = useTechnicalIndicators({
    symbol: selectedSymbol,
    exchange: selectedExchange,
    interval: timeInterval,
  });

  // Mock price data with long/short sides (replace with actual API call)
  const mockPriceData = [
    { time: '00:00', price: 42000, volume: 1200, side: 'long' },
    { time: '02:00', price: 42100, volume: 800, side: 'short' },
    { time: '04:00', price: 42500, volume: 1500, side: 'long' },
    { time: '06:00', price: 42300, volume: 900, side: 'short' },
    { time: '08:00', price: 41800, volume: 1800, side: 'long' },
    { time: '10:00', price: 41900, volume: 1100, side: 'short' },
    { time: '12:00', price: 43200, volume: 2200, side: 'long' },
    { time: '14:00', price: 43000, volume: 1600, side: 'short' },
    { time: '16:00', price: 42800, volume: 1900, side: 'long' },
    { time: '18:00', price: 42900, volume: 1400, side: 'short' },
    { time: '20:00', price: 43500, volume: 2100, side: 'long' },
    { time: '22:00', price: 43300, volume: 1800, side: 'short' },
    { time: '24:00', price: 44000, volume: 2500, side: 'long' },
  ];

  // Filter data based on groupBy selection
  const filteredPriceData = useMemo(() => {
    if (groupBy === 'none') return mockPriceData;
    return mockPriceData.filter(d => d.side === groupBy);
  }, [mockPriceData, groupBy]);

  // Calculate price change with empty data check
  const priceChange = filteredPriceData.length > 1 
    ? filteredPriceData[filteredPriceData.length - 1].price - filteredPriceData[0].price 
    : 0;
  const priceChangePercent = filteredPriceData.length > 1 && filteredPriceData[0].price > 0
    ? (priceChange / filteredPriceData[0].price) * 100
    : 0;

  // Chart data
  const chartData: ChartData<'bar' | 'line'> = useMemo(() => {
    return {
      labels: filteredPriceData.map((d) => d.time),
      datasets: [
        {
          type: 'line' as const,
          label: 'Price',
          data: filteredPriceData.map((d) => d.price),
          borderColor: groupBy === 'long' ? '#10b981' : groupBy === 'short' ? '#ef4444' : '#3b82f6',
          backgroundColor: 'transparent',
          borderWidth: 2,
          pointRadius: 0,
          pointHoverRadius: 6,
          yAxisID: 'y',
          tension: 0.4,
        },
        {
          type: 'bar' as const,
          label: 'Volume',
          data: filteredPriceData.map((d) => d.volume),
          backgroundColor: groupBy === 'long' ? '#10b981' : groupBy === 'short' ? '#ef4444' : '#10b981',
          borderRadius: 4,
          yAxisID: 'y1',
        },
      ],
    };
  }, [filteredPriceData, groupBy]);

  const chartOptions: ChartOptions<'bar' | 'line'> = {
    responsive: true,
    maintainAspectRatio: false,
    interaction: {
      mode: 'index',
      intersect: false,
    },
    plugins: {
      legend: {
        display: true,
        labels: {
          color: 'hsl(var(--muted-foreground))',
        },
      },
      tooltip: {
        backgroundColor: 'hsl(var(--card))',
        titleColor: 'hsl(var(--card-foreground))',
        bodyColor: 'hsl(var(--card-foreground))',
        borderColor: 'hsl(var(--border))',
        borderWidth: 1,
        padding: 12,
        cornerRadius: 8,
        callbacks: {
          label: (context) => {
            const value = context.parsed.y ?? 0;
            const label = context.dataset.label || '';
            if (label === 'Price') return `Price: ${Number(value).toLocaleString()}`;
            return `${label}: ${value.toLocaleString()}`;
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
          mode: 'x',
        },
      },
    },
    scales: {
      x: {
        grid: {
          color: 'hsl(var(--muted) / 0.3)',
        },
        ticks: {
          color: 'hsl(var(--muted-foreground))',
          font: {
            size: 11,
          },
        },
      },
      y: {
        type: 'linear',
        display: true,
        position: 'left',
        grid: {
          color: 'hsl(var(--muted) / 0.3)',
        },
        ticks: {
          color: 'hsl(var(--muted-foreground))',
          font: {
            size: 11,
          },
          callback: (value) => `$${Number(value).toLocaleString()}`,
        },
        min: 40000,
        max: 50000,
      },
      y1: {
        type: 'linear',
        display: true,
        position: 'right',
        grid: {
          drawOnChartArea: false,
        },
        ticks: {
          color: 'hsl(var(--muted-foreground))',
          font: {
            size: 11,
          },
        },
      },
    },
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-2xl font-bold">Prices</h2>
          <p className="text-muted-foreground">Cryptocurrency prices and technical analysis</p>
        </div>
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="flex flex-wrap gap-4 p-4">
          <div className="flex flex-col gap-1">
            <label className="text-sm font-medium">Exchange</label>
            <select
              value={selectedExchange}
              onChange={(e) => setSelectedExchange(e.target.value)}
              className="h-9 rounded-md border border-input bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-ring"
            >
              {exchanges?.map((exchange) => (
                <option key={exchange.id} value={exchange.id}>
                  {exchange.name}
                </option>
              ))}
              <option value="binance">Binance</option>
              <option value="bybit">Bybit</option>
              <option value="okx">OKX</option>
              <option value="ftx">FTX</option>
            </select>
          </div>

          <div className="flex flex-col gap-1">
            <label className="text-sm font-medium">Symbol</label>
            <select
              value={selectedSymbol}
              onChange={(e) => setSelectedSymbol(e.target.value)}
              className="h-9 rounded-md border border-input bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-ring"
            >
              <option value="BTC/USDT">BTC/USDT</option>
              <option value="ETH/USDT">ETH/USDT</option>
              <option value="SOL/USDT">SOL/USDT</option>
              <option value="BNB/USDT">BNB/USDT</option>
            </select>
          </div>

          <div className="flex flex-col gap-1">
            <label className="text-sm font-medium">Interval</label>
            <select
              value={timeInterval}
              onChange={(e) => setTimeInterval(e.target.value)}
              className="h-9 rounded-md border border-input bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-ring"
            >
              <option value="1m">1 Minute</option>
              <option value="5m">5 Minutes</option>
              <option value="15m">15 Minutes</option>
              <option value="1h">1 Hour</option>
              <option value="4h">4 Hours</option>
              <option value="1d">1 Day</option>
            </select>
          </div>

          <div className="flex flex-col gap-1">
            <label className="text-sm font-medium">Group By</label>
            <select
              value={groupBy}
              onChange={(e) => setGroupBy(e.target.value as 'none' | 'long' | 'short')}
              className="h-9 rounded-md border border-input bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-ring"
            >
              <option value="none">All</option>
              <option value="long">Long Only</option>
              <option value="short">Short Only</option>
            </select>
          </div>

          <div className="flex items-end">
            <button className="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90">
              <RefreshCw className="h-4 w-4" />
              Refresh
            </button>
          </div>
        </CardContent>
      </Card>

      {/* Price Info */}
      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardContent className="p-6">
            <p className="text-sm text-muted-foreground">Current Price</p>
            <p className="text-3xl font-bold">${filteredPriceData.length > 0 ? filteredPriceData[filteredPriceData.length - 1].price.toLocaleString() : '0'}</p>
            <div className={clsx(
              'mt-2 flex items-center gap-1 text-sm',
              priceChange >= 0 ? 'text-green-500' : 'text-red-500'
            )}>
              {priceChange >= 0 ? <TrendingUp className="h-4 w-4" /> : <TrendingDown className="h-4 w-4" />}
              <span>{priceChange >= 0 ? '+' : ''}{priceChangePercent.toFixed(2)}%</span>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-6">
            <p className="text-sm text-muted-foreground">24h Volume</p>
            <p className="text-3xl font- bold">{(filteredPriceData.reduce((acc, d) => acc + d.volume, 0)).toLocaleString()}</p>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-6">
            <p className="text-sm text-muted-foreground">RSI (14)</p>
            <p className="text-3xl font-bold">{indicatorsLoading ? '...' : indicators?.rsi_14?.toFixed(2) || '65.42'}</p>
            <p className="mt-2 text-xs text-muted-foreground">
              {indicators && Number(indicators.rsi_14) > 70 ? 'Overbought' : Number(indicators?.rsi_14) < 30 ? 'Oversold' : 'Neutral'}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Price Chart */}
      <Card>
        <CardHeader 
          title={`${selectedSymbol} Price Chart`} 
          description={`${selectedExchange.toUpperCase()} - ${timeInterval}${groupBy !== 'none' ? ` - ${groupBy.toUpperCase()} only` : ''}`} 
        />
        <CardContent>
          <div className="h-[400px] w-full">
            <Chart type="bar" data={chartData} options={chartOptions} />
          </div>
        </CardContent>
      </Card>

      {/* Technical Indicators */}
      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader title="Moving Averages" description="Simple and Exponential Moving Averages" />
          <CardContent>
            {indicatorsLoading ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            ) : (
              <div className="space-y-4">
                <div className="flex items-center justify-between border-b border-border pb-2">
                  <span className="text-muted-foreground">SMA 20</span>
                  <span className="font-medium">{indicators?.sma_20?.toFixed(2) || '43,250.00'}</span>
                </div>
                <div className="flex items-center justify-between border-b border-border pb-2">
                  <span className="text-muted-foreground">SMA 50</span>
                  <span className="font-medium">{indicators?.sma_50?.toFixed(2) || '42,800.00'}</span>
                </div>
                <div className="flex items-center justify-between border-b border-border pb-2">
                  <span className="text-muted-foreground">SMA 200</span>
                  <span className="font-medium">{indicators?.sma_200?.toFixed(2) || '41,500.00'}</span>
                </div>
                <div className="flex items-center justify-between border-b border-border pb-2">
                  <span className="text-muted-foreground">EMA 12</span>
                  <span className="font-medium">{indicators?.ema_12?.toFixed(2) || '43,350.00'}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">EMA 26</span>
                  <span className="font-medium">{indicators?.ema_26?.toFixed(2) || '43,100.00'}</span>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader title="MACD" description="Moving Average Convergence Divergence" />
          <CardContent>
            {indicatorsLoading ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            ) : (
              <div className="space-y-4">
                <div className="flex items-center justify-between border-b border-border pb-2">
                  <span className="text-muted-foreground">MACD Line</span>
                  <span className="font-medium">{indicators?.macd?.value?.toFixed(4) || '125.50'}</span>
                </div>
                <div className="flex items-center justify-between border-b border-border pb-2">
                  <span className="text-muted-foreground">Signal Line</span>
                  <span className="font-medium">{indicators?.macd?.signal?.toFixed(4) || '118.25'}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">Histogram</span>
                  <span className={clsx(
                    'font-medium',
                    (indicators?.macd?.histogram || 7.25) >= 0 ? 'text-green-500' : 'text-red-500'
                  )}>
                    {(indicators?.macd?.histogram || 7.25) >= 0 ? '+' : ''}{indicators?.macd?.histogram?.toFixed(4) || '7.2500'}
                  </span>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
