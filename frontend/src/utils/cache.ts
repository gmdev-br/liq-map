interface CacheEntry<T> {
    data: T;
    timestamp: number;
    ttl: number;
}

class CacheManager {
    private prefix = 'coinglass_cache_';

    set<T>(key: string, data: T, ttlMinutes: number = 60): void {
        const entry: CacheEntry<T> = {
            data,
            timestamp: Date.now(),
            ttl: ttlMinutes * 60 * 1000
        };
        try {
            localStorage.setItem(this.prefix + key, JSON.stringify(entry));
        } catch (error) {
            if (error instanceof Error && (error.name === 'QuotaExceededError' || error.name === 'NS_ERROR_DOM_QUOTA_REACHED')) {
                console.warn('Cache quota exceeded, clearing old entries...');
                this.makeSpace();
                try {
                    localStorage.setItem(this.prefix + key, JSON.stringify(entry));
                } catch (retryError) {
                    console.error('Failed to save to cache even after clearing space', retryError);
                }
            } else {
                console.error('Error saving to cache:', error);
            }
        }
    }

    private makeSpace(): void {
        try {
            const keys = Object.keys(localStorage)
                .filter(k => k.startsWith(this.prefix))
                .map(k => ({
                    key: k,
                    timestamp: JSON.parse(localStorage.getItem(k) || '{}').timestamp || 0
                }))
                .sort((a, b) => a.timestamp - b.timestamp);

            // Remove oldest 50% of cache entries
            const toRemove = Math.max(1, Math.floor(keys.length / 2));
            for (let i = 0; i < toRemove; i++) {
                localStorage.removeItem(keys[i].key);
            }
        } catch (e) {
            localStorage.clear(); // Nuclear option if parsing fails
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
