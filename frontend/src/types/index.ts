// Types for Coinglass API

export interface Liquidation {
  id: string;
  symbol: string;
  side: 'long' | 'short';
  price: number;
  quantity: number;
  amount: number;
  exchange: string;
  timestamp: string;
  long_volume?: number;
  short_volume?: number;
}

export interface Price {
  id: string;
  symbol: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  timestamp: string;
}

export interface Exchange {
  id: string;
  name: string;
  logo_url?: string;
  status: 'active' | 'inactive' | 'error';
  api_status: 'online' | 'offline' | 'degraded';
  docs_url?: string;
  websocket_url?: string;
}

export interface Alert {
  id: string;
  symbol: string;
  condition: 'above' | 'below' | 'crosses';
  price: number;
  active: boolean;
  triggered: boolean;
  triggered_at?: string;
  created_at: string;
}

export interface LiquidationStats {
  total_liquidations?: number;
  total_count?: number;
  total_volume: number;
  largest_liquidation?: number;
  max_volume?: number;
  avg_liquidation?: number;
  avg_volume?: number;
  by_exchange: Record<string, number>;
  by_symbol: Record<string, number>;
  by_side: { long: number; short: number };
}

export interface WebSocketMessage {
  type: 'liquidation' | 'price' | 'alert';
  data: unknown;
  timestamp: string;
}

// API Response types
export interface PaginatedResponse<T> {
  data: T[];
  total: number;
  page: number;
  page_size: number;
  has_next: boolean;
  has_prev: boolean;
}

export interface ApiError {
  detail: string;
  code?: string;
}

export interface ExchangesResponse {
  exchanges: Exchange[];
}

export interface AlertsResponse {
  alerts: Alert[];
  count: number;
}