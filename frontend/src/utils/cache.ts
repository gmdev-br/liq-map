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
            console.error('Error saving to cache:', error);
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
