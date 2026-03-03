import { useState, useEffect, useCallback } from 'react';
import { cache } from '@/utils/cache';
import { dbCache } from '@/utils/db';

const isLargeDataKey = (key: string) =>
    key.startsWith('liquidation_') ||
    key.startsWith('liq_') ||
    key.startsWith('prices_');

interface UseCacheDataOptions<T> {
    cacheKey: string;
    fetchFn: () => Promise<T>;
    ttlMinutes?: number;
    enabled?: boolean;
    onSuccess?: (data: T) => void;
    onError?: (error: Error) => void;
}

interface UseCacheDataResult<T> {
    data: T | null;
    isLoading: boolean;
    error: Error | null;
    refetch: (forceRefresh?: boolean) => Promise<void>;
    isFromCache: boolean;
    clearCache: () => void | Promise<void>;
}

export function useCacheData<T>({
    cacheKey,
    fetchFn,
    ttlMinutes = 60,
    enabled = true,
    onSuccess,
    onError
}: UseCacheDataOptions<T>): UseCacheDataResult<T> {
    const [data, setData] = useState<T | null>(null);
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<Error | null>(null);
    const [isFromCache, setIsFromCache] = useState(false);

    const fetchData = useCallback(async (forceRefresh = false) => {
        console.log(`[useCacheData] fetchData called - enabled: ${enabled}, forceRefresh: ${forceRefresh}, cacheKey: ${cacheKey}`);
        
        if (!enabled && !forceRefresh) {
            console.log(`[useCacheData] Skipping fetch - enabled is false and not forced`);
            return;
        }

        setIsLoading(true);
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
                    setData(cachedData);
                    setIsFromCache(true);
                    onSuccess?.(cachedData);
                    setIsLoading(false);
                    return;
                }
            }

            setIsFromCache(false);
            const freshData = await fetchFn();

            if (isLargeDataKey(cacheKey)) {
                await dbCache.set(cacheKey, freshData, ttlMinutes);
            } else {
                cache.set(cacheKey, freshData, ttlMinutes);
            }

            setData(freshData);
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
    }, []);

    return {
        data,
        isLoading,
        error,
        refetch,
        isFromCache,
        clearCache
    };
}

interface UseCacheDataMultipleOptions<T> {
    cacheKeys: string[];
    fetchFns: Array<() => Promise<T>>;
    ttlMinutes?: number;
    enabled?: boolean;
    onSuccess?: (data: T[]) => void;
    onError?: (error: Error) => void;
}

interface UseCacheDataMultipleResult<T> {
    data: T[];
    isLoading: boolean;
    errors: Error[];
    refetch: (forceRefresh?: boolean) => Promise<void>;
    isFromCache: boolean[];
    clearCache: () => void | Promise<void>;
}

export function useCacheDataMultiple<T>({
    cacheKeys,
    fetchFns,
    ttlMinutes = 60,
    enabled = true,
    onSuccess,
    onError
}: UseCacheDataMultipleOptions<T>): UseCacheDataMultipleResult<T> {
    const [data, setData] = useState<T[]>([]);
    const [isLoading, setIsLoading] = useState(false);
    const [errors, setErrors] = useState<Error[]>([]);
    const [isFromCache, setIsFromCache] = useState<boolean[]>([]);

    const fetchData = useCallback(async (forceRefresh = false) => {
        if (!enabled || cacheKeys.length === 0 || fetchFns.length === 0) return;

        setIsLoading(true);
        setErrors([]);
        const fromCacheFlags: boolean[] = [];
        const results: T[] = [];
        const errorList: Error[] = [];

        try {
            for (let i = 0; i < cacheKeys.length; i++) {
                const key = cacheKeys[i];
                const fetchFn = fetchFns[i];

                if (!forceRefresh) {
                    let cachedData: T | null = null;
                    if (isLargeDataKey(key)) {
                        cachedData = await dbCache.get<T>(key);
                    } else {
                        cachedData = cache.get<T>(key);
                    }

                    if (cachedData !== null) {
                        results[i] = cachedData;
                        fromCacheFlags[i] = true;
                        continue;
                    }
                }

                fromCacheFlags[i] = false;
                try {
                    const freshData = await fetchFn();
                    if (isLargeDataKey(key)) {
                        await dbCache.set(key, freshData, ttlMinutes);
                    } else {
                        cache.set(key, freshData, ttlMinutes);
                    }
                    results[i] = freshData;
                } catch (err) {
                    const errorObj = err instanceof Error ? err : new Error(String(err));
                    errorList[i] = errorObj;
                }
            }

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
    }, [cacheKeys]);

    useEffect(() => {
        fetchData(false);
    }, []);

    return {
        data,
        isLoading,
        errors,
        refetch,
        isFromCache,
        clearCache
    };
}
