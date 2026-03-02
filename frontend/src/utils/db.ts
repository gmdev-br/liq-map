export interface DBCacheEntry<T> {
    key: string;
    data: T;
    timestamp: number;
    ttl: number;
}

class IndexedDBManager {
    private dbName = 'coinglass_db';
    private storeName = 'cache';
    private version = 1;

    private async getDB(): Promise<IDBDatabase> {
        return new Promise((resolve, reject) => {
            const request = indexedDB.open(this.dbName, this.version);

            request.onupgradeneeded = (event) => {
                const db = (event.target as IDBOpenDBRequest).result;
                if (!db.objectStoreNames.contains(this.storeName)) {
                    db.createObjectStore(this.storeName, { keyPath: 'key' });
                }
            };

            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
    }

    async set<T>(key: string, data: T, ttlMinutes: number = 60): Promise<void> {
        try {
            const db = await this.getDB();
            const entry: DBCacheEntry<T> = {
                key,
                data,
                timestamp: Date.now(),
                ttl: ttlMinutes * 60 * 1000
            };

            return new Promise((resolve, reject) => {
                const transaction = db.transaction(this.storeName, 'readwrite');
                const store = transaction.objectStore(this.storeName);
                const request = store.put(entry);

                request.onsuccess = () => resolve();
                request.onerror = () => reject(request.error);
            });
        } catch (error) {
            console.error('[DB] Error setting item:', error);
        }
    }

    async get<T>(key: string): Promise<T | null> {
        const entry = await this.getRaw<T>(key);
        if (!entry) return null;

        const now = Date.now();
        if (now - entry.timestamp > entry.ttl) {
            this.remove(key);
            return null;
        }

        return entry.data;
    }

    async getRaw<T>(key: string): Promise<DBCacheEntry<T> | null> {
        try {
            const db = await this.getDB();
            return new Promise((resolve, reject) => {
                const transaction = db.transaction(this.storeName, 'readonly');
                const store = transaction.objectStore(this.storeName);
                const request = store.get(key);

                request.onsuccess = () => resolve(request.result || null);
                request.onerror = () => reject(request.error);
            });
        } catch (error) {
            console.error('[DB] Error getting raw item:', error);
            return null;
        }
    }

    async remove(key: string): Promise<void> {
        try {
            const db = await this.getDB();
            return new Promise((resolve, reject) => {
                const transaction = db.transaction(this.storeName, 'readwrite');
                const store = transaction.objectStore(this.storeName);
                const request = store.delete(key);

                request.onsuccess = () => resolve();
                request.onerror = () => reject(request.error);
            });
        } catch (error) {
            console.error('[DB] Error removing item:', error);
        }
    }

    async clear(): Promise<void> {
        try {
            const db = await this.getDB();
            return new Promise((resolve, reject) => {
                const transaction = db.transaction(this.storeName, 'readwrite');
                const store = transaction.objectStore(this.storeName);
                const request = store.clear();

                request.onsuccess = () => resolve();
                request.onerror = () => reject(request.error);
            });
        } catch (error) {
            console.error('[DB] Error clearing database:', error);
        }
    }
}

export const dbCache = new IndexedDBManager();
