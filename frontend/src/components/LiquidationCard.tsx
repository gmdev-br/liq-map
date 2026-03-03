import { clsx } from 'clsx';
import { TrendingUp, TrendingDown, DollarSign, Activity, Zap, BarChart3, Flame } from 'lucide-react';
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
            className="glass-card h-32 animate-pulse bg-white/5"
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
      gradient: 'from-blue-500/20 via-cyan-500/10 to-transparent',
      iconGradient: 'from-blue-500 to-cyan-500',
      iconColor: 'text-blue-400',
      glow: 'shadow-[0_0_20px_rgba(59,130,246,0.2)]',
    },
    {
      title: 'Total Volume',
      value: formatCurrency(stats.total_volume ?? 0),
      icon: DollarSign,
      gradient: 'from-green-500/20 via-emerald-500/10 to-transparent',
      iconGradient: 'from-green-500 to-emerald-500',
      iconColor: 'text-green-400',
      glow: 'shadow-[0_0_20px_rgba(34,197,94,0.2)]',
    },
    {
      title: 'Largest Liquidation',
      value: formatCurrency(stats.largest_liquidation ?? stats.max_volume ?? 0),
      icon: Flame,
      gradient: 'from-red-500/20 via-orange-500/10 to-transparent',
      iconGradient: 'from-red-500 to-orange-500',
      iconColor: 'text-red-400',
      glow: 'shadow-[0_0_20px_rgba(239,68,68,0.2)]',
    },
    {
      title: 'Avg. Liquidation',
      value: formatCurrency(stats.avg_liquidation ?? stats.avg_volume ?? 0),
      icon: BarChart3,
      gradient: 'from-purple-500/20 via-pink-500/10 to-transparent',
      iconGradient: 'from-purple-500 to-pink-500',
      iconColor: 'text-purple-400',
      glow: 'shadow-[0_0_20px_rgba(168,85,247,0.2)]',
    },
  ], [stats]);

  return (
    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
      {cards.map((card, index) => (
        <div
          key={card.title}
          className={clsx(
            'glass-card p-6 transition-all duration-500 hover:scale-[1.02] group',
            card.glow
          )}
          style={{ animationDelay: `${index * 100}ms` }}
        >
          <div className="flex items-center justify-between">
            <div className="space-y-2">
              <p className="text-sm font-medium text-white/60">
                {card.title}
              </p>
              <p className="text-2xl font-bold text-white group-hover:text-gradient transition-all">
                {card.value}
              </p>
            </div>
            <div
              className={clsx(
                'flex h-12 w-12 items-center justify-center rounded-liquid-sm',
                'bg-gradient-to-br border border-white/10',
                card.gradient
              )}
            >
              <card.icon className={clsx('h-6 w-6 transition-transform group-hover:scale-110', card.iconColor)} />
            </div>
          </div>
          
          {/* Decorative gradient line */}
          <div className={clsx(
            'mt-4 h-1 rounded-full bg-gradient-to-r',
            card.iconGradient,
            'opacity-50 group-hover:opacity-100 transition-opacity'
          )} />
        </div>
      ))}
    </div>
  );
}
