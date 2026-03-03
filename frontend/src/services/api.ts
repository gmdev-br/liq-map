import axios from 'axios';
import { cache } from '@/utils/cache';
import { dbCache } from '@/utils/db';
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

// detect if running in production (Vercel)
const isProduction = (() => {
  if (typeof window !== 'undefined') {
    const forcedMode = localStorage.getItem('force_api_mode');
    if (forcedMode === 'production') return true;
    if (forcedMode === 'development') return false;
  }
  if (typeof window === 'undefined') return false;
  const hostname = window.location.hostname;
  const isLocalhost = hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '0.0.0.0';
  const isDevPort = window.location.port === '5173' || window.location.port === '3000' || window.location.port === '5174';
  const isVercel = hostname.includes('.vercel.app') || hostname.includes('.vercel.sh');
  return !isLocalhost && !isDevPort || isVercel;
})();

const getBaseUrl = () => isProduction ? '' : '';

// Fetch with retry and abort controller for request cancellation
async function fetchWithRetry(url: string, options?: RequestInit, retries = 3): Promise<Response> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 30000); // 30s timeout
  
  try {
    const response = await fetch(url, { ...options, signal: controller.signal });
    clearTimeout(timeoutId);
    return response;
  } catch (error) {
    clearTimeout(timeoutId);
    if (retries > 0 && error instanceof Error && error.name !== 'AbortError') {
      await new Promise(resolve => setTimeout(resolve, 1000 * (4 - retries)));
      return fetchWithRetry(url, options, retries - 1);
    }
    throw error;
  }
}

const fetchBinancePrice = async (symbol: string): Promise<number> => {
  const cacheKey = `price_${symbol}`;
  const cached = cache.get<number>(cacheKey);
  if (cached) return cached;

  // Deduplicate active requests
  if (activeRequests.has(cacheKey)) {
    console.log(`[API] Deduplicating price request for ${cacheKey}`);
    return activeRequests.get(cacheKey);
  }

  const fetchPromise = (async () => {
    try {
      const binanceSymbol = symbol.replace('_PERP.A', '').replace('PERP.A', '');
      const isPerp = symbol.includes('PERP.A');

      let url: string;
      if (isPerp) {
        url = isProduction
          ? `https://fapi.binance.com/fapi/v1/klines?symbol=${binanceSymbol}&interval=1d&limit=1`
          : `/api/binance-futures/fapi/v1/klines?symbol=${binanceSymbol}&interval=1d&limit=1`;
      } else {
        url = isProduction
          ? `https://api.binance.com/api/v3/klines?symbol=${binanceSymbol}&interval=1d&limit=1`
          : `/api/binance-spot/api/v3/klines?symbol=${binanceSymbol}&interval=1d&limit=1`;
      }

      const response = await axios.get(url, { timeout: 5000, validateStatus: (status) => status < 500 });
      if (response.status === 400 || response.status === 404) {
        cache.set(cacheKey, 0, 5); // Cache non-existent symbols for 5 mins
        return 0;
      }

      const closePrice = response.data[0]?.[4];
      const price = closePrice ? parseFloat(closePrice) : 0;

      if (price > 0) cache.set(cacheKey, price, 1); // 1 min cache for prices
      return price;
    } catch (error: any) {
      // Silent fail for prices, avoid console clutter
      return 0;
    } finally {
      // Clean up from active requests
      setTimeout(() => activeRequests.delete(cacheKey), 0);
    }
  })();

  activeRequests.set(cacheKey, fetchPromise);
  return fetchPromise;
};

const fetchMultipleBinancePrices = async (symbols: string[]): Promise<Record<string, number>> => {
  const prices: Record<string, number> = {};
  const uniqueSymbols = [...new Set(symbols.map(s => s.replace('_PERP.A', '').replace('PERP.A', '')))];

  const promises = uniqueSymbols.map(async (symbol) => {
    prices[symbol] = await fetchBinancePrice(symbol);
  });

  await Promise.all(promises);
  return prices;
};

const fetchWithProxy = async (targetUrl: string, useProxy: boolean = false) => {
  if (!useProxy || isProduction) {
    try {
      const response = await axios.get(targetUrl, {
        timeout: 30000,
        headers: { 'X-Requested-With': 'XMLHttpRequest' }
      });
      return response.data;
    } catch (error: any) {
      throw error;
    }
  }
  return (await axios.get(`http://localhost:3001${targetUrl.replace('https://api.coinalyze.net', '')}`, { timeout: 30000 })).data;
};

const getApiKey = () => {
  try {
    const storage = localStorage.getItem('coinglass-storage');
    if (storage) {
      const userApiKey = JSON.parse(storage).state?.settings?.apiKey;
      if (userApiKey?.trim()) return userApiKey;
    }
  } catch (e) { }
  return 'FREE';
};

