import { useState, useEffect } from 'react';
import { format } from 'date-fns';
import { RefreshCw, Filter, Download } from 'lucide-react';
import { useLiquidations, useLiquidationStats } from '@/hooks/useLiquidations';
import { LiquidationCard } from '@/components/LiquidationCard';
import { PriceChart, ExchangeChart } from '@/components/PriceChart';
import { Card, CardContent, CardHeader } from '@/components/ui/Card';
import { useWebSocket } from '@/hooks/useWebSocket';
import type { Liquidation } from '@/types';

export function Dashboard() {
  const [timeRange, setTimeRange] = useState('24h');
  const [liveLiquidations, setLiveLiquidations] = useState<Liquidation[]>([]);

  // Filter states
  const [amountMin, setAmountMin] = useState<string>('');
  const [amountMax, setAmountMax] = useState<string>('');
  const [filters, setFilters] = useState<{
    amount_min?: number;
    amount_max?: number;
  }>({});

  const { data: liquidationsData, isLoading: liquidationsLoading, refetch: refetchLiquidations } = useLiquidations({
    page: 1,
    page_size: 20,
    amount_min: filters.amount_min,
    amount_max: filters.amount_max,
  });

  const { data: stats, isLoading: statsLoading } = useLiquidationStats();

  // WebSocket for real-time data
  const { lastMessage } = useWebSocket();

  useEffect(() => {
    if (lastMessage && lastMessage.type === 'liquidation') {
      setLiveLiquidations((prev) => [lastMessage.data, ...prev].slice(0, 50));
    }
  }, [lastMessage]);

  const allLiquidations = [...liveLiquidations, ...(liquidationsData?.data || [])];

  const handleFilter = () => {
    setFilters({
      amount_min: amountMin ? Number(amountMin) : undefined,
      amount_max: amountMax ? Number(amountMax) : undefined,
    });
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-2xl font-bold">Dashboard</h2>
          <p className="text-muted-foreground">Real-time cryptocurrency liquidation tracking</p>
        </div>
        <div className="flex items-center gap-2">
          <select
            value={timeRange}
            onChange={(e) => setTimeRange(e.target.value)}
            className="h-9 rounded-md border border-input bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-ring"
          >
            <option value="1h">Last 1 hour</option>
            <option value="24h">Last 24 hours</option>
            <option value="7d">Last 7 days</option>
            <option value="30d">Last 30 days</option>
          </select>
          <button
            onClick={() => refetchLiquidations()}
            className="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
          >
            <RefreshCw className="h-4 w-4" />
            Refresh
          </button>
        </div>
      </div>

      {/* Stats Cards */}
      <LiquidationCard stats={stats} isLoading={statsLoading} />

      {/* Charts */}
      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader title="Liquidation Trend" description="Total liquidations over time" />
          <CardContent>
            <PriceChart
              data={allLiquidations.slice(0, 50)}
              type="area"
              dataKey="amount"
              xAxisKey="timestamp"
              color="#3b82f6"
              height={300}
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader title="By Exchange" description="Liquidation volume by exchange" />
          <CardContent>
            <ExchangeChart data={stats?.by_exchange || {}} />
          </CardContent>
        </Card>
      </div>

      {/* Recent Liquidations Table */}
      <Card>
        <CardHeader
          title="Recent Liquidations"
          description="Latest liquidation events"
          action={
            <div className="flex items-center gap-2">
              <input
                type="number"
                placeholder="Quantidade Mínima"
                value={amountMin}
                onChange={(e) => setAmountMin(e.target.value)}
                className="h-8 rounded-md border border-input bg-background px-2 text-sm outline-none focus:ring-2 focus:ring-ring w-32"
              />
              <input
                type="number"
                placeholder="Quantidade Máxima"
                value={amountMax}
                onChange={(e) => setAmountMax(e.target.value)}
                className="h-8 rounded-md border border-input bg-background px-2 text-sm outline-none focus:ring-2 focus:ring-ring w-32"
              />
              <button
                onClick={handleFilter}
                className="inline-flex items-center gap-2 rounded-md border border-input bg-background px-3 py-1.5 text-sm hover:bg-accent"
              >
                <Filter className="h-4 w-4" />
                Filtrar
              </button>
            </div>
          }
        />
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-border bg-muted/50">
                  <th className="px-6 py-3 text-left text-xs font-medium uppercase text-muted-foreground">
                    Time
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium uppercase text-muted-foreground">
                    Symbol
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium uppercase text-muted-foreground">
                    Side
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium uppercase text-muted-foreground">
                    Price
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium uppercase text-muted-foreground">
                    Amount
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium uppercase text-muted-foreground">
                    Exchange
                  </th>
                </tr>
              </thead>
              <tbody>
                {liquidationsLoading ? (
                  [...Array(10)].map((_, i) => (
                    <tr key={i} className="border-b border-border">
                      <td colSpan={6} className="px-6 py-4">
                        <div className="h-4 animate-pulse rounded bg-muted" />
                      </td>
                    </tr>
                  ))
                ) : allLiquidations.length > 0 ? (
                  allLiquidations.slice(0, 10).map((liquidation) => (
                    <tr
                      key={liquidation.id}
                      className="border-b border-border transition-colors hover:bg-muted/50"
                    >
                      <td className="px-6 py-4 text-sm text-muted-foreground">
                        {format(new Date(liquidation.timestamp), 'HH:mm:ss')}
                      </td>
                      <td className="px-6 py-4 font-medium">{liquidation.symbol}</td>
                      <td className="px-6 py-4">
                        <span
                          className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${liquidation.side === 'long'
                              ? 'bg-red-500/10 text-red-500'
                              : 'bg-green-500/10 text-green-500'
                            }`}
                        >
                          {liquidation.side.toUpperCase()}
                        </span>
                      </td>
                      <td className="px-6 py-4">${liquidation.price.toLocaleString()}</td>
                      <td className="px-6 py-4">
                        ${liquidation.amount.toLocaleString()}
                      </td>
                      <td className="px-6 py-4 text-muted-foreground">
                        {liquidation.exchange}
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr className="border-b border-border">
                    <td colSpan={6} className="px-6 py-8 text-center text-sm text-muted-foreground">
                      Nenhuma liquidação encontrada. Verifique sua chave de API nas configurações.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
