import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Building2, ExternalLink, CheckCircle2, XCircle, AlertCircle, RefreshCw, Server, Link2, Activity } from 'lucide-react';
import { exchangesApi } from '@/services/api';
import { Card, CardContent, Badge } from '@/components/ui/Card';
import { clsx } from 'clsx';
import type { Exchange } from '@/types';

export function Exchanges() {
  const { data: exchanges, isLoading, refetch } = useQuery({
    queryKey: ['exchanges'],
    queryFn: async () => {
      const response = await exchangesApi.getAll();
      return response.data.exchanges;
    },
  });

  // Mock exchanges data for display
  const mockExchanges: Exchange[] = [
    {
      id: 'binance',
      name: 'Binance',
      logo_url: 'https://cryptologos.cc/logos/binance-coin-bnb-logo.png',
      status: 'active',
      api_status: 'online',
      docs_url: 'https://developers.binance.com',
      websocket_url: 'wss://stream.binance.com:9443/ws',
    },
    {
      id: 'bybit',
      name: 'Bybit',
      logo_url: 'https://cryptologos.cc/logos/bybit-bit-logo.png',
      status: 'active',
      api_status: 'online',
      docs_url: 'https://bybit-exchange.github.io/docs/spot/v3',
      websocket_url: 'wss://stream.bybit.com/v5/public/spot',
    },
    {
      id: 'okx',
      name: 'OKX',
      logo_url: 'https://cryptologos.cc/logos/okb-okb-logo.png',
      status: 'active',
      api_status: 'online',
      docs_url: 'https://www.okx.com/docs-v5',
      websocket_url: 'wss://ws.okx.com:8443/ws/v5/public',
    },
    {
      id: 'ftx',
      name: 'FTX',
      logo_url: 'https://cryptologos.cc/logos/ftx-token-ftt-logo.png',
      status: 'inactive',
      api_status: 'offline',
      docs_url: 'https://docs.ftx.com',
      websocket_url: 'wss://ftx.com/ws',
    },
    {
      id: 'kucoin',
      name: 'KuCoin',
      logo_url: 'https://cryptologos.cc/logos/kucoin-token-kcs-logo.png',
      status: 'active',
      api_status: 'degraded',
      docs_url: 'https://docs.kucoin.com',
      websocket_url: 'wss://ws-api.kucoin.com',
    },
    {
      id: 'huobi',
      name: 'Huobi',
      logo_url: 'https://cryptologos.cc/logos/huobi-token-ht-logo.png',
      status: 'active',
      api_status: 'online',
      docs_url: 'https://huobiapi.github.io/docs/spot/v1',
      websocket_url: 'wss://api.huobi.pro/ws',
    },
  ];

  const displayExchanges = exchanges || mockExchanges;

  const getStatusIcon = (status: Exchange['api_status']) => {
    switch (status) {
      case 'online':
        return (
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-green-500/20 border border-green-500/30">
            <CheckCircle2 className="h-5 w-5 text-green-400" />
          </div>
        );
      case 'degraded':
        return (
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-yellow-500/20 border border-yellow-500/30">
            <AlertCircle className="h-5 w-5 text-yellow-400" />
          </div>
        );
      case 'offline':
        return (
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-red-500/20 border border-red-500/30">
            <XCircle className="h-5 w-5 text-red-400" />
          </div>
        );
    }
  };

  const getStatusBadge = (status: Exchange['api_status']) => {
    const styles = {
      online: 'glass-badge-green',
      degraded: 'bg-yellow-500/10 text-yellow-400 border-yellow-500/20',
      offline: 'glass-badge-red',
    };
    return styles[status];
  };

  // OPTIMIZED: Single pass O(n) instead of O(3n) with 3 filters
  const counts = useMemo(() =>
    displayExchanges.reduce((acc, e) => {
      acc[e.api_status] = (acc[e.api_status] || 0) + 1;
      return acc;
    }, { online: 0, degraded: 0, offline: 0 }),
    [displayExchanges]
  );

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-3xl font-bold text-gradient">Exchanges</h2>
          <p className="text-white/50 mt-1">Supported cryptocurrency exchanges</p>
        </div>
        <button
          onClick={() => refetch()}
          className="glass-button inline-flex h-11 items-center gap-2 px-5 text-sm font-medium text-white"
        >
          <RefreshCw className="h-4 w-4" />
          Refresh
        </button>
      </div>

      {/* Stats */}
      <div className="grid gap-4 md:grid-cols-3">
        <div className="glass-card p-5 border-l-4 border-l-green-500/50">
          <div className="flex items-center gap-4">
            <div className="flex h-12 w-12 items-center justify-center rounded-liquid-sm bg-gradient-to-br from-green-500/20 to-emerald-500/20 border border-green-500/20">
              <Server className="h-6 w-6 text-green-400" />
            </div>
            <div>
              <p className="text-sm text-white/50">Online</p>
              <p className="text-2xl font-bold text-white">{counts.online}</p>
            </div>
          </div>
        </div>

        <div className="glass-card p-5 border-l-4 border-l-yellow-500/50">
          <div className="flex items-center gap-4">
            <div className="flex h-12 w-12 items-center justify-center rounded-liquid-sm bg-gradient-to-br from-yellow-500/20 to-orange-500/20 border border-yellow-500/20">
              <Activity className="h-6 w-6 text-yellow-400" />
            </div>
            <div>
              <p className="text-sm text-white/50">Degraded</p>
              <p className="text-2xl font-bold text-white">{counts.degraded}</p>
            </div>
          </div>
        </div>

        <div className="glass-card p-5 border-l-4 border-l-red-500/50">
          <div className="flex items-center gap-4">
            <div className="flex h-12 w-12 items-center justify-center rounded-liquid-sm bg-gradient-to-br from-red-500/20 to-orange-500/20 border border-red-500/20">
              <Server className="h-6 w-6 text-red-400" />
            </div>
            <div>
              <p className="text-sm text-white/50">Offline</p>
              <p className="text-2xl font-bold text-white">{counts.offline}</p>
            </div>
          </div>
        </div>
      </div>

      {/* Exchanges Grid */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {isLoading ? (
          [...Array(6)].map((_, i) => (
            <div key={i} className="glass-card h-40 animate-pulse bg-white/5" />
          ))
        ) : (
          displayExchanges.map((exchange) => (
            <div 
              key={exchange.id} 
              className="glass-card p-5 transition-all duration-300 hover:scale-[1.02] group"
            >
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-4">
                  <div className="flex h-12 w-12 items-center justify-center rounded-liquid-sm bg-gradient-to-br from-white/10 to-white/5 border border-white/10 group-hover:border-white/20 transition-all">
                    <Building2 className="h-6 w-6 text-white/60 group-hover:text-white/80 transition-colors" />
                  </div>
                  <div>
                    <h3 className="font-semibold text-white">{exchange.name}</h3>
                    <p className={clsx(
                      'text-sm capitalize',
                      exchange.status === 'active' ? 'text-green-400' : 'text-white/40'
                    )}>
                      {exchange.status}
                    </p>
                  </div>
                </div>
                {getStatusIcon(exchange.api_status)}
              </div>

              <div className="mt-4 flex items-center gap-2">
                <span className={clsx('rounded-full px-2.5 py-0.5 text-xs font-medium border backdrop-blur-sm', getStatusBadge(exchange.api_status))}>
                  {exchange.api_status.toUpperCase()}
                </span>
              </div>

              <div className="mt-4 flex flex-col gap-2 text-sm">
                {exchange.docs_url && (
                  <a
                    href={exchange.docs_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 text-white/50 hover:text-blue-400 transition-colors"
                  >
                    <Link2 className="h-3.5 w-3.5" />
                    Documentation
                    <ExternalLink className="h-3 w-3" />
                  </a>
                )}
                {exchange.websocket_url && (
                  <p className="text-xs text-white/30 truncate">
                    WS: {exchange.websocket_url}
                  </p>
                )}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
