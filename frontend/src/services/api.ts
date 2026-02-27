import axios from 'axios';
import type {
  Liquidation,
  Price,
  Exchange,
  Symbol,
  Alert,
  LiquidationStats,
  TechnicalIndicators,
  PaginatedResponse,
} from '@/types';

const api = axios.create({
  baseURL: '/api/v1',
  headers: {
    'Content-Type': 'application/json',
  },
});

// Request interceptor for auth
api.interceptors.request.use((config) => {
  const apiKey = localStorage.getItem('coinglass_api_key');
  if (apiKey) {
    config.headers['X-API-Key'] = apiKey;
  }
  return config;
});

// Liquidations
export const liquidationsApi = {
  getAll: (params?: {
    page?: number;
    page_size?: number;
    exchange?: string;
    symbol?: string;
    start_date?: string;
    end_date?: string;
    amount_min?: number;
    amount_max?: number;
  }) => api.get<PaginatedResponse<Liquidation>>('/liquidations', { params }),
  
  getOne: (id: string) => api.get<Liquidation>(`/liquidations/${id}`),
  
  getStats: (params?: {
    start_date?: string;
    end_date?: string;
    exchange?: string;
    symbol?: string;
    days?: number;
  }) => api.get<LiquidationStats>('/analytics/liquidations', { params }),
};

// Prices
export const pricesApi = {
  getAll: (params?: {
    page?: number;
    page_size?: number;
    symbol?: string;
    exchange?: string;
    start_date?: string;
    end_date?: string;
  }) => api.get<PaginatedResponse<Price>>('/prices', { params }),
  
  getIndicators: (params: {
    symbol: string;
    exchange?: string;
    interval?: string;
  }) => api.get<TechnicalIndicators>('/analytics/prices', { params }),
};

// Exchanges
export const exchangesApi = {
  getAll: () => api.get<Exchange[]>('/exchanges'),
  getOne: (id: string) => api.get<Exchange>(`/exchanges/${id}`),
};

// Symbols
export const symbolsApi = {
  getAll: (params?: { exchange?: string }) => api.get<Symbol[]>('/symbols', { params }),
  getByExchange: (exchange: string) => api.get<Symbol[]>(`/symbols`, { params: { exchange } }),
};

// Alerts
export const alertsApi = {
  getAll: () => api.get<Alert[]>('/alerts'),
  create: (data: {
    symbol: string;
    condition: 'above' | 'below' | 'crosses';
    price: number;
  }) => api.post<Alert>('/alerts', data),
  update: (id: string, data: Partial<Alert>) => api.put<Alert>(`/alerts/${id}`, data),
  delete: (id: string) => api.delete(`/alerts/${id}`),
  toggle: (id: string) => api.patch<Alert>(`/alerts/${id}/toggle`),
};

export default api;
