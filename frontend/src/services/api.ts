import axios from 'axios';
import type {
  Liquidation,
  Price,
  PaginatedResponse,
  ExchangesResponse,
  Exchange,
  AlertsResponse,
  Alert,
  LiquidationStats
} from '@/types';

// Detect if running in production (Vercel)
// Check multiple conditions: no localhost, not 127.0.0.1, and verify it's not the dev server
// Also check for VERCEL_ENV or VITE_API_MODE environment variables
const isProduction = (() => {
  // Allow forcing production mode via environment variable or localStorage for testing
  if (typeof window !== 'undefined') {
    const forcedMode = localStorage.getItem('force_api_mode');
    if (forcedMode === 'production') return true;
    if (forcedMode === 'development') return false;
  }
  
  if (typeof window === 'undefined') return false;
  
  const hostname = window.location.hostname;
  const isLocalhost = hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '0.0.0.0';
  const isDevPort = window.location.port === '5173' || window.location.port === '3000' || window.location.port === '5174';
  
  // Also check for Vercel production indicators
  const isVercel = hostname.includes('.vercel.app') || hostname.includes('.vercel.sh');
  const isProductionDomain = !isLocalhost && !isDevPort;
  
  return isProductionDomain || isVercel;
})();

// Log the detected environment
if (typeof window !== 'undefined') {
  console.log('[API] Environment detection:', {
    isProduction,
    hostname: window.location.hostname,
    port: window.location.port
  });
}

// Get the base URL for API calls
const getBaseUrl = () => {
  if (isProduction) {
    // In production, use the Vercel API route
    return ''; // Same origin on Vercel
  }
  // In development, use local proxy or direct
  return '';
};

// Helper function to fetch price from Binance using klines endpoint (CORS enabled)
const fetchBinancePrice = async (symbol: string): Promise<number> => {
  try {
    // Convert Coinalyze symbol format (BTCUSDT_PERP.A) to Binance format (BTCUSDT)
    // Remove _PERP.A or PERP.A suffix
    const binanceSymbol = symbol.replace('_PERP.A', '').replace('PERP.A', '');
    console.log('[DEBUG] Single fetch - Symbol conversion:', { original: symbol, converted: binanceSymbol });
    
    // Use klines endpoint which has CORS enabled
    // Get the last closed candle (limit=1), the close price is at index [4]
    const response = await axios.get(
      `https://api.binance.com/api/v3/klines?symbol=${binanceSymbol}&interval=1d&limit=1`,
      { timeout: 5000 }
    );
    console.log('[DEBUG] Single fetch - Binance klines response:', response.data);
    
    // klines returns array of candles, get the close price (index 4) from the last candle
    const closePrice = response.data[0]?.[4];
    return closePrice ? parseFloat(closePrice) : 0;
  } catch (error: any) {
    console.error(`[DEBUG] Failed to fetch price for ${symbol}:`, error.response?.data || error.message);
    return 0;
  }
};

// Helper to get multiple Binance prices at once using klines endpoint (CORS enabled)
const fetchMultipleBinancePrices = async (symbols: string[]): Promise<Record<string, number>> => {
  const prices: Record<string, number> = {};
  
  // Get unique symbols and convert to Binance format
  const uniqueSymbols = [...new Set(symbols.map(s => {
    const converted = s.replace('_PERP.A', '').replace('PERP.A', '');
    console.log('[DEBUG] Symbol conversion:', { original: s, converted });
    return converted;
  }))];
  
  console.log('[DEBUG] Fetching Binance prices for symbols:', uniqueSymbols);
  
  // Fetch prices in parallel using klines endpoint (CORS enabled)
  const promises = uniqueSymbols.map(async (symbol) => {
    try {
      console.log('[DEBUG] Calling Binance klines API for:', symbol);
      // Use klines endpoint which has CORS enabled
      // Get the last closed candle (limit=1), the close price is at index [4]
      const response = await axios.get(
        `https://api.binance.com/api/v3/klines?symbol=${symbol}&interval=1d&limit=1`,
        { timeout: 5000 }
      );
      console.log('[DEBUG] Binance klines response for', symbol, ':', response.data);
      
      // klines returns array of candles, get the close price (index 4) from the last candle
      const closePrice = response.data[0]?.[4];
      prices[symbol] = closePrice ? parseFloat(closePrice) : 0;
    } catch (error: any) {
      console.error(`[DEBUG] Failed to fetch price for ${symbol}:`, error.response?.data || error.message);
      prices[symbol] = 0;
    }
  });
  
  await Promise.all(promises);
  console.log('[DEBUG] Final prices:', prices);
  return prices;
};

