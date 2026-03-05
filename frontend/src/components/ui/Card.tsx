import { clsx } from 'clsx';

interface CardProps {
  children: React.ReactNode;
  className?: string;
  variant?: 'default' | 'glass' | 'gradient' | 'glow';
}

export function Card({ children, className, variant = 'glass' }: CardProps) {
  const variants = {
    default: 'rounded-xl border border-border bg-card shadow-sm',
    glass: 'glass-card',
    gradient: 'glass-card border-blue-500/20',
    glow: 'glass-card border-blue-500/20 shadow-glow',
  };

  return (
    <div className={clsx(variants[variant], className)}>
      {children}
    </div>
  );
}

interface CardHeaderProps {
  title: string;
  description?: string;
  action?: React.ReactNode;
  className?: string;
}

export function CardHeader({ title, description, action, className }: CardHeaderProps) {
  return (
    <div className={clsx('flex items-center justify-between border-b border-white/10 px-5 py-3', className)}>
      <div>
        <h3 className="text-base font-semibold text-gradient">{title}</h3>
        {description && (
          <p className="text-sm text-white/60">{description}</p>
        )}
      </div>
      {action && <div>{action}</div>}
    </div>
  );
}

interface CardContentProps {
  children: React.ReactNode;
  className?: string;
}

export function CardContent({ children, className }: CardContentProps) {
  return <div className={clsx('p-5', className)}>{children}</div>;
}

interface CardFooterProps {
  children: React.ReactNode;
  className?: string;
}

export function CardFooter({ children, className }: CardFooterProps) {
  return (
    <div className={clsx('border-t border-white/10 px-5 py-3', className)}>
      {children}
    </div>
  );
}

// Glass Stat Card Component
interface StatCardProps {
  title: string;
  value: string | number;
  change?: string;
  changeType?: 'positive' | 'negative' | 'neutral';
  icon?: React.ReactNode;
  className?: string;
}

export function StatCard({ title, value, change, changeType = 'neutral', icon, className }: StatCardProps) {
  const changeColors = {
    positive: 'text-green-400',
    negative: 'text-red-400',
    neutral: 'text-white/60',
  };

  return (
    <div className={clsx('glass-card p-4', className)}>
      <div className="flex items-start justify-between">
        <div className="space-y-1">
          <p className="text-sm text-white/60">{title}</p>
          <p className="text-xl font-bold text-white">{value}</p>
          {change && (
            <p className={clsx('text-sm font-medium', changeColors[changeType])}>
              {change}
            </p>
          )}
        </div>
        {icon && (
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-blue-500/20 text-blue-400">
            {icon}
          </div>
        )}
      </div>
    </div>
  );
}

// Glass Badge Component
interface BadgeProps {
  children: React.ReactNode;
  variant?: 'default' | 'success' | 'danger' | 'warning' | 'info';
  className?: string;
}

export function Badge({ children, variant = 'default', className }: BadgeProps) {
  const variants = {
    default: 'bg-white/10 text-white/80 border-white/20',
    success: 'glass-badge-green',
    danger: 'glass-badge-red',
    warning: 'bg-yellow-500/15 text-yellow-400 border-yellow-500/25',
    info: 'glass-badge-blue',
  };

  return (
    <span className={clsx(
      'inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium border',
      variants[variant],
      className
    )}>
      {children}
    </span>
  );
}
