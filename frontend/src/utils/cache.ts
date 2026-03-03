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

            // OPTIMIZED: Use partial selection to find oldest entries without full sort (O(n) vs O(n log n))
            // We only need to remove ~20% oldest entries, not sort everything
            const targetSize = this.MAX_SIZE * 0.8 - requiredSpace;
            const sizeToRemove = currentSize - targetSize;

            // Collect cache entries with timestamps and sizes
            const cacheEntries: Array<{ key: string; value: string; timestamp: number; size: number }> = [];
            for (const [key, value] of entries) {
                if (key.startsWith(this.prefix)) {
                    try {
                        const data = JSON.parse(value);
                        if (data.timestamp) {
                            cacheEntries.push({ key, value, timestamp: data.timestamp, size: value.length * 2 });
                        }
                    } catch { /* skip invalid entries */ }
                }
            }

            if (cacheEntries.length === 0) return;

            // Find threshold timestamp that removes enough entries using QuickSelect-like approach
            // Instead of sorting O(n log n), we find the Kth oldest element in O(n) average case
            const removalRatio = Math.min(0.3, sizeToRemove / currentSize); // Remove up to 30%
            const entriesToRemove = Math.max(1, Math.floor(cacheEntries.length * removalRatio));

            // Use nth_element approach: find the timestamp threshold for the oldest entries
            // Simple implementation: use select algorithm to find Kth smallest timestamp
            const timestamps = cacheEntries.map(e => e.timestamp);
            const threshold = this.quickSelect(timestamps, entriesToRemove);

            // Remove all entries with timestamp <= threshold
            let removedSize = 0;
            for (const entry of cacheEntries) {
                if (entry.timestamp <= threshold && removedSize < sizeToRemove) {
                    localStorage.removeItem(entry.key);
                    removedSize += entry.size;
                }
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

    /**
     * QuickSelect algorithm - finds the kth smallest element in O(n) average time
     * Much faster than full sort O(n log n) when we only need a threshold
     */
    private quickSelect(arr: number[], k: number): number {
        if (arr.length <= k) return Math.max(...arr);

        const arrCopy = [...arr];
        let left = 0;
        let right = arrCopy.length - 1;

        while (left < right) {
            const pivotIndex = this.partition(arrCopy, left, right);
            if (pivotIndex === k) return arrCopy[k];
            if (pivotIndex < k) {
                left = pivotIndex + 1;
            } else {
                right = pivotIndex - 1;
            }
        }

        return arrCopy[left];
    }

    private partition(arr: number[], left: number, right: number): number {
        // OPTIMIZED: Random pivot to avoid O(n²) worst case on sorted arrays
        const randomIndex = left + Math.floor(Math.random() * (right - left + 1));
        [arr[randomIndex], arr[right]] = [arr[right], arr[randomIndex]];

        const pivot = arr[right];
        let i = left;

        for (let j = left; j < right; j++) {
            if (arr[j] <= pivot) {
                [arr[i], arr[j]] = [arr[j], arr[i]];
                i++;
            }
        }

        [arr[i], arr[right]] = [arr[right], arr[i]];
        return i;
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