const fetchWithProxy = async (targetUrl: string, useProxy: boolean = false) => {
  // In production, try direct API call first
  // Coinalyze may or may not allow requests from Vercel domain
  
  if (!useProxy || isProduction) {
    // Direct API call
    try {
      const response = await axios.get(targetUrl, {
        timeout: 30000,
        headers: { 'X-Requested-With': 'XMLHttpRequest' }
      });
      return response.data;
    } catch (error: any) {
      // If CORS error in production, log it
      if (isProduction && error.message?.includes('Network Error')) {
        console.error('[API] CORS error in production - Coinalyze may not allow requests from this domain');
      }
      throw error;
    }
  }

  // Use local proxy server for APIs without CORS support
  const proxyUrl = `http://localhost:3001${targetUrl.replace('https://api.coinalyze.net', '')}`;
  
  const response = await axios.get(proxyUrl, { 
    timeout: 30000
  });
  return response.data;
};

const getApiKey = () => {
  try {
    const storage = localStorage.getItem('coinglass-storage');
    if (storage) {
      const parsed = JSON.parse(storage);
      const userApiKey = parsed.state?.settings?.apiKey;
      if (userApiKey && userApiKey.trim() !== '') {
        return userApiKey;
      }
    }
  } catch (e) {
    console.error('Error reading API key', e);
  }
  return 'FREE'; // Default Coinalyze key
};

// Liquidations (Coinalyze)
export const liquidationsApi = {
  getAll: async (params?: {
    page?: number;
    page_size?: number;
    exchange?: string;
    symbol?: string;
    start_date?: string;
    end_date?: string;
    amount_min?: number;
    amount_max?: number;
  }): Promise<any> => {

    const symbols = params?.symbol || 'BTCUSDT_PERP.A';
    const interval = 'daily';

    // Default 30 days
    const toTime = params?.end_date ? Math.floor(new Date(params.end_date).getTime() / 1000) : Math.floor(Date.now() / 1000);
    const fromTime = params?.start_date ? Math.floor(new Date(params.start_date).getTime() / 1000) : toTime - (30 * 24 * 60 * 60);

    const apiKey = getApiKey();
    const query = `symbols=${symbols}&interval=${interval}&from=${fromTime}&to=${toTime}&api_key=${apiKey}`;

    // Use relative proxy path - Vite proxies to Coinalyze in dev, Vercel in production
    const targetUrl = `/api/coinalyze?${query}`;

    // Use relative proxy path for CORS handling
    const data = await fetchWithProxy(targetUrl, false);

    let liquidationList: any[] = [];
    if (Array.isArray(data)) {
      if (data.length > 0 && typeof data[0] === 'object' && "history" in data[0]) {
        liquidationList = data[0].history;
      } else {
        liquidationList = data;
      }
    } else if (typeof data === 'object') {
      liquidationList = data.history || data.data || [];
    }

    console.log('[DEBUG] Coinalyze API response structure:', { data, liquidationList, firstItem: liquidationList[0] });

    // Log all available fields in the first item to understand the structure
    if (liquidationList.length > 0) {
      console.log('[DEBUG] First item fields:', Object.keys(liquidationList[0]));
      console.log('[DEBUG] First item full data:', JSON.stringify(liquidationList[0], null, 2));
    }

    // Extract unique symbols from liquidation data - use params only (Coinalyze API doesn't return symbol in data)
    const symbolList = symbols.split(',');
    console.log('[DEBUG] Symbol list from params:', symbolList);
    
    // Fetch current prices from Binance for all symbols
    const binancePrices = await fetchMultipleBinancePrices(symbolList);
    
    console.log('[API] Fetched Binance prices for liquidations:', binancePrices);

    let transformedData: Liquidation[] = liquidationList.map(item => {
      // Use symbol from params only - Coinalyze API doesn't return symbol in liquidation data
      // The 's' field in Coinalyze is "short volume" (number), not symbol
      const liquidationSymbol = symbols.split(',')[0];

      const longLiq = item.l || item.long_volume || item.long || 0;
      const shortLiq = item.s || item.short || item.short_volume || item.sv || 0;
      const side = longLiq > shortLiq ? 'long' : 'short';

      console.log('[DEBUG] Liquidation item data:', { item, longLiq, shortLiq, side });

      const rawTime = item.t || item.time || item.timestamp || 0;
      // Convert to seconds if milliseconds, handle edge cases
      let timestamp: number;
      if (!rawTime || typeof rawTime !== 'number') {
        timestamp = Math.floor(Date.now() / 1000); // Use current time as fallback
      } else {
        timestamp = rawTime < 10000000000 ? rawTime : Math.floor(rawTime / 1000);
      }

      // Convert to Binance format (remove _PERP.A suffix) - must match fetchMultipleBinancePrices
      const binanceSymbolKey = liquidationSymbol.replace('_PERP.A', '').replace('PERP.A', '');

      console.log('[DEBUG] Price lookup:', { liquidationSymbol, binanceSymbolKey, binancePrices });

      // Get price from Binance - fallback to item.price if available
      const binancePrice = binancePrices[binanceSymbolKey] || 0;
      const liquidationPrice = item.price || binancePrice;

      // Debug log for timestamp transformation
      console.log('[API] Timestamp transformation:', { rawTime, timestamp, item });

      return {
        id: String(rawTime),
        timestamp: String(timestamp),
        amount: item.value_usd || (longLiq + shortLiq),
        exchange: item.exchange || 'unknown',
        side,
        price: liquidationPrice,
        symbol: liquidationSymbol,
        quantity: longLiq + shortLiq,
        long_volume: longLiq,
        short_volume: shortLiq
      };
    });

    if (params?.amount_min !== undefined) {
      transformedData = transformedData.filter(i => i.amount >= params.amount_min!);
    }
    if (params?.amount_max !== undefined) {
      transformedData = transformedData.filter(i => i.amount <= params.amount_max!);
    }

    return {
      data: {
        data: transformedData,
        total: transformedData.length,
        page: 1,
        page_size: transformedData.length,
        has_next: false,
        has_prev: false
      }
    };
  },

  getOne: async (id: string): Promise<any> => {
    throw new Error("getOne not implemented in serverless mode");
  },

  getStats: async (params?: any): Promise<any> => {
    // Create derived stats from getAll if needed, but for now returning dummy to prevent crash
    const res = await liquidationsApi.getAll(params);
    const data = res.data.data;

    let totalVolume = 0;
    let maxVolume = 0;
    let longCount = 0;
    let shortCount = 0;

    data.forEach((item: any) => {
      totalVolume += item.amount;
      if (item.amount > maxVolume) maxVolume = item.amount;
      if (item.side === 'long') longCount++;
      if (item.side === 'short') shortCount++;
    });

    return {
      data: {
        total_liquidations: data.length,
        total_volume: totalVolume,
        largest_liquidation: maxVolume,
        avg_liquidation: data.length > 0 ? totalVolume / data.length : 0,
        by_exchange: {},
        by_symbol: {},
        by_side: { long: longCount, short: shortCount }
      }
    };
  },
};

