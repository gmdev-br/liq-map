import { useState, useEffect, useRef } from 'react';
import { format } from 'date-fns';
import { RefreshCw, Filter, Download, TrendingUp, TrendingDown, Activity } from 'lucide-react';
import { useLiquidations, useLiquidationStats } from '@/hooks/useLiquidations';
import { LiquidationCard } from '@/components/LiquidationCard';
import { PriceChart, ExchangeChart } from '@/components/PriceChart';
import { Card, CardContent, CardHeader, Badge } from '@/components/ui/Card';
import { useWebSocket } from '@/hooks/useWebSocket';
import type { Liquidation } from '@/types';
import { clsx } from 'clsx';

/**
 * Robust timestamp parser that handles multiple formats:
 * - Unix seconds (e.g., 1769817600) - multiply by 1000
 * - Unix milliseconds (e.g., 1772378210230) - use as-is
 * - ISO strings (e.g., '2026-03-01T15:16:50.230Z') - parse directly
 */
function parseTimestamp(ts: string | number): Date {
  // If already a number, process directly
  if (typeof ts === 'number') {
    // If less than 10 billion, assume seconds; otherwise milliseconds
    return ts < 10000000000 ? new Date(ts * 1000) : new Date(ts);
  }
  
  // If string, try to parse it
  const str = String(ts).trim();
  if (!str) return new Date(NaN);
  
  // Try parsing as number first (could be numeric string)
  const num = Number(str);
  if (!isNaN(num)) {
    // Numeric string: check if seconds or milliseconds
    // Seconds would be < 10 billion, milliseconds >= 10 billion
    return num < 10000000000 ? new Date(num * 1000) : new Date(num);
  }
  
  // Try parsing as ISO string or other date format
  const date = new Date(str);
  if (!isNaN(date.getTime())) {
    return date;
  }
  
  // Failed to parse
  return new Date(NaN);
}

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

  // Use refs to batch updates and prevent render thrashing
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
        }, 100); // Batch updates every 100ms
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

  // OPTIMIZED: Single reduce instead of multiple filter operations
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
          <h2 className="text-3xl font-bold text-gradient">Dashboard</h2>
          <p className="text-white/50 mt-1">Real-time cryptocurrency liquidation tracking</p>
        </div>
        <div className="flex items-center gap-3">
          <select
            value={timeRange}
            onChange={(e) => setTimeRange(e.target.value)}
            className="h-11 glass-input px-4 text-sm text-white outline-none cursor-pointer"
          >
            <option value="1h" className="bg-gray-900">Last 1 hour</option>
            <option value="24h" className="bg-gray-900">Last 24 hours</option>
            <option value="7d" className="bg-gray-900">Last 7 days</option>
            <option value="30d" className="bg-gray-900">Last 30 days</option>
          </select>
          <button
            onClick={() => refetchLiquidations()}
            className="glass-button inline-flex h-11 items-center gap-2 px-5 text-sm font-medium text-white"
          >
            <RefreshCw className="h-4 w-4" />
            Refresh
          </button>
        </div>
      </div>

      {/* Stats Overview Cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="glass-card p-5">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-sm text-white/50">Total Liquidations</p>
              <p className="text-2xl font-bold text-white mt-1">
                ${(stats?.total_amount || totalAmount).toLocaleString()}
              </p>
              <Badge variant="info" className="mt-2">Live Data</Badge>
            </div>
            <div className="flex h-11 w-11 items-center justify-center rounded-liquid-sm bg-gradient-to-br from-blue-500/20 to-cyan-500/20 border border-blue-500/20">
              <Activity className="h-5 w-5 text-blue-400" />
            </div>
          </div>
        </div>

        <div className="glass-card p-5">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-sm text-white/50">Long Liquidations</p>
              <p className="text-2xl font-bold text-white mt-1">{longLiquidations}</p>
              <Badge variant="danger" className="mt-2">Sell Pressure</Badge>
            </div>
            <div className="flex h-11 w-11 items-center justify-center rounded-liquid-sm bg-gradient-to-br from-red-500/20 to-orange-500/20 border border-red-500/20">
              <TrendingDown className="h-5 w-5 text-red-400" />
            </div>
          </div>
        </div>

        <div className="glass-card p-5">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-sm text-white/50">Short Liquidations</p>
              <p className="text-2xl font-bold text-white mt-1">{shortLiquidations}</p>
              <Badge variant="success" className="mt-2">Buy Pressure</Badge>
            </div>
            <div className="flex h-11 w-11 items-center justify-center rounded-liquid-sm bg-gradient-to-br from-green-500/20 to-emerald-500/20 border border-green-500/20">
              <TrendingUp className="h-5 w-5 text-green-400" />
            </div>
          </div>
        </div>

        <div className="glass-card p-5">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-sm text-white/50">Active Exchanges</p>
              <p className="text-2xl font-bold text-white mt-1">
                {Object.keys(stats?.by_exchange || {}).length}
              </p>
              <Badge variant="default" className="mt-2">Connected</Badge>
            </div>
            <div className="flex h-11 w-11 items-center justify-center rounded-liquid-sm bg-gradient-to-br from-purple-500/20 to-pink-500/20 border border-purple-500/20">
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
                className="inline-flex h-9 items-center gap-1.5 rounded-liquid-sm bg-white/10 px-3 text-sm text-white hover:bg-white/20 transition-all border border-white/10"
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
                  <th className="px-6 py-3 text-left text-xs font-medium uppercase text-white/50">
                    Time
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium uppercase text-white/50">
                    Symbol
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium uppercase text-white/50">
                    Side
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium uppercase text-white/50">
                    Price
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium uppercase text-white/50">
                    Amount
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium uppercase text-white/50">
                    Exchange
                  </th>
                </tr>
              </thead>
              <tbody>
                {liquidationsLoading ? (
                  [...Array(5)].map((_, i) => (
                    <tr key={i} className="border-b border-white/5">
                      <td colSpan={6} className="px-6 py-4">
                        <div className="h-4 animate-pulse rounded bg-white/10" />
                      </td>
                    </tr>
                  ))
                ) : allLiquidations.length > 0 ? (
                  allLiquidations.slice(0, 10).map((liquidation, index) => (
                    <tr
                      key={liquidation.id}
                      className="border-b border-white/5 transition-all duration-300 hover:bg-white/5"
                      style={{ animationDelay: `${index * 50}ms` }}
                    >
                      <td className="px-6 py-4 text-sm text-white/50">
                        {(() => {
                          const ts = liquidation.timestamp;
                          const dateObj = parseTimestamp(ts);
                          const isValid = !isNaN(dateObj.getTime());
                          return isValid ? format(dateObj, 'HH:mm:ss') : '--:--:--';
                        })()}
                      </td>
                      <td className="px-6 py-4 font-medium text-white">{liquidation.symbol}</td>
                      <td className="px-6 py-4">
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
                      <td className="px-6 py-4 text-white">${liquidation.price.toLocaleString()}</td>
                      <td className="px-6 py-4 text-white">
                        ${liquidation.amount.toLocaleString()}
                      </td>
                      <td className="px-6 py-4 text-white/50">
                        {liquidation.exchange}
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr className="border-b border-white/5">
                    <td colSpan={6} className="px-6 py-8 text-center text-sm text-white/50">
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
