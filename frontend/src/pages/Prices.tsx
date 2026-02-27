import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend, ComposedChart } from 'recharts';
import { TrendingUp, TrendingDown, RefreshCw, Loader2 } from 'lucide-react';
import { exchangesApi, symbolsApi } from '@/services/api';
import { useTechnicalIndicators } from '@/hooks/usePrices';
import { Card, CardContent, CardHeader } from '@/components/ui/Card';
import { clsx } from 'clsx';

export function Prices() {
  const [selectedExchange, setSelectedExchange] = useState<string>('binance');
  const [selectedSymbol, setSelectedSymbol] = useState<string>('BTC/USDT');
  const [timeInterval, setTimeInterval] = useState<string>('1h');

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

  // Mock price data (replace with actual API call)
  const mockPriceData = [
    { time: '00:00', price: 42000, volume: 1200 },
    { time: '04:00', price: 42500, volume: 1500 },
    { time: '08:00', price: 41800, volume: 1800 },
    { time: '12:00', price: 43200, volume: 2200 },
    { time: '16:00', price: 42800, volume: 1900 },
    { time: '20:00', price: 43500, volume: 2100 },
    { time: '24:00', price: 44000, volume: 2500 },
  ];

  const priceChange = mockPriceData[mockPriceData.length - 1].price - mockPriceData[0].price;
  const priceChangePercent = (priceChange / mockPriceData[0].price) * 100;

  // Ticks para o eixo de preço (50000-100000 com intervalo de 200)
  const priceTicks = [];
  for (let i = 50000; i <= 100000; i += 200) {
    priceTicks.push(i);
  }

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
            <p className="text-3xl font-bold">${mockPriceData[mockPriceData.length - 1].price.toLocaleString()}</p>
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
            <p className="text-3xl font-bold">{(mockPriceData.reduce((acc, d) => acc + d.volume, 0)).toLocaleString()}</p>
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
        <CardHeader title={`${selectedSymbol} Price Chart`} description={`${selectedExchange.toUpperCase()} - ${timeInterval}`} />
        <CardContent>
          <div className="h-[400px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={mockPriceData}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                <XAxis dataKey="time" className="text-xs" />
                
                {/* Eixo Y para PREÇO (esquerda) */}
                <YAxis 
                  yAxisId="price"
                  domain={[50000, 100000]}
                  ticks={priceTicks}
                  orientation="left"
                  className="text-xs" 
                  tickFormatter={(value) => `${value.toLocaleString()}`}
                />
                
                {/* Eixo Y para VOLUME (direita) */}
                <YAxis 
                  yAxisId="volume"
                  orientation="right"
                  className="text-xs"
                  domain={['auto', 'auto']}
                />
                
                <Tooltip
                  contentStyle={{
                    backgroundColor: 'hsl(var(--card))',
                    border: '1px solid hsl(var(--border))',
                    borderRadius: '8px',
                  }}
                />
                <Legend />
                <Line
                  yAxisId="price"
                  type="monotone"
                  dataKey="price"
                  stroke="#3b82f6"
                  strokeWidth={2}
                  dot={false}
                  name="Price"
                />
                <Line
                  yAxisId="volume"
                  type="monotone"
                  dataKey="volume"
                  stroke="#10b981"
                  strokeWidth={2}
                  dot={false}
                  name="Volume"
                />
              </ComposedChart>
            </ResponsiveContainer>
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
