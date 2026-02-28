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
  ExchangesResponse,
  AlertsResponse,
} from '@/types';

const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL || '/api/v1',
  headers: {
    'Content-Type': 'application/json',
  },
});

// Request interceptor for auth
api.interceptors.request.use((config) => {
  try {
    const storage = localStorage.getItem('coinglass-storage');
    let apiKey = 'coinglass-dev-key-2024'; // Default development key

    if (storage) {
      const parsed = JSON.parse(storage);
      const userApiKey = parsed.state?.settings?.apiKey;
      if (userApiKey && userApiKey.trim() !== '') {
        apiKey = userApiKey;
      }
    }

    config.headers['X-API-Key'] = apiKey;
    // console.log('DEBUG API: Sending header X-API-Key:', apiKey);
  } catch (error) {
    console.error('Error reading API key from storage:', error);
    config.headers['X-API-Key'] = 'coinglass-dev-key-2024';
  }
  return config;
});

// Response interceptor for debugging errors
api.interceptors.response.use(
  (response) => response,
  (error) => {
    console.error('[API Error]', {
      status: error.response?.status,
      data: error.response?.data,
      url: error.config?.url,
      method: error.config?.method,
      headers: error.config?.headers
    });
    return Promise.reject(error);
  }
);

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
  }) => {
    // Map frontend params to backend params
    const backendParams: any = { ...params };

    if (params?.symbol) {
      backendParams.symbols = params.symbol;
      delete backendParams.symbol;
    }

    if (params?.start_date) {
      backendParams.from_time = Math.floor(new Date(params.start_date).getTime() / 1000);
      delete backendParams.start_date;
    }

    if (params?.end_date) {
      backendParams.to_time = Math.floor(new Date(params.end_date).getTime() / 1000);
      delete backendParams.end_date;
    }

    return api.get<PaginatedResponse<Liquidation>>('/liquidations', { params: backendParams });
  },

  getOne: (id: string) => api.get<Liquidation>(`/liquidations/${id}`),

  getStats: (params?: {
    start_date?: string;
    end_date?: string;
    exchange?: string;
    symbol?: string;
    days?: number;
  }) => {
    const backendParams: any = { ...params };
    if (params?.start_date) {
      backendParams.from_time = Math.floor(new Date(params.start_date).getTime() / 1000);
      delete backendParams.start_date;
    }
    if (params?.end_date) {
      backendParams.to_time = Math.floor(new Date(params.end_date).getTime() / 1000);
      delete backendParams.end_date;
    }
    return api.get<LiquidationStats>('/analytics/liquidations', { params: backendParams });
  },
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
  }) => {
    const backendParams: any = { ...params };
    if (params?.symbol) {
      backendParams.symbols = params.symbol;
      delete backendParams.symbol;
    }
    if (params?.start_date) {
      backendParams.from_time = Math.floor(new Date(params.start_date).getTime() / 1000);
      delete backendParams.start_date;
    }
    if (params?.end_date) {
      backendParams.to_time = Math.floor(new Date(params.end_date).getTime() / 1000);
      delete backendParams.end_date;
    }
    return api.get<PaginatedResponse<Price>>('/prices', { params: backendParams });
  },

  getIndicators: (params: {
    symbol: string;
    exchange?: string;
    interval?: string;
  }) => api.get<TechnicalIndicators>('/analytics/prices', { params }),
};

// Exchanges
export const exchangesApi = {
  getAll: () => api.get<ExchangesResponse>('/exchanges'),
  getOne: (id: string) => api.get<Exchange>(`/exchanges/${id}`),
};

// Symbols
export const symbolsApi = {
  getAll: (params?: { exchange?: string }) => api.get<Symbol[]>('/symbols', { params }),
  getByExchange: (exchange: string) => api.get<Symbol[]>(`/symbols`, { params: { exchange } }),
};

// Alerts
export const alertsApi = {
  getAll: () => api.get<AlertsResponse>('/alerts'),
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
