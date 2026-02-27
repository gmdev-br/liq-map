import { useState } from 'react';
import { format } from 'date-fns';
import { Trash2, Edit, Bell, BellOff, CheckCircle2, XCircle } from 'lucide-react';
import { clsx } from 'clsx';
import type { Alert } from '@/types';

interface AlertsTableProps {
  alerts: Alert[];
  isLoading: boolean;
  onToggle?: (id: string) => void;
  onDelete?: (id: string) => void;
}

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
      <div className="space-y-3">
        {[...Array(5)].map((_, i) => (
          <div key={i} className="h-16 animate-pulse rounded-lg bg-muted" />
        ))}
      </div>
    );
  }

  if (alerts.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-center">
        <BellOff className="h-12 w-12 text-muted-foreground" />
        <p className="mt-4 text-muted-foreground">No alerts yet</p>
        <p className="text-sm text-muted-foreground">
          Create an alert to get notified when prices reach your target
        </p>
      </div>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full">
        <thead>
          <tr className="border-b border-border">
            <th
              className="px-4 py-3 text-left text-sm font-medium text-muted-foreground cursor-pointer"
              onClick={() => handleSort('symbol')}
            >
              Symbol
            </th>
            <th className="px-4 py-3 text-left text-sm font-medium text-muted-foreground">
              Condition
            </th>
            <th
              className="px-4 py-3 text-left text-sm font-medium text-muted-foreground cursor-pointer"
              onClick={() => handleSort('price')}
            >
              Price
            </th>
            <th
              className="px-4 py-3 text-left text-sm font-medium text-muted-foreground cursor-pointer"
              onClick={() => handleSort('active')}
            >
              Status
            </th>
            <th
              className="px-4 py-3 text-left text-sm font-medium text-muted-foreground cursor-pointer"
              onClick={() => handleSort('created_at')}
            >
              Created
            </th>
            <th className="px-4 py-3 text-right text-sm font-medium text-muted-foreground">
              Actions
            </th>
          </tr>
        </thead>
        <tbody>
          {sortedAlerts.map((alert) => (
            <tr
              key={alert.id}
              className="border-b border-border transition-colors hover:bg-muted/50"
            >
              <td className="px-4 py-3">
                <span className="font-medium">{alert.symbol}</span>
              </td>
              <td className="px-4 py-3">
                <span className="rounded-full bg-primary/10 px-2 py-1 text-xs font-medium text-primary">
                  {alert.condition.toUpperCase()}
                </span>
              </td>
              <td className="px-4 py-3">
                ${alert.price.toLocaleString()}
              </td>
              <td className="px-4 py-3">
                <div className="flex items-center gap-2">
                  {alert.active ? (
                    <CheckCircle2 className="h-4 w-4 text-green-500" />
                  ) : (
                    <XCircle className="h-4 w-4 text-muted-foreground" />
                  )}
                  <span
                    className={clsx(
                      'text-sm',
                      alert.active ? 'text-green-500' : 'text-muted-foreground'
                    )}
                  >
                    {alert.active ? 'Active' : 'Inactive'}
                  </span>
                  {alert.triggered && (
                    <span className="rounded-full bg-red-500/10 px-2 py-0.5 text-xs text-red-500">
                      Triggered
                    </span>
                  )}
                </div>
              </td>
              <td className="px-4 py-3 text-sm text-muted-foreground">
                {format(new Date(alert.created_at), 'MMM dd, yyyy HH:mm')}
              </td>
              <td className="px-4 py-3">
                <div className="flex items-center justify-end gap-2">
                  {onToggle && (
                    <button
                      onClick={() => onToggle(alert.id)}
                      className="rounded-md p-2 text-muted-foreground hover:bg-accent hover:text-accent-foreground"
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
                      className="rounded-md p-2 text-muted-foreground hover:bg-red-500/10 hover:text-red-500"
                      title="Delete"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  )}
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
