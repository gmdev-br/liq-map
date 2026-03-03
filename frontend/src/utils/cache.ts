interface CacheEntry<T> {
    data: T;
    timestamp: number;
    ttl: number;
}

class CacheManager {
    private prefix = 'coinglass_cache_';
    private MAX_SIZE = 5 * 1024 * 1024; // 5MB default localStorage limit

    set<T>(key: string, data: T, ttlMinutes: number = 60): void {
        const entry: CacheEntry<T> = {
            data,
            timestamp: Date.now(),
            ttl: ttlMinutes * 60 * 1000
        };
        const serialized = JSON.stringify(entry);
        const requiredSpace = serialized.length * 2; // Each char takes 2 bytes in UTF-16

        try {
            localStorage.setItem(this.prefix + key, serialized);
        } catch (error) {
            if (error instanceof Error && (error.name === 'QuotaExceededError' || error.name === 'NS_ERROR_DOM_QUOTA_REACHED')) {
                console.warn('Cache quota exceeded, clearing old entries...');
                this.makeSpace(requiredSpace);
                try {
                    localStorage.setItem(this.prefix + key, serialized);
                } catch (retryError) {
                    console.error('Failed to save to cache even after clearing space', retryError);
                }
            } else {
                console.error('Error saving to cache:', error);
            }
        }
    }

    private makeSpace(requiredSpace: number = 0): void {
        try {
            const entries = Object.entries(localStorage);
            let currentSize = entries.reduce((sum, [, value]) => sum + (value?.length || 0) * 2, 0);

            // If we have enough space, no need to remove anything
            if (currentSize + requiredSpace <= this.MAX_SIZE * 0.9) return;

            // Single-pass: collect cache entries with timestamps
            const cacheEntries: Array<{ key: string; value: string; timestamp: number }> = [];
            for (const [key, value] of entries) {
                if (key.startsWith(this.prefix)) {
                    try {
                        const data = JSON.parse(value);
                        if (data.timestamp) {
                            cacheEntries.push({ key, value, timestamp: data.timestamp });
                        }
                    } catch { /* skip invalid entries */ }
                }
            }

            // Sort once by timestamp (oldest first)
            cacheEntries.sort((a, b) => a.timestamp - b.timestamp);

            // Remove oldest entries until we have enough space
            while (currentSize + requiredSpace > this.MAX_SIZE * 0.8 && cacheEntries.length > 0) {
                const oldest = cacheEntries.shift()!;
                localStorage.removeItem(oldest.key);
                currentSize -= oldest.value.length * 2;
            }
        } catch (e) {
            // Nuclear option if parsing fails - clear only our keys
            try {
                Object.keys(localStorage)
                    .filter(k => k.startsWith(this.prefix))
                    .forEach(k => localStorage.removeItem(k));
            } catch {
                localStorage.clear();
            }
        }
    }

    get<T>(key: string): T | null {
        try {
            const item = localStorage.getItem(this.prefix + key);
            if (!item) return null;

            const entry: CacheEntry<T> = JSON.parse(item);
            const now = Date.now();
            const age = now - entry.timestamp;

            if (age > entry.ttl) {
                this.remove(key);
                return null;
            }

            return entry.data;
        } catch (error) {
            console.error('Error reading from cache:', error);
            return null;
        }
    }

    remove(key: string): void {
        try {
            localStorage.removeItem(this.prefix + key);
        } catch (error) {
            console.error('Error removing from cache:', error);
        }
    }

    clear(): void {
        try {
            const keys = Object.keys(localStorage);
            keys.forEach(key => {
                if (key.startsWith(this.prefix)) {
                    localStorage.removeItem(key);
                }
            });
        } catch (error) {
            console.error('Error clearing cache:', error);
        }
    }

    has(key: string): boolean {
        try {
            const item = localStorage.getItem(this.prefix + key);
            if (!item) return false;

            const entry: CacheEntry<any> = JSON.parse(item);
            const now = Date.now();
            const age = now - entry.timestamp;

            if (age > entry.ttl) {
                this.remove(key);
                return false;
            }

            return true;
        } catch (error) {
            return false;
        }
    }

    getCacheInfo(key: string): { exists: boolean; age: number; ttl: number } | null {
        try {
            const item = localStorage.getItem(this.prefix + key);
            if (!item) return null;

            const entry: CacheEntry<any> = JSON.parse(item);
            const now = Date.now();
            const age = now - entry.timestamp;

            return {
                exists: age <= entry.ttl,
                age,
                ttl: entry.ttl
            };
        } catch (error) {
            return null;
        }
    }
}

export const cache = new CacheManager();
