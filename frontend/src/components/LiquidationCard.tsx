import { clsx } from 'clsx';
import { TrendingUp, TrendingDown, DollarSign, Activity, BarChart3, Flame } from 'lucide-react';
import { useMemo } from 'react';
import type { LiquidationStats } from '@/types';

interface LiquidationCardProps {
  stats: LiquidationStats | undefined;
  isLoading: boolean;
}

function formatCurrency(value: number): string {
  if (value >= 1_000_000_000) {
    return `$${(value / 1_000_000_000).toFixed(2)}B`;
  }
  if (value >= 1_000_000) {
    return `$${(value / 1_000_000).toFixed(2)}M`;
  }
  if (value >= 1_000) {
    return `$${(value / 1_000).toFixed(2)}K`;
  }
  return `$${value.toFixed(2)}`;
}

export function LiquidationCard({ stats, isLoading }: LiquidationCardProps) {
  if (isLoading) {
    return (
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {[...Array(4)].map((_, i) => (
          <div
            key={i}
            className="glass-card h-28 bg-white/5"
          />
        ))}
      </div>
    );
  }

  if (!stats) {
    return null;
  }

  const cards = useMemo(() => [
    {
      title: 'Total Liquidations',
      value: (stats.total_liquidations ?? stats.total_count ?? 0).toLocaleString(),
      icon: Activity,
      iconBg: 'bg-blue-500/20',
      iconColor: 'text-blue-400',
      borderColor: 'border-blue-500/20',
    },
    {
      title: 'Total Volume',
      value: formatCurrency(stats.total_volume ?? 0),
      icon: DollarSign,
      iconBg: 'bg-green-500/20',
      iconColor: 'text-green-400',
      borderColor: 'border-green-500/20',
    },
    {
      title: 'Largest Liquidation',
      value: formatCurrency(stats.largest_liquidation ?? stats.max_volume ?? 0),
      icon: Flame,
      iconBg: 'bg-red-500/20',
      iconColor: 'text-red-400',
      borderColor: 'border-red-500/20',
    },
    {
      title: 'Avg. Liquidation',
      value: formatCurrency(stats.avg_liquidation ?? stats.avg_volume ?? 0),
      icon: BarChart3,
      iconBg: 'bg-purple-500/20',
      iconColor: 'text-purple-400',
      borderColor: 'border-purple-500/20',
    },
  ], [stats]);

  return (
    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
      {cards.map((card) => (
        <div
          key={card.title}
          className="glass-card p-5 hover:bg-white/5 transition-colors"
        >
          <div className="flex items-center justify-between">
            <div className="space-y-1">
              <p className="text-sm font-medium text-white/60">
                {card.title}
              </p>
              <p className="text-xl font-bold text-white">
                {card.value}
              </p>
            </div>
            <div
              className={clsx(
                'flex h-10 w-10 items-center justify-center rounded-lg border',
                card.iconBg,
                card.borderColor
              )}
            >
              <card.icon className={clsx('h-5 w-5', card.iconColor)} />
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
