import { useQuery } from '@tanstack/react-query';
import { Building2, ExternalLink, CheckCircle2, XCircle, AlertCircle, RefreshCw, Search } from 'lucide-react';
import { exchangesApi } from '@/services/api';
import { Card, CardContent, CardHeader } from '@/components/ui/Card';
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
        return <CheckCircle2 className="h-5 w-5 text-green-500" />;
      case 'degraded':
        return <AlertCircle className="h-5 w-5 text-yellow-500" />;
      case 'offline':
        return <XCircle className="h-5 w-5 text-red-500" />;
    }
  };

  const getStatusBadge = (status: Exchange['api_status']) => {
    const styles = {
      online: 'bg-green-500/10 text-green-500',
      degraded: 'bg-yellow-500/10 text-yellow-500',
      offline: 'bg-red-500/10 text-red-500',
    };
    return styles[status];
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-2xl font-bold">Exchanges</h2>
          <p className="text-muted-foreground">Supported cryptocurrency exchanges</p>
        </div>
        <button
          onClick={() => refetch()}
          className="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
        >
          <RefreshCw className="h-4 w-4" />
          Refresh
        </button>
      </div>

      {/* Stats */}
      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardContent className="p-6">
            <div className="flex items-center gap-4">
              <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-green-500/10">
                <CheckCircle2 className="h-6 w-6 text-green-500" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Online</p>
                <p className="text-2xl font-bold">
                  {displayExchanges.filter((e) => e.api_status === 'online').length}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-6">
            <div className="flex items-center gap-4">
              <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-yellow-500/10">
                <AlertCircle className="h-6 w-6 text-yellow-500" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Degraded</p>
                <p className="text-2xl font-bold">
                  {displayExchanges.filter((e) => e.api_status === 'degraded').length}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-6">
            <div className="flex items-center gap-4">
              <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-red-500/10">
                <XCircle className="h-6 w-6 text-red-500" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Offline</p>
                <p className="text-2xl font-bold">
                  {displayExchanges.filter((e) => e.api_status === 'offline').length}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Exchanges Grid */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {isLoading ? (
          [...Array(6)].map((_, i) => (
            <Card key={i} className="animate-pulse">
              <CardContent className="p-6">
                <div className="flex items-center gap-4">
                  <div className="h-12 w-12 rounded-lg bg-muted" />
                  <div className="space-y-2">
                    <div className="h-4 w-24 rounded bg-muted" />
                    <div className="h-3 w-16 rounded bg-muted" />
                  </div>
                </div>
              </CardContent>
            </Card>
          ))
        ) : (
          displayExchanges.map((exchange) => (
            <Card key={exchange.id} className="transition-all hover:shadow-md">
              <CardContent className="p-6">
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-4">
                    <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-muted">
                      <Building2 className="h-6 w-6 text-muted-foreground" />
                    </div>
                    <div>
                      <h3 className="font-semibold">{exchange.name}</h3>
                      <p className="text-sm text-muted-foreground capitalize">{exchange.status}</p>
                    </div>
                  </div>
                  {getStatusIcon(exchange.api_status)}
                </div>

                <div className="mt-4 flex items-center gap-2">
                  <span className={clsx('rounded-full px-2.5 py-0.5 text-xs font-medium', getStatusBadge(exchange.api_status))}>
                    {exchange.api_status.toUpperCase()}
                  </span>
                </div>

                <div className="mt-4 flex flex-col gap-2 text-sm">
                  {exchange.docs_url && (
                    <a
                      href={exchange.docs_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 text-muted-foreground hover:text-primary"
                    >
                      Documentation
                      <ExternalLink className="h-3 w-3" />
                    </a>
                  )}
                  {exchange.websocket_url && (
                    <p className="text-xs text-muted-foreground truncate">
                      WS: {exchange.websocket_url}
                    </p>
                  )}
                </div>
              </CardContent>
            </Card>
          ))
        )}
      </div>
    </div>
  );
}