// In-memory request deduplicator to prevent double-firing in Dev/StrictMode
const activeRequests = new Map<string, Promise<any>>();

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
    const cacheKey = `liq_${symbols}_${fromTime}_${toTime}`;

    // Check for cached data first
    try {
      const cached = await dbCache.get<any>(cacheKey);
      if (cached) return cached;
    } catch (e) { }

    // Deduplicate active requests
    if (activeRequests.has(cacheKey)) {
      console.log(`[API] Deduplicating request for ${cacheKey}`);
      return activeRequests.get(cacheKey);
    }

    const targetUrl = `/api/coinalyze?${query}`;

    const fetchPromise = (async () => {
      try {
        // Fetch main data and prices in parallel
        const symbolList = symbols.split(',');
        const [data, binancePrices] = await Promise.all([
          fetchWithProxy(targetUrl, false),
          fetchMultipleBinancePrices(symbolList)
        ]);

        let transformedData: Liquidation[] = [];
        const multiSymbolData = Array.isArray(data) && data.length > 0 && typeof data[0] === 'object' && "history" in data[0];

        if (multiSymbolData) {
          // OPTIMIZED: Pre-calculate total size and use flatMap for better memory efficiency
          // Calculate total history length for pre-allocation
          let totalHistoryLength = 0;
          for (const symGroup of data) {
            totalHistoryLength += (symGroup.history || []).length;
          }

          // Pre-allocate array size to avoid dynamic resizing
          transformedData = new Array(totalHistoryLength);
          let dataIndex = 0;

          // Process each symbol group
          for (const symGroup of data) {
            const sym = symGroup.symbol;
            const history = symGroup.history || [];
            const binanceSymbolKey = sym.replace('_PERP.A', '').replace('PERP.A', '');
            const binancePrice = binancePrices[binanceSymbolKey] || 0;

            // Use for loop instead of forEach for better performance
            for (let i = 0; i < history.length; i++) {
              const item = history[i];
              const longLiq = item.l || item.long_volume || item.long || 0;
              const shortLiq = item.s || item.short || item.short_volume || item.sv || 0;
              const side = longLiq > shortLiq ? 'long' : 'short';
              const rawTime = item.t || item.time || item.timestamp || 0;
              const timestamp = (!rawTime || typeof rawTime !== 'number') ? Math.floor(Date.now() / 1000) : (rawTime < 10000000000 ? rawTime : Math.floor(rawTime / 1000));
              const liquidationPrice = item.price || binancePrice;
              const quantity = longLiq + shortLiq;

              // Direct assignment to pre-allocated array
              transformedData[dataIndex++] = {
                id: `${sym}_${rawTime}`,
                timestamp: String(timestamp),
                amount: quantity * liquidationPrice,
                exchange: item.exchange || 'unknown',
                side,
                price: liquidationPrice,
                symbol: sym,
                quantity: quantity,
                long_volume: longLiq * liquidationPrice,
                short_volume: shortLiq * liquidationPrice
              };
            }
          }

          // Trim array to actual size if there were empty history entries
          if (dataIndex < transformedData.length) {
            transformedData.length = dataIndex;
          }
        } else {
          // Single symbol response
          let liquidationList: any[] = [];
          if (Array.isArray(data)) {
            liquidationList = (data.length > 0 && typeof data[0] === 'object' && "history" in data[0]) ? data[0].history : data;
          } else if (typeof data === 'object') {
            liquidationList = data.history || data.data || [];
          }

          const liquidationSymbol = symbols.split(',')[0];
          const binanceSymbolKey = liquidationSymbol.replace('_PERP.A', '').replace('PERP.A', '');
          const binancePrice = binancePrices[binanceSymbolKey] || 0;

          transformedData = liquidationList.map(item => {
            const longLiq = item.l || item.long_volume || item.long || 0;
            const shortLiq = item.s || item.short || item.short_volume || item.sv || 0;
            const side = longLiq > shortLiq ? 'long' : 'short';
            const rawTime = item.t || item.time || item.timestamp || 0;
            const timestamp = (!rawTime || typeof rawTime !== 'number') ? Math.floor(Date.now() / 1000) : (rawTime < 10000000000 ? rawTime : Math.floor(rawTime / 1000));
            const liquidationPrice = item.price || binancePrice;

            return {
              id: String(rawTime),
              timestamp: String(timestamp),
              amount: (longLiq + shortLiq) * liquidationPrice,
              exchange: item.exchange || 'unknown',
              side,
              price: liquidationPrice,
              symbol: liquidationSymbol,
              quantity: longLiq + shortLiq,
              long_volume: longLiq * liquidationPrice,
              short_volume: shortLiq * liquidationPrice
            };
          });
        }

        if (params?.amount_min !== undefined) transformedData = transformedData.filter(i => i.amount >= params.amount_min!);
        if (params?.amount_max !== undefined) transformedData = transformedData.filter(i => i.amount <= params.amount_max!);

        const result = {
          data: {
            data: transformedData,
            total: transformedData.length,
            page: 1,
            page_size: transformedData.length,
            has_next: false,
            has_prev: false
          }
        };

        await dbCache.set(cacheKey, result, 5); // 5 min cache for liquidations
        return result;
      } catch (error: any) {
        if (error.response?.status === 429) {
          console.warn('[API] Rate limit hit, checking for stale cache fallback...');
          const raw = await dbCache.getRaw<any>(cacheKey);
          if (raw) {
            console.log('[API] Serving stale cache data due to 429');
            return raw.data;
          }
        }
        throw error;
      } finally {
        activeRequests.delete(cacheKey);
      }
    })();

    activeRequests.set(cacheKey, fetchPromise);
    return fetchPromise;
  },

  getOne: async (id: string): Promise<any> => {
    throw new Error("getOne not implemented in serverless mode");
  },

  getStats: async (params?: any): Promise<any> => {
    // Create derived stats from getAll if needed, but for now returning dummy to prevent crash
    const res = await liquidationsApi.getAll(params);
    const data = res.data.data;

    // OPTIMIZED: Single reduce returning object instead of forEach with multiple accumulations
    const stats = data.reduce((acc: any, item: any) => ({
      totalVolume: acc.totalVolume + item.amount,
      maxVolume: Math.max(acc.maxVolume, item.amount),
      longCount: acc.longCount + (item.side === 'long' ? 1 : 0),
      shortCount: acc.shortCount + (item.side === 'short' ? 1 : 0)
    }), { totalVolume: 0, maxVolume: 0, longCount: 0, shortCount: 0 });

    return {
      data: {
        total_liquidations: data.length,
        total_volume: stats.totalVolume,
        largest_liquidation: stats.maxVolume,
        avg_liquidation: data.length > 0 ? stats.totalVolume / data.length : 0,
        by_exchange: {},
        by_symbol: {},
        by_side: { long: stats.longCount, short: stats.shortCount }
      }
    };
  },

  getSymbols: async (): Promise<{ symbol: string; name: string; baseAsset: string; rank?: number; marketCap?: number; category: 'Perpetual' | 'Futures' | 'Spot' }[]> => {
    const cached = cache.get('symbols');
    if (cached) return cached as any;

    const popularNames: Record<string, string> = {
      'BTC': 'Bitcoin', 'ETH': 'Ethereum', 'SOL': 'Solana', 'XRP': 'Ripple',
      'ADA': 'Cardano', 'DOGE': 'Dogecoin', 'DOT': 'Polkadot', 'MATIC': 'Polygon',
      'LINK': 'Chainlink', 'PEPE': 'Pepe', 'WIF': 'dogwifhat', 'BONK': 'Bonk',
      'SUI': 'Sui', 'APT': 'Aptos', 'OP': 'Optimism', 'ARB': 'Arbitrum',
      'AVAX': 'Avalanche', 'BNB': 'Binance Coin'
    };

    try {
      let marketCapMap: Record<string, { rank: number; marketCap: number }> = {};
      try {
        const cgUrl = isProduction
          ? 'https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&order=market_cap_desc&per_page=250&page=1&sparkline=false'
          : '/api/coingecko/coins/markets?vs_currency=usd&order=market_cap_desc&per_page=250&page=1&sparkline=false';
        const cgResponse = await axios.get(cgUrl, { timeout: 8000 });
        if (Array.isArray(cgResponse.data)) {
          cgResponse.data.forEach((coin: any) => {
            marketCapMap[coin.symbol.toUpperCase()] = { rank: coin.market_cap_rank, marketCap: coin.market_cap };
          });
        }
      } catch (e) { }

      const futuresUrl = isProduction ? 'https://fapi.binance.com/fapi/v1/exchangeInfo' : '/api/binance-futures/fapi/v1/exchangeInfo';
      const spotUrl = isProduction ? 'https://api.binance.com/api/v3/exchangeInfo' : '/api/binance-spot/api/v3/exchangeInfo';

      const [futuresRes, spotRes] = await Promise.all([
        axios.get(futuresUrl, { timeout: 10000 }),
        axios.get(spotUrl, { timeout: 10000 })
      ]);

      const symbols: any[] = [];
      futuresRes.data.symbols.forEach((s: any) => {
        if (s.quoteAsset !== 'USDT' || s.status !== 'TRADING') return;
        const base = s.baseAsset;
        const cgData = marketCapMap[base];
        const category = s.contractType === 'PERPETUAL' ? 'Perpetual' : 'Futures';
        symbols.push({
          symbol: category === 'Perpetual' ? `${s.symbol}_PERP.A` : s.symbol,
          name: popularNames[base] || base,
          baseAsset: base,
          rank: cgData?.rank || 9999,
          marketCap: cgData?.marketCap || 0,
          category
        });
      });

      spotRes.data.symbols.forEach((s: any) => {
        if (s.quoteAsset !== 'USDT' || s.status !== 'TRADING') return;
        const base = s.baseAsset;
        const cgData = marketCapMap[base];
        if (cgData || popularNames[base]) {
          symbols.push({
            symbol: s.symbol,
            name: popularNames[base] || base,
            baseAsset: base,
            rank: cgData?.rank || 9999,
            marketCap: cgData?.marketCap || 0,
            category: 'Spot'
          });
        }
      });

      // OPTIMIZED: Use Schwartzian Transform (decorate-sort-undecorate) to avoid recalculating sort keys
      // Pre-compute sort keys once per element instead of repeatedly in comparator
      const catOrder: Record<string, number> = { 'Perpetual': 1, 'Futures': 2, 'Spot': 3 };

      // Decorate: Add computed sort keys to each element
      const decorated = symbols.map(s => ({
        symbol: s,
        catOrder: catOrder[s.category] || 99,  // Pre-computed category order
        // Pre-compute lowercase name for faster string comparison (avoid localeCompare overhead)
        nameLower: s.name.toLowerCase()
      }));

      // Sort using pre-computed keys
      decorated.sort((a, b) => {
        if (a.catOrder !== b.catOrder) return a.catOrder - b.catOrder;
        if (a.symbol.rank !== b.symbol.rank) return a.symbol.rank - b.symbol.rank;
        // Use simple string comparison instead of localeCompare (much faster)
        return a.nameLower < b.nameLower ? -1 : a.nameLower > b.nameLower ? 1 : 0;
      });

      // Undecorate: Extract sorted symbols
      const sorted = decorated.map(d => d.symbol);

      cache.set('symbols', sorted, 60); // 1h cache for symbols
      return sorted;
    } catch (error) {
      return [
        { symbol: 'BTCUSDT_PERP.A', name: 'Bitcoin', baseAsset: 'BTC', rank: 1, marketCap: 1.2e12, category: 'Perpetual' },
        { symbol: 'ETHUSDT_PERP.A', name: 'Ethereum', baseAsset: 'ETH', rank: 2, marketCap: 3.5e11, category: 'Perpetual' },
        { symbol: 'BTCUSDT', name: 'Bitcoin', baseAsset: 'BTC', rank: 1, marketCap: 1.2e12, category: 'Spot' },
      ];
    }
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
    const binanceSymbol = symbols.replace('_PERP.A', '').replace('PERP.A', '');
    const cacheKey = `prices_${symbols}_${params?.start_date}_${params?.end_date}`;

    try {
      const cached = await dbCache.get<any>(cacheKey);
      if (cached) return cached;
    } catch (e) { }

    let binanceUrl: string;
    const baseUrl = isProduction ? 'https://api.binance.com' : '/api/binance-spot';

    if (params?.start_date || params?.end_date) {
      const toTime = params?.end_date ? Math.floor(new Date(params.end_date).getTime()) : Date.now();
      const fromTime = params?.start_date ? Math.floor(new Date(params.start_date).getTime()) : toTime - (30 * 24 * 60 * 60 * 1000);
      const safeEndTime = Math.min(toTime, Date.now());
      const safeStartTime = Math.min(fromTime, safeEndTime - 1000);
      binanceUrl = `${baseUrl}/api/v3/klines?symbol=${binanceSymbol}&interval=1d&startTime=${safeStartTime}&endTime=${safeEndTime}&limit=1000`;
    } else {
      binanceUrl = `${baseUrl}/api/v3/klines?symbol=${binanceSymbol}&interval=1d&limit=365`;
    }

    try {
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
        price: parseFloat(item[4]),
        volume: parseFloat(item[5])
      }));

      const result = {
        data: {
          data: formattedData,
          total: formattedData.length,
          page: 1,
          page_size: formattedData.length,
          has_next: false,
          has_prev: false
        }
      };
      await dbCache.set(cacheKey, result, 10); // 10 min cache for price history
      return result;
    } catch (error) {
      throw error;
    }
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
