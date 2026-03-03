import { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Plus, Trash2, Bell, BellOff, AlertTriangle } from 'lucide-react';
import { alertsApi } from '@/services/api';
import { AlertsTable } from '@/components/AlertsTable';
import { Card, CardContent, CardHeader, Badge } from '@/components/ui/Card';
import { clsx } from 'clsx';

export function Alerts() {
  const queryClient = useQueryClient();
  const [formData, setFormData] = useState({
    symbol: 'BTC/USDT',
    condition: 'above' as 'above' | 'below' | 'crosses',
    price: '',
  });

  const { data: alerts, isLoading } = useQuery({
    queryKey: ['alerts'],
    queryFn: async () => {
      const response = await alertsApi.getAll();
      return response.data.alerts;
    },
  });

  const createMutation = useMutation({
    mutationFn: (data: { symbol: string; condition: 'above' | 'below' | 'crosses'; price: number }) =>
      alertsApi.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['alerts'] });
      toast.success('Alert created successfully');
      setFormData({ ...formData, price: '' });
    },
    onError: () => {
      toast.error('Failed to create alert');
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => alertsApi.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['alerts'] });
      toast.success('Alert deleted successfully');
    },
    onError: () => {
      toast.error('Failed to delete alert');
    },
  });

  const toggleMutation = useMutation({
    mutationFn: (id: string) => alertsApi.toggle(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['alerts'] });
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.price) return;
    createMutation.mutate({
      symbol: formData.symbol,
      condition: formData.condition,
      price: parseFloat(formData.price),
    });
  };

  // Memoized mock alerts - only processed when real data is empty
  const mockAlerts = useMemo(() => {
    if (alerts && alerts.length > 0) return alerts;
    return [
      {
        id: '1',
        symbol: 'BTC/USDT',
        condition: 'above' as const,
        price: 50000,
        active: true,
        triggered: false,
        created_at: new Date().toISOString(),
      },
      {
        id: '2',
        symbol: 'ETH/USDT',
        condition: 'below' as const,
        price: 2500,
        active: true,
        triggered: true,
        triggered_at: new Date().toISOString(),
        created_at: new Date(Date.now() - 86400000).toISOString(),
      },
      {
        id: '3',
        symbol: 'SOL/USDT',
        condition: 'crosses' as const,
        price: 150,
        active: false,
        triggered: false,
        created_at: new Date(Date.now() - 172800000).toISOString(),
      },
    ];
  }, [alerts]);

  const activeCount = mockAlerts.filter((a) => a.active).length;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-3xl font-bold text-gradient">Alerts</h2>
          <p className="text-white/50 mt-1">Manage price alerts and notifications</p>
        </div>
        <div className="flex items-center gap-3">
          <div className="glass-card px-4 py-2 flex items-center gap-2">
            <Bell className="h-4 w-4 text-blue-400" />
            <span className="text-sm text-white/70">
              <span className="font-semibold text-white">{activeCount}</span> active alerts
            </span>
          </div>
        </div>
      </div>

      {/* Create Alert Form */}
      <Card>
        <CardHeader title="Create Alert" description="Set up a new price alert" />
        <CardContent>
          <form onSubmit={handleSubmit} className="flex flex-wrap items-end gap-4">
            <div className="flex flex-col gap-2">
              <label className="text-sm font-medium text-white/70">Symbol</label>
              <select
                value={formData.symbol}
                onChange={(e) => setFormData({ ...formData, symbol: e.target.value })}
                className="h-11 min-w-[140px] glass-input px-3 text-sm text-white outline-none cursor-pointer"
              >
                <option value="BTC/USDT" className="bg-gray-900">BTC/USDT</option>
                <option value="ETH/USDT" className="bg-gray-900">ETH/USDT</option>
                <option value="SOL/USDT" className="bg-gray-900">SOL/USDT</option>
                <option value="BNB/USDT" className="bg-gray-900">BNB/USDT</option>
                <option value="XRP/USDT" className="bg-gray-900">XRP/USDT</option>
                <option value="ADA/USDT" className="bg-gray-900">ADA/USDT</option>
                <option value="DOGE/USDT" className="bg-gray-900">DOGE/USDT</option>
              </select>
            </div>

            <div className="flex flex-col gap-2">
              <label className="text-sm font-medium text-white/70">Condition</label>
              <select
                value={formData.condition}
                onChange={(e) => setFormData({ ...formData, condition: e.target.value as 'above' | 'below' | 'crosses' })}
                className="h-11 min-w-[140px] glass-input px-3 text-sm text-white outline-none cursor-pointer"
              >
                <option value="above" className="bg-gray-900">Price Above</option>
                <option value="below" className="bg-gray-900">Price Below</option>
                <option value="crosses" className="bg-gray-900">Price Crosses</option>
              </select>
            </div>

            <div className="flex flex-col gap-2">
              <label className="text-sm font-medium text-white/70">Price</label>
              <input
                type="number"
                step="any"
                placeholder="0.00"
                value={formData.price}
                onChange={(e) => setFormData({ ...formData, price: e.target.value })}
                className="h-11 min-w-[140px] glass-input px-3 text-sm text-white placeholder:text-white/40 outline-none"
              />
            </div>

            <button
              type="submit"
              disabled={createMutation.isPending || !formData.price}
              className={clsx(
                'glass-button inline-flex h-11 items-center gap-2 px-5 text-sm font-medium text-white',
                (createMutation.isPending || !formData.price) && 'opacity-50 cursor-not-allowed'
              )}
            >
              {createMutation.isPending ? (
                <span className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
              ) : (
                <Plus className="h-4 w-4" />
              )}
              Create Alert
            </button>
          </form>
        </CardContent>
      </Card>

      {/* Alerts List */}
      <Card>
        <CardHeader
          title="Active Alerts"
          description="Manage your price alerts"
          action={
            <div className="flex items-center gap-2">
              <Badge variant="info" className="flex items-center gap-1.5">
                <Bell className="h-3 w-3" />
                {activeCount} active
              </Badge>
            </div>
          }
        />
        <CardContent className="p-0">
          <AlertsTable
            alerts={mockAlerts}
            isLoading={isLoading}
            onToggle={(id) => toggleMutation.mutate(id)}
            onDelete={(id) => {
              if (confirm('Are you sure you want to delete this alert?')) {
                deleteMutation.mutate(id);
              }
            }}
          />
        </CardContent>
      </Card>

      {/* Info Card */}
      <div className="glass-card p-6 border-yellow-500/20">
        <div className="flex items-start gap-4">
          <div className="flex h-12 w-12 items-center justify-center rounded-liquid-sm bg-gradient-to-br from-yellow-500/20 to-orange-500/20 border border-yellow-500/20">
            <AlertTriangle className="h-6 w-6 text-yellow-400" />
          </div>
          <div>
            <h3 className="font-semibold text-yellow-400">Browser Notifications</h3>
            <p className="mt-1 text-sm text-white/50">
              Enable browser notifications to receive alerts even when the dashboard is not in focus.
              Click the bell icon in the header to enable notifications.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
