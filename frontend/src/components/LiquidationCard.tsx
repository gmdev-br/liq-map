import { clsx } from 'clsx';
import { TrendingUp, TrendingDown, DollarSign, Activity } from 'lucide-react';
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
            className="h-32 animate-pulse rounded-lg bg-muted"
          />
        ))}
      </div>
    );
  }

  if (!stats) {
    return null;
  }

  const cards = [
    {
      title: 'Total Liquidations',
      value: (stats.total_liquidations ?? stats.total_count ?? 0).toLocaleString(),
      icon: Activity,
      color: 'text-blue-500',
      bgColor: 'bg-blue-500/10',
    },
    {
      title: 'Total Volume',
      value: formatCurrency(stats.total_volume ?? 0),
      icon: DollarSign,
      color: 'text-green-500',
      bgColor: 'bg-green-500/10',
    },
    {
      title: 'Largest Liquidation',
      value: formatCurrency(stats.largest_liquidation ?? stats.max_volume ?? 0),
      icon: TrendingUp,
      color: 'text-red-500',
      bgColor: 'bg-red-500/10',
    },
    {
      title: 'Avg. Liquidation',
      value: formatCurrency(stats.avg_liquidation ?? stats.avg_volume ?? 0),
      icon: TrendingDown,
      color: 'text-yellow-500',
      bgColor: 'bg-yellow-500/10',
    },
  ];

  return (
    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
      {cards.map((card) => (
        <div
          key={card.title}
          className="rounded-xl border border-border bg-card p-6 shadow-sm transition-all hover:shadow-md"
        >
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-muted-foreground">
                {card.title}
              </p>
              <p className="mt-2 text-2xl font-bold">{card.value}</p>
            </div>
            <div
              className={clsx(
                'flex h-12 w-12 items-center justify-center rounded-lg',
                card.bgColor
              )}
            >
              <card.icon className={clsx('h-6 w-6', card.color)} />
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
