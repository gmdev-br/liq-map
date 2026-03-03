import { useState } from 'react';
import { format } from 'date-fns';
import { Trash2, Bell, BellOff, CheckCircle2, XCircle, TrendingUp, TrendingDown, ArrowLeftRight } from 'lucide-react';
import { clsx } from 'clsx';
import { Badge } from '@/components/ui/Card';
import type { Alert } from '@/types';

interface AlertsTableProps {
  alerts: Alert[];
  isLoading: boolean;
  onToggle?: (id: string) => void;
  onDelete?: (id: string) => void;
}

const conditionIcons = {
  above: TrendingUp,
  below: TrendingDown,
  crosses: ArrowLeftRight,
};

const conditionColors = {
  above: 'text-green-400 bg-green-500/10 border-green-500/20',
  below: 'text-red-400 bg-red-500/10 border-red-500/20',
  crosses: 'text-blue-400 bg-blue-500/10 border-blue-500/20',
};

export function AlertsTable({ alerts, isLoading, onToggle, onDelete }: AlertsTableProps) {
  const [sortField, setSortField] = useState<keyof Alert>('created_at');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('desc');

  const handleSort = (field: keyof Alert) => {
    if (sortField === field) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDirection('desc');
    }
  };

  const sortedAlerts = [...alerts].sort((a, b) => {
    const aVal = a[sortField] ?? '';
    const bVal = b[sortField] ?? '';
    if (aVal === bVal) return 0;
    const comparison = aVal < bVal ? -1 : 1;
    return sortDirection === 'asc' ? comparison : -comparison;
  });

  if (isLoading) {
    return (
      <div className="space-y-3 p-4">
        {[...Array(5)].map((_, i) => (
          <div key={i} className="h-16 animate-pulse rounded-liquid-sm bg-white/5" />
        ))}
      </div>
    );
  }

  if (alerts.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center">
        <div className="flex h-16 w-16 items-center justify-center rounded-full bg-white/5 border border-white/10 mb-4">
          <BellOff className="h-8 w-8 text-white/30" />
        </div>
        <p className="text-lg font-medium text-white/70">No alerts yet</p>
        <p className="text-sm text-white/40 mt-1">
          Create an alert to get notified when prices reach your target
        </p>
      </div>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full">
        <thead>
          <tr className="border-b border-white/10 bg-white/5">
            <th
              className="px-6 py-4 text-left text-xs font-medium uppercase text-white/50 cursor-pointer hover:text-white/70 transition-colors"
              onClick={() => handleSort('symbol')}
            >
              Symbol
            </th>
            <th className="px-6 py-4 text-left text-xs font-medium uppercase text-white/50">
              Condition
            </th>
            <th
              className="px-6 py-4 text-left text-xs font-medium uppercase text-white/50 cursor-pointer hover:text-white/70 transition-colors"
              onClick={() => handleSort('price')}
            >
              Price
            </th>
            <th
              className="px-6 py-4 text-left text-xs font-medium uppercase text-white/50 cursor-pointer hover:text-white/70 transition-colors"
              onClick={() => handleSort('active')}
            >
              Status
            </th>
            <th
              className="px-6 py-4 text-left text-xs font-medium uppercase text-white/50 cursor-pointer hover:text-white/70 transition-colors"
              onClick={() => handleSort('created_at')}
            >
              Created
            </th>
            <th className="px-6 py-4 text-right text-xs font-medium uppercase text-white/50">
              Actions
            </th>
          </tr>
        </thead>
        <tbody>
          {sortedAlerts.map((alert, index) => {
            const ConditionIcon = conditionIcons[alert.condition];
            return (
              <tr
                key={alert.id}
                className="border-b border-white/5 transition-all duration-300 hover:bg-white/5 group"
                style={{ animationDelay: `${index * 50}ms` }}
              >
                <td className="px-6 py-4">
                  <span className="font-semibold text-white">{alert.symbol}</span>
                </td>
                <td className="px-6 py-4">
                  <div className={clsx(
                    'inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium border backdrop-blur-sm',
                    conditionColors[alert.condition]
                  )}>
                    <ConditionIcon className="h-3 w-3" />
                    {alert.condition.toUpperCase()}
                  </div>
                </td>
                <td className="px-6 py-4 text-white font-medium">
                  ${alert.price.toLocaleString()}
                </td>
                <td className="px-6 py-4">
                  <div className="flex items-center gap-2">
                    {alert.active ? (
                      <div className="flex h-6 w-6 items-center justify-center rounded-full bg-green-500/20">
                        <CheckCircle2 className="h-4 w-4 text-green-400" />
                      </div>
                    ) : (
                      <div className="flex h-6 w-6 items-center justify-center rounded-full bg-white/10">
                        <XCircle className="h-4 w-4 text-white/40" />
                      </div>
                    )}
                    <span
                      className={clsx(
                        'text-sm',
                        alert.active ? 'text-green-400' : 'text-white/40'
                      )}
                    >
                      {alert.active ? 'Active' : 'Inactive'}
                    </span>
                    {alert.triggered && (
                      <Badge variant="danger" className="text-xs">
                        Triggered
                      </Badge>
                    )}
                  </div>
                </td>
                <td className="px-6 py-4 text-sm text-white/50">
                  {format(new Date(alert.created_at), 'MMM dd, yyyy HH:mm')}
                </td>
                <td className="px-6 py-4">
                  <div className="flex items-center justify-end gap-1">
                    {onToggle && (
                      <button
                        onClick={() => onToggle(alert.id)}
                        className={clsx(
                          'rounded-lg p-2 transition-all duration-300',
                          alert.active 
                            ? 'text-white/50 hover:bg-yellow-500/10 hover:text-yellow-400' 
                            : 'text-white/50 hover:bg-green-500/10 hover:text-green-400'
                        )}
                        title={alert.active ? 'Disable' : 'Enable'}
                      >
                        {alert.active ? (
                          <BellOff className="h-4 w-4" />
                        ) : (
                          <Bell className="h-4 w-4" />
                        )}
                      </button>
                    )}
                    {onDelete && (
                      <button
                        onClick={() => onDelete(alert.id)}
                        className="rounded-lg p-2 text-white/50 hover:bg-red-500/10 hover:text-red-400 transition-all duration-300"
                        title="Delete"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
