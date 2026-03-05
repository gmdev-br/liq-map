import { useState, useEffect, useCallback, useRef } from 'react';
import { cache } from '@/utils/cache';
import { dbCache } from '@/utils/db';

const isLargeDataKey = (key: string) =>
    key.startsWith('liquidation_') ||
    key.startsWith('liq_') ||
    key.startsWith('prices_');

interface UseCacheDataOptions<T> {
    cacheKey: string;
    fetchFn: () => Promise<T>;
    /** TTL in minutes. Use `null` or `undefined` for unlimited duration (never expires) */
    ttlMinutes?: number | null;
    enabled?: boolean;
    onSuccess?: (data: T) => void;
    onError?: (error: Error) => void;
}

interface UseCacheDataResult<T> {
    data: T | null;
    isLoading: boolean;
    error: Error | null;
    refetch: (forceRefresh?: boolean) => Promise<void>;
    refresh: () => Promise<void>; // Alias for force refresh
    isFromCache: boolean;
    clearCache: () => void | Promise<void>;
    lastUpdated: Date | null; // Timestamp of last update
    isStale: boolean; // True if data is older than 30 minutes
}

export function useCacheData<T>({
    cacheKey,
    fetchFn,
    ttlMinutes,
    enabled = true,
    onSuccess,
    onError
}: UseCacheDataOptions<T>): UseCacheDataResult<T> {
    const [data, setData] = useState<T | null>(null);
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<Error | null>(null);
    const [isFromCache, setIsFromCache] = useState(false);
    const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
    const [isStale, setIsStale] = useState(true);
    const requestIdRef = useRef(0);

    const fetchData = useCallback(async (forceRefresh = false, backgroundRefresh = false) => {
        console.log(`[useCacheData] fetchData called - enabled: ${enabled}, forceRefresh: ${forceRefresh}, cacheKey: ${cacheKey}`);
        
        if (!enabled && !forceRefresh) {
            console.log(`[useCacheData] Skipping fetch - enabled is false and not forced`);
            return;
        }

        // Generate unique request ID for race condition prevention
        const currentRequestId = ++requestIdRef.current;

        if (!backgroundRefresh) {
            setIsLoading(true);
        }
        setError(null);

        try {
            if (!forceRefresh) {
                let cachedData: T | null = null;
                if (isLargeDataKey(cacheKey)) {
                    cachedData = await dbCache.get<T>(cacheKey);
                } else {
                    cachedData = cache.get<T>(cacheKey);
                }

                if (cachedData !== null) {
                    // Check if request is still valid
                    if (currentRequestId !== requestIdRef.current) return;

                    setData(cachedData);
                    setIsFromCache(true);

                    // Update lastUpdated and isStale from cache metadata
                    const updateCacheInfo = async () => {
                        if (isLargeDataKey(cacheKey)) {
                            const metadata = await dbCache.getMetadata(cacheKey);
                            if (metadata?.lastUpdated) {
                                const lastUpdateDate = new Date(metadata.lastUpdated);
                                setLastUpdated(lastUpdateDate);
                                setIsStale(await dbCache.isStale(cacheKey, 30));
                            }
                        } else {
                            const metadata = cache.getMetadata(cacheKey);
                            if (metadata?.lastUpdated) {
                                const lastUpdateDate = new Date(metadata.lastUpdated);
                                setLastUpdated(lastUpdateDate);
                                setIsStale(cache.isStale(cacheKey, 30));
                            }
                        }
                    };
                    updateCacheInfo();

                    onSuccess?.(cachedData);
                    setIsLoading(false);

                    // Stale-While-Revalidate: trigger background refresh
                    setTimeout(() => fetchData(false, true), 0);
                    return;
                }
            }

            // Check if request is still valid before fetching
            if (currentRequestId !== requestIdRef.current) return;
            
            setIsFromCache(false);
            const freshData = await fetchFn();
            
            // Ignore stale responses
            if (currentRequestId !== requestIdRef.current) return;

            if (isLargeDataKey(cacheKey)) {
                await dbCache.set(cacheKey, freshData, ttlMinutes);
            } else {
                cache.set(cacheKey, freshData, ttlMinutes);
            }

            setData(freshData);
            setLastUpdated(new Date());
            setIsStale(false);
            onSuccess?.(freshData);
        } catch (err) {
            const errorObj = err instanceof Error ? err : new Error(String(err));
            console.error(`[useCacheData] Fetch error for ${cacheKey}:`, errorObj);
            setError(errorObj);
            onError?.(errorObj);
        } finally {
            console.log(`[useCacheData] Fetch completed for ${cacheKey}`);
            setIsLoading(false);
        }
    }, [cacheKey, fetchFn, ttlMinutes, enabled, onSuccess, onError]);

    const refetch = useCallback((forceRefresh = false) => {
        return fetchData(forceRefresh);
    }, [fetchData]);

    const refresh = useCallback(() => {
        // Force refresh - clears cache and fetches fresh data
        return fetchData(true);
    }, [fetchData]);

    const clearCache = useCallback(async () => {
        if (isLargeDataKey(cacheKey)) {
            await dbCache.remove(cacheKey);
        } else {
            cache.remove(cacheKey);
        }
        setData(null);
    }, [cacheKey]);

    useEffect(() => {
        fetchData(false);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [cacheKey, enabled]);

    return {
        data,
        isLoading,
        error,
        refetch,
        refresh,
        isFromCache,
        clearCache,
        lastUpdated,
        isStale
    };
}

interface UseCacheDataMultipleOptions<T> {
    cacheKeys: string[];
    fetchFns: Array<() => Promise<T>>;
    /** TTL in minutes. Use `null` or `undefined` for unlimited duration (never expires) */
    ttlMinutes?: number | null;
    enabled?: boolean;
    onSuccess?: (data: T[]) => void;
    onError?: (error: Error) => void;
}

interface UseCacheDataMultipleResult<T> {
    data: T[];
    isLoading: boolean;
    errors: Error[];
    refetch: (forceRefresh?: boolean) => Promise<void>;
    refresh: () => Promise<void>;
    isFromCache: boolean[];
    clearCache: () => void | Promise<void>;
    lastUpdated: Date | null;
    isStale: boolean;
}

export function useCacheDataMultiple<T>({
    cacheKeys,
    fetchFns,
    ttlMinutes,
    enabled = true,
    onSuccess,
    onError
}: UseCacheDataMultipleOptions<T>): UseCacheDataMultipleResult<T> {
    const [data, setData] = useState<T[]>([]);
    const [isLoading, setIsLoading] = useState(false);
    const [errors, setErrors] = useState<Error[]>([]);
    const [isFromCache, setIsFromCache] = useState<boolean[]>([]);
    const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
    const [isStale, setIsStale] = useState(true);

    const fetchData = useCallback(async (forceRefresh = false) => {
        if (!enabled || cacheKeys.length === 0 || fetchFns.length === 0) return;

        setIsLoading(true);
        setErrors([]);
        const fromCacheFlags: boolean[] = [];
        const results: T[] = [];
        const errorList: Error[] = [];

        try {
            // OPTIMIZED: Process cache checks in parallel first, then fetch missing data
            const cacheChecks = cacheKeys.map(async (key, i) => {
                if (forceRefresh) return { index: i, cached: null };

                let cachedData: T | null = null;
                if (isLargeDataKey(key)) {
                    cachedData = await dbCache.get<T>(key);
                } else {
                    cachedData = cache.get<T>(key);
                }
                return { index: i, cached: cachedData };
            });

            const cacheResults = await Promise.all(cacheChecks);

            // Fill in cached results
            for (const { index, cached } of cacheResults) {
                if (cached !== null) {
                    results[index] = cached;
                    fromCacheFlags[index] = true;
                }
            }

            // Fetch missing data in parallel
            const fetchPromises = cacheResults
                .filter(({ cached }) => cached === null)
                .map(async ({ index }) => {
                    const key = cacheKeys[index];
                    const fetchFn = fetchFns[index];

                    fromCacheFlags[index] = false;
                    try {
                        const freshData = await fetchFn();
                        if (isLargeDataKey(key)) {
                            await dbCache.set(key, freshData, ttlMinutes);
                        } else {
                            cache.set(key, freshData, ttlMinutes);
                        }
                        results[index] = freshData;
                    } catch (err) {
                        const errorObj = err instanceof Error ? err : new Error(String(err));
                        errorList[index] = errorObj;
                    }
                });

            await Promise.all(fetchPromises);

            setData(results);
            setIsFromCache(fromCacheFlags);
            setErrors(errorList);

            const validErrors = errorList.filter(e => e !== undefined && e !== null);
            if (validErrors.length > 0) {
                onError?.(validErrors[0]);
            } else if (results.length > 0 && results.every(r => r !== undefined && r !== null)) {
                onSuccess?.(results);
            } else {
                const errorMsg = 'No data available. Please check your API key and try again.';
                onError?.(new Error(errorMsg));
            }
        } catch (err) {
            const errorObj = err instanceof Error ? err : new Error(String(err));
            setErrors([errorObj]);
            onError?.(errorObj);
        } finally {
            setIsLoading(false);
        }
    }, [cacheKeys, fetchFns, ttlMinutes, enabled, onSuccess, onError]);

    const refetch = useCallback((forceRefresh = false) => {
        return fetchData(forceRefresh);
    }, [fetchData]);

    const refresh = useCallback(() => {
        return fetchData(true);
    }, [fetchData]);

    const clearCache = useCallback(async () => {
        for (const key of cacheKeys) {
            if (isLargeDataKey(key)) {
                await dbCache.remove(key);
            } else {
                cache.remove(key);
            }
        }
        setData([]);
        setIsFromCache([]);
        setLastUpdated(null);
        setIsStale(true);
    }, [cacheKeys]);

    useEffect(() => {
        fetchData(false);
    }, []);

    return {
        data,
        isLoading,
        errors,
        refetch,
        refresh,
        isFromCache,
        clearCache,
        lastUpdated,
        isStale
    };
}