// Prices (Binance/CoinGecko)
export const pricesApi = {
  getAll: async (params?: {
    symbol?: string;
    start_date?: string;
    end_date?: string;
  }): Promise<any> => {
    const symbols = params?.symbol || 'BTCUSDT_PERP.A';
    
    // Normalize Coinalyze symbol format (e.g., BTCUSDT_PERP.A) to Binance format (BTCUSDT)
    const binanceSymbol = symbols.replace('_PERP.A', '').replace('PERP.A', '');

    // Use direct API call instead of proxy
    const baseUrl = 'https://api.binance.com';

    let binanceUrl: string;

    if (params?.start_date || params?.end_date) {
      // Explicit date range was requested
      const toTime = params?.end_date ? Math.floor(new Date(params.end_date).getTime()) : Date.now();
      const fromTime = params?.start_date ? Math.floor(new Date(params.start_date).getTime()) : toTime - (30 * 24 * 60 * 60 * 1000);
      // Cap endTime to avoid sending future timestamps from a skewed system clock
      const safeEndTime = Math.min(toTime, Date.now());
      const safeStartTime = Math.min(fromTime, safeEndTime - 1000);
      binanceUrl = `${baseUrl}/api/v3/klines?symbol=${binanceSymbol}&interval=1d&startTime=${safeStartTime}&endTime=${safeEndTime}&limit=1000`;
    } else {
      // No date range given — just get the latest 365 candles, no time params
      // This is safe regardless of what Date.now() returns
      binanceUrl = `${baseUrl}/api/v3/klines?symbol=${binanceSymbol}&interval=1d&limit=365`;
    }

    // Use direct API call
    const response = await axios.get(binanceUrl, { timeout: 30000 });
    const data = response.data;

    const formattedData: Price[] = data.map((item: any) => ({
      id: String(item[0]),
      symbol: binanceSymbol,
      timestamp: String(Math.floor(item[0] / 1000)),
      open: parseFloat(item[1]),
      high: parseFloat(item[2]),
      low: parseFloat(item[3]),
      close: parseFloat(item[4]),
      price: parseFloat(item[4]), // Mapping for compatibility
      volume: parseFloat(item[5])
    }));

    return {
      data: {
        data: formattedData,
        total: formattedData.length,
        page: 1,
        page_size: formattedData.length,
        has_next: false,
        has_prev: false
      }
    };
  },
};

// Mocks for missing features in serverless mode
export const exchangesApi = {
  getAll: async (): Promise<{ data: ExchangesResponse }> => {
    return { data: { exchanges: [] } };
  },
  getOne: async (id: string): Promise<{ data: Exchange }> => {
    return { data: {} as Exchange };
  },
};

export const alertsApi = {
  getAll: async (): Promise<{ data: AlertsResponse }> => ({ data: { alerts: [], count: 0 } }),
  create: async (data: any): Promise<{ data: Alert }> => ({ data: {} as Alert }),
  update: async (id: string, data: any): Promise<{ data: Alert }> => ({ data: {} as Alert }),
  delete: async (id: string): Promise<{ data: null }> => ({ data: null }),
  toggle: async (id: string): Promise<{ data: Alert }> => ({ data: {} as Alert }),
};

// Export dummy api instance for backwards compatibility if needed
export default axios.create({ baseURL: '/' });
