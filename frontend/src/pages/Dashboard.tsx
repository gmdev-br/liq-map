import { useState, useEffect, useRef, useMemo, memo } from 'react';
import { format } from 'date-fns';
import { RefreshCw, Filter, TrendingUp, TrendingDown, Activity } from 'lucide-react';
import { useLiquidations, useLiquidationStats } from '@/hooks/useLiquidations';
import { LiquidationCard } from '@/components/LiquidationCard';
import { PriceChart, ExchangeChart } from '@/components/PriceChart';
import { Card, CardContent, CardHeader, Badge } from '@/components/ui/Card';
import { useWebSocket } from '@/hooks/useWebSocket';
import { useCacheData } from '@/hooks/useCacheData';
import { CacheStatus } from '@/components/CacheStatus';
import { liquidationsApi } from '@/services/api';
import type { Liquidation } from '@/types';
import { clsx } from 'clsx';

function parseTimestamp(ts: string | number): Date {
  if (typeof ts === 'number') {
    return ts < 10000000000 ? new Date(ts * 1000) : new Date(ts);
  }
  
  const str = String(ts).trim();
  if (!str) return new Date(NaN);
  
  const num = Number(str);
  if (!isNaN(num)) {
    return num < 10000000000 ? new Date(num * 1000) : new Date(num);
  }
  
  const date = new Date(str);
  if (!isNaN(date.getTime())) {
    return date;
  }
  
  return new Date(NaN);
}

const TimestampCell = memo(({ timestamp }: { timestamp: string | number }) => {
  const formatted = useMemo(() => {
    const dateObj = parseTimestamp(timestamp);
    const isValid = !isNaN(dateObj.getTime());
    return isValid ? format(dateObj, 'HH:mm:ss') : '--:--:--';
  }, [timestamp]);

  return <span className="text-sm text-white/50">{formatted}</span>;
});

