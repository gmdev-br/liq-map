import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Plus, Trash2, Bell, BellOff, AlertTriangle } from 'lucide-react';
import { alertsApi } from '@/services/api';
import { AlertsTable } from '@/components/AlertsTable';
import { Card, CardContent, CardHeader } from '@/components/ui/Card';

export function Alerts() {
  const queryClient = useQueryClient();
  const [formData, setFormData] = useState({
    symbol: 'BTC/USDT',
    condition: 'above' as 'above' | 'below' | 'crosses',
    price: '',
  });

  const { data: alerts, isLoading } = useQuery({
    queryKey: ['alerts'],
    queryFn: () => alertsApi.getAll().then((res) => res.data),
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

  // Mock alerts for display
  const mockAlerts = alerts || [
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

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-2xl font-bold">Alerts</h2>
          <p className="text-muted-foreground">Manage price alerts and notifications</p>
        </div>
      </div>

      {/* Create Alert Form */}
      <Card>
        <CardHeader title="Create Alert" description="Set up a new price alert" />
        <CardContent>
          <form onSubmit={handleSubmit} className="flex flex-wrap gap-4">
            <div className="flex flex-col gap-1">
              <label className="text-sm font-medium">Symbol</label>
              <select
                value={formData.symbol}
                onChange={(e) => setFormData({ ...formData, symbol: e.target.value })}
                className="h-10 min-w-[140px] rounded-md border border-input bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-ring"
              >
                <option value="BTC/USDT">BTC/USDT</option>
                <option value="ETH/USDT">ETH/USDT</option>
                <option value="SOL/USDT">SOL/USDT</option>
                <option value="BNB/USDT">BNB/USDT</option>
                <option value="XRP/USDT">XRP/USDT</option>
                <option value="ADA/USDT">ADA/USDT</option>
                <option value="DOGE/USDT">DOGE/USDT</option>
              </select>
            </div>

            <div className="flex flex-col gap-1">
              <label className="text-sm font-medium">Condition</label>
              <select
                value={formData.condition}
                onChange={(e) => setFormData({ ...formData, condition: e.target.value as 'above' | 'below' | 'crosses' })}
                className="h-10 min-w-[140px] rounded-md border border-input bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-ring"
              >
                <option value="above">Price Above</option>
                <option value="below">Price Below</option>
                <option value="crosses">Price Crosses</option>
              </select>
            </div>

            <div className="flex flex-col gap-1">
              <label className="text-sm font-medium">Price</label>
              <input
                type="number"
                step="any"
                placeholder="0.00"
                value={formData.price}
                onChange={(e) => setFormData({ ...formData, price: e.target.value })}
                className="h-10 min-w-[140px] rounded-md border border-input bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-ring"
              />
            </div>

            <div className="flex items-end">
              <button
                type="submit"
                disabled={createMutation.isPending || !formData.price}
                className="inline-flex h-10 items-center gap-2 rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
              >
                {createMutation.isPending ? (
                  <span className="h-4 w-4 animate-spin rounded-full border-2 border-primary-foreground border-t-transparent" />
                ) : (
                  <Plus className="h-4 w-4" />
                )}
                Create Alert
              </button>
            </div>
          </form>
        </CardContent>
      </Card>

      {/* Alerts List */}
      <Card>
        <CardHeader
          title="Active Alerts"
          description="Manage your price alerts"
          action={
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Bell className="h-4 w-4" />
              <span>{mockAlerts.filter((a) => a.active).length} active</span>
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
      <Card className="bg-yellow-500/5 border-yellow-500/20">
        <CardContent className="flex items-start gap-4 p-6">
          <AlertTriangle className="h-6 w-6 text-yellow-500 flex-shrink-0" />
          <div>
            <h3 className="font-semibold text-yellow-500">Browser Notifications</h3>
            <p className="mt-1 text-sm text-muted-foreground">
              Enable browser notifications to receive alerts even when the dashboard is not in focus.
              Click the bell icon in the header to enable notifications.
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