export function Dashboard() {
  const [timeRange, setTimeRange] = useState('24h');
  const [liveLiquidations, setLiveLiquidations] = useState<Liquidation[]>([]);

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

  // Use cache data for tracking refresh status
  const { lastUpdated, isStale, refresh } = useCacheData({
    cacheKey: 'dashboard_liquidations',
    fetchFn: () => liquidationsApi.getAll({ page: 1, page_size: 20 }).then((res) => res.data),
    ttlMinutes: 30,
    enabled: false,
  });

  const { lastMessage } = useWebSocket();

  const pendingUpdatesRef = useRef<any[]>([]);
  const updateTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (lastMessage && lastMessage.type === 'liquidation') {
      pendingUpdatesRef.current.push(lastMessage.data);
      
      if (!updateTimerRef.current) {
        updateTimerRef.current = setTimeout(() => {
          setLiveLiquidations((prev) => {
            const newItems = pendingUpdatesRef.current;
            pendingUpdatesRef.current = [];
            updateTimerRef.current = null;
            return [...newItems, ...prev].slice(0, 50);
          });
        }, 100);
      }
    }

    return () => {
      if (updateTimerRef.current) {
        clearTimeout(updateTimerRef.current);
        updateTimerRef.current = null;
      }
    };
  }, [lastMessage]);

  const allLiquidations = [...liveLiquidations, ...(liquidationsData?.data || [])];

  const handleFilter = () => {
    setFilters({
      amount_min: amountMin ? Number(amountMin) : undefined,
      amount_max: amountMax ? Number(amountMax) : undefined,
    });
  };

  const { totalAmount, longLiquidations, shortLiquidations } = allLiquidations.reduce((acc, liq) => ({
    totalAmount: acc.totalAmount + liq.amount,
    longLiquidations: acc.longLiquidations + (liq.side === 'long' ? 1 : 0),
    shortLiquidations: acc.shortLiquidations + (liq.side === 'short' ? 1 : 0)
  }), { totalAmount: 0, longLiquidations: 0, shortLiquidations: 0 });

  return (
    <div className="space-y-6">
      {/* Header Section */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-2xl font-bold text-white">Dashboard</h2>
          <p className="text-white/50 mt-1">Real-time cryptocurrency liquidation tracking</p>
        </div>
        <div className="flex items-center gap-3 flex-wrap">
          <CacheStatus
            lastUpdated={lastUpdated}
            isStale={isStale}
            isLoading={liquidationsLoading}
            onRefresh={() => {
              refresh();
              refetchLiquidations();
            }}
            title="Liquidações"
          />
          <select
            value={timeRange}
            onChange={(e) => setTimeRange(e.target.value)}
            className="h-10 glass-input px-3 text-sm text-white outline-none cursor-pointer"
          >
            <option value="1h" className="bg-gray-900">Last 1 hour</option>
            <option value="24h" className="bg-gray-900">Last 24 hours</option>
            <option value="7d" className="bg-gray-900">Last 7 days</option>
            <option value="30d" className="bg-gray-900">Last 30 days</option>
          </select>
          <button
            onClick={() => refetchLiquidations()}
            className="glass-button inline-flex h-10 items-center gap-2 px-4 text-sm font-medium text-white"
          >
            <RefreshCw className="h-4 w-4" />
            Refresh
          </button>
        </div>
      </div>

      {/* Stats Overview Cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="glass-card p-4">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-sm text-white/50">Total Liquidations</p>
              <p className="text-xl font-bold text-white mt-1">
                ${(stats?.total_amount || totalAmount).toLocaleString()}
              </p>
              <Badge variant="info" className="mt-2">Live Data</Badge>
            </div>
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-blue-500/20 border border-blue-500/20">
              <Activity className="h-5 w-5 text-blue-400" />
            </div>
          </div>
        </div>

        <div className="glass-card p-4">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-sm text-white/50">Long Liquidations</p>
              <p className="text-xl font-bold text-white mt-1">{longLiquidations}</p>
              <Badge variant="danger" className="mt-2">Sell Pressure</Badge>
            </div>
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-red-500/20 border border-red-500/20">
              <TrendingDown className="h-5 w-5 text-red-400" />
            </div>
          </div>
        </div>

        <div className="glass-card p-4">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-sm text-white/50">Short Liquidations</p>
              <p className="text-xl font-bold text-white mt-1">{shortLiquidations}</p>
              <Badge variant="success" className="mt-2">Buy Pressure</Badge>
            </div>
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-green-500/20 border border-green-500/20">
              <TrendingUp className="h-5 w-5 text-green-400" />
            </div>
          </div>
        </div>

        <div className="glass-card p-4">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-sm text-white/50">Active Exchanges</p>
              <p className="text-xl font-bold text-white mt-1">
                {Object.keys(stats?.by_exchange || {}).length}
              </p>
              <Badge variant="default" className="mt-2">Connected</Badge>
            </div>
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-purple-500/20 border border-purple-500/20">
              <Activity className="h-5 w-5 text-purple-400" />
            </div>
          </div>
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
                placeholder="Min Amount"
                value={amountMin}
                onChange={(e) => setAmountMin(e.target.value)}
                className="h-9 w-28 glass-input px-3 text-sm text-white placeholder:text-white/40 outline-none"
              />
              <input
                type="number"
                placeholder="Max Amount"
                value={amountMax}
                onChange={(e) => setAmountMax(e.target.value)}
                className="h-9 w-28 glass-input px-3 text-sm text-white placeholder:text-white/40 outline-none"
              />
              <button
                onClick={handleFilter}
                className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-white/10 px-3 text-sm text-white hover:bg-white/20 transition-colors border border-white/10"
              >
                <Filter className="h-3.5 w-3.5" />
                Filter
              </button>
            </div>
          }
        />
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-white/10 bg-white/5">
                  <th className="px-5 py-3 text-left text-xs font-medium uppercase text-white/50">
                    Time
                  </th>
                  <th className="px-5 py-3 text-left text-xs font-medium uppercase text-white/50">
                    Symbol
                  </th>
                  <th className="px-5 py-3 text-left text-xs font-medium uppercase text-white/50">
                    Side
                  </th>
                  <th className="px-5 py-3 text-left text-xs font-medium uppercase text-white/50">
                    Price
                  </th>
                  <th className="px-5 py-3 text-left text-xs font-medium uppercase text-white/50">
                    Amount
                  </th>
                  <th className="px-5 py-3 text-left text-xs font-medium uppercase text-white/50">
                    Exchange
                  </th>
                </tr>
              </thead>
              <tbody>
                {liquidationsLoading ? (
                  [...Array(5)].map((_, i) => (
                    <tr key={i} className="border-b border-white/5">
                      <td colSpan={6} className="px-5 py-4">
                        <div className="h-3 rounded bg-white/10" />
                      </td>
                    </tr>
                  ))
                ) : allLiquidations.length > 0 ? (
                  allLiquidations.slice(0, 10).map((liquidation) => (
                    <tr
                      key={liquidation.id}
                      className="border-b border-white/5 hover:bg-white/5 transition-colors"
                    >
                      <td className="px-5 py-4">
                        <TimestampCell timestamp={liquidation.timestamp} />
                      </td>
                      <td className="px-5 py-4 font-medium text-white">{liquidation.symbol}</td>
                      <td className="px-5 py-4">
                        <Badge 
                          variant={liquidation.side === 'long' ? 'danger' : 'success'}
                          className="capitalize"
                        >
                          {liquidation.side === 'long' ? (
                            <TrendingDown className="h-3 w-3 mr-1" />
                          ) : (
                            <TrendingUp className="h-3 w-3 mr-1" />
                          )}
                          {liquidation.side}
                        </Badge>
                      </td>
                      <td className="px-5 py-4 text-white">${liquidation.price.toLocaleString()}</td>
                      <td className="px-5 py-4 text-white">
                        ${liquidation.amount.toLocaleString()}
                      </td>
                      <td className="px-5 py-4 text-white/50">
                        {liquidation.exchange}
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr className="border-b border-white/5">
                    <td colSpan={6} className="px-5 py-8 text-center text-sm text-white/50">
                      No liquidations found. Check your API key in settings.
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
