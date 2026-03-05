export interface DBCacheEntry<T> {
    key: string;
    data: T;
    timestamp: number;
    ttl: number; // TTL in milliseconds. Use Infinity for unlimited duration
}

export interface DBCacheMetadata {
    lastUpdated: number;
    version?: number;
}

class IndexedDBManager {
    private dbName = 'coinglass_db';
    private storeName = 'cache';
    private metadataStoreName = 'cache_metadata';
    private version = 2; // Incremented version for new store
    private PERMANENT_TTL = 365 * 24 * 60 * 60 * 1000; // 1 year in milliseconds

    /**
     * Validates that all required object stores exist in the database.
     * If stores are missing, deletes and recreates the database.
     */
    private async validateAndRepairDB(): Promise<IDBDatabase> {
        return new Promise((resolve, reject) => {
            // First, try to open the database to check its current state
            const checkRequest = indexedDB.open(this.dbName);

            checkRequest.onsuccess = () => {
                const db = checkRequest.result;
                const hasCacheStore = db.objectStoreNames.contains(this.storeName);
                const hasMetadataStore = db.objectStoreNames.contains(this.metadataStoreName);

                // If all stores exist, we're good
                if (hasCacheStore && hasMetadataStore) {
                    db.close();
                    // Reopen with correct version
                    this.openDB().then(resolve).catch(reject);
                    return;
                }

                // Stores are missing, need to recreate the database
                console.warn('[DB] Missing stores detected. Recreating database...');
                db.close();

                // Delete and recreate
                const deleteRequest = indexedDB.deleteDatabase(this.dbName);

                deleteRequest.onsuccess = () => {
                    console.log('[DB] Old database deleted. Creating new one...');
                    this.openDB().then(resolve).catch(reject);
                };

                deleteRequest.onerror = () => {
                    console.error('[DB] Failed to delete old database:', deleteRequest.error);
                    reject(deleteRequest.error);
                };

                deleteRequest.onblocked = () => {
                    console.warn('[DB] Database deletion blocked. Close other tabs and try again.');
                    reject(new Error('Database deletion blocked by another tab'));
                };
            };

            checkRequest.onerror = () => {
                console.error('[DB] Failed to check database state:', checkRequest.error);
                // Try to create fresh database
                this.openDB().then(resolve).catch(reject);
            };
        });
    }

    /**
     * Opens the database with the correct version and creates stores if needed.
     */
    private async openDB(): Promise<IDBDatabase> {
        return new Promise((resolve, reject) => {
            const request = indexedDB.open(this.dbName, this.version);

            request.onupgradeneeded = (event) => {
                const db = (event.target as IDBOpenDBRequest).result;
                const oldVersion = event.oldVersion;

                console.log(`[DB] Upgrading database from version ${oldVersion} to ${this.version}`);

                // Create cache store if it doesn't exist
                if (!db.objectStoreNames.contains(this.storeName)) {
                    console.log('[DB] Creating cache store...');
                    db.createObjectStore(this.storeName, { keyPath: 'key' });
                }

                // Create metadata store if it doesn't exist
                if (!db.objectStoreNames.contains(this.metadataStoreName)) {
                    console.log('[DB] Creating cache_metadata store...');
                    db.createObjectStore(this.metadataStoreName, { keyPath: 'key' });
                }
            };

            request.onsuccess = () => {
                const db = request.result;
                console.log(`[DB] Database opened successfully (version ${db.version})`);
                resolve(db);
            };

            request.onerror = () => {
                console.error('[DB] Failed to open database:', request.error);
                reject(request.error);
            };

            request.onblocked = () => {
                console.warn('[DB] Database opening blocked. Close other tabs using this app.');
                reject(new Error('Database blocked by another tab'));
            };
        });
    }

    /**
     * Gets the database, validating that all stores exist.
     * If stores are missing, repairs the database.
     */
    private async getDB(): Promise<IDBDatabase> {
        try {
            const db = await this.openDB();

            // Validate that all required stores exist
            const hasCacheStore = db.objectStoreNames.contains(this.storeName);
            const hasMetadataStore = db.objectStoreNames.contains(this.metadataStoreName);

            if (!hasCacheStore || !hasMetadataStore) {
                console.warn('[DB] Database opened but stores are missing. Repairing...');
                db.close();
                return this.validateAndRepairDB();
            }

            return db;
        } catch (error) {
            console.error('[DB] Error getting database:', error);
            throw error;
        }
    }

    /**
     * Checks if a transaction can be created for the given store names.
     */
    private canCreateTransaction(db: IDBDatabase, storeNames: string | string[]): boolean {
        const stores = Array.isArray(storeNames) ? storeNames : [storeNames];
        return stores.every(store => db.objectStoreNames.contains(store));
    }

    /**
     * Set data in cache with permanent/no expiration (1 year TTL)
     * Use this for data that should persist across sessions
     */
    async setPermanent<T>(key: string, data: T): Promise<void> {
        return this.set(key, data, this.PERMANENT_TTL / (60 * 1000)); // Convert to minutes
    }

    /**
     * Set data in cache with unlimited duration (never expires)
     * Use this for data that should never expire until explicitly cleared
     */
    async setUnlimited<T>(key: string, data: T): Promise<void> {
        return this.set(key, data, null);
    }

    /**
     * Get metadata for a cache key (last updated timestamp, version, etc.)
     */
    async getMetadata(key: string): Promise<DBCacheMetadata | null> {
        try {
            const db = await this.getDB();

            // Check if store exists before creating transaction
            if (!this.canCreateTransaction(db, this.metadataStoreName)) {
                console.warn('[DB] Metadata store not available');
                return null;
            }

            return new Promise((resolve, reject) => {
                const transaction = db.transaction(this.metadataStoreName, 'readonly');
                const store = transaction.objectStore(this.metadataStoreName);
                const request = store.get(key);

                request.onsuccess = () => {
                    const result = request.result;
                    if (result) {
                        resolve({ lastUpdated: result.lastUpdated, version: result.version });
                    } else {
                        resolve(null);
                    }
                };
                request.onerror = () => reject(request.error);
            });
        } catch (error) {
            console.error('[DB] Error getting metadata:', error);
            return null;
        }
    }

    /**
     * Set metadata for a cache key
     */
    async setMetadata(key: string, metadata: DBCacheMetadata): Promise<void> {
        try {
            const db = await this.getDB();

            // Check if store exists before creating transaction
            if (!this.canCreateTransaction(db, this.metadataStoreName)) {
                console.warn('[DB] Metadata store not available');
                return;
            }

            return new Promise((resolve, reject) => {
                const transaction = db.transaction(this.metadataStoreName, 'readwrite');
                const store = transaction.objectStore(this.metadataStoreName);
                const request = store.put({ key, ...metadata });

                request.onsuccess = () => resolve();
                request.onerror = () => reject(request.error);
            });
        } catch (error) {
            console.error('[DB] Error setting metadata:', error);
        }
    }

    /**
     * Remove metadata for a cache key
     */
    async removeMetadata(key: string): Promise<void> {
        try {
            const db = await this.getDB();

            // Check if store exists before creating transaction
            if (!this.canCreateTransaction(db, this.metadataStoreName)) {
                console.warn('[DB] Metadata store not available');
                return;
            }

            return new Promise((resolve, reject) => {
                const transaction = db.transaction(this.metadataStoreName, 'readwrite');
                const store = transaction.objectStore(this.metadataStoreName);
                const request = store.delete(key);

                request.onsuccess = () => resolve();
                request.onerror = () => reject(request.error);
            });
        } catch (error) {
            console.error('[DB] Error removing metadata:', error);
        }
    }

    /**
     * Check if data is stale (older than maxAgeMinutes) without removing it
     * Returns true if data doesn't exist or is older than maxAgeMinutes
     */
    async isStale(key: string, maxAgeMinutes: number): Promise<boolean> {
        try {
            const entry = await this.getRaw<any>(key);
            if (!entry) return true;

            const now = Date.now();
            const age = now - entry.timestamp;
            const maxAgeMs = maxAgeMinutes * 60 * 1000;

            return age > maxAgeMs;
        } catch (error) {
            console.error('[DB] Error checking staleness:', error);
            return true;
        }
    }

    /**
     * Get the age of cached data in minutes
     * Returns -1 if data doesn't exist
     */
    async getAge(key: string): Promise<number> {
        try {
            const entry = await this.getRaw<any>(key);
            if (!entry) return -1;

            const now = Date.now();
            const ageMs = now - entry.timestamp;
            return Math.floor(ageMs / (60 * 1000));
        } catch (error) {
            console.error('[DB] Error getting age:', error);
            return -1;
        }
    }

    async set<T>(key: string, data: T, ttlMinutes?: number | null): Promise<void> {
        try {
            const db = await this.getDB();
            const entry: DBCacheEntry<T> = {
                key,
                data,
                timestamp: Date.now(),
                ttl: ttlMinutes === null || ttlMinutes === undefined ? Infinity : ttlMinutes * 60 * 1000
            };

            // Check if both stores exist
            const storeNames = [this.storeName, this.metadataStoreName];
            if (!this.canCreateTransaction(db, storeNames)) {
                console.warn('[DB] One or more stores not available, skipping cache write');
                return;
            }

            return new Promise((resolve, reject) => {
                const transaction = db.transaction(storeNames, 'readwrite');
                const store = transaction.objectStore(this.storeName);
                const metaStore = transaction.objectStore(this.metadataStoreName);

                const request = store.put(entry);
                const metaRequest = metaStore.put({ key, lastUpdated: Date.now() });

                request.onsuccess = () => {
                    metaRequest.onsuccess = () => resolve();
                    metaRequest.onerror = () => reject(metaRequest.error);
                };
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
        // Check expiration: unlimited duration (Infinity) never expires
        if (entry.ttl !== Infinity && now - entry.timestamp > entry.ttl) {
            this.remove(key);
            return null;
        }

        return entry.data;
    }

    async getRaw<T>(key: string): Promise<DBCacheEntry<T> | null> {
        try {
            const db = await this.getDB();

            // Check if store exists before creating transaction
            if (!this.canCreateTransaction(db, this.storeName)) {
                console.warn('[DB] Cache store not available');
                return null;
            }

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

            // Check if both stores exist
            const storeNames = [this.storeName, this.metadataStoreName];
            if (!this.canCreateTransaction(db, storeNames)) {
                console.warn('[DB] One or more stores not available, skipping remove');
                return;
            }

            return new Promise((resolve, reject) => {
                const transaction = db.transaction(storeNames, 'readwrite');
                const store = transaction.objectStore(this.storeName);
                const metaStore = transaction.objectStore(this.metadataStoreName);

                const request = store.delete(key);
                const metaRequest = metaStore.delete(key);

                request.onsuccess = () => {
                    metaRequest.onsuccess = () => resolve();
                    metaRequest.onerror = () => reject(metaRequest.error);
                };
                request.onerror = () => reject(request.error);
            });
        } catch (error) {
            console.error('[DB] Error removing item:', error);
        }
    }

    async clear(): Promise<void> {
        try {
            const db = await this.getDB();

            // Check if both stores exist
            const storeNames = [this.storeName, this.metadataStoreName];
            if (!this.canCreateTransaction(db, storeNames)) {
                console.warn('[DB] One or more stores not available, skipping clear');
                return;
            }

            return new Promise((resolve, reject) => {
                const transaction = db.transaction(storeNames, 'readwrite');
                const store = transaction.objectStore(this.storeName);
                const metaStore = transaction.objectStore(this.metadataStoreName);

                const request = store.clear();
                const metaRequest = metaStore.clear();

                request.onsuccess = () => {
                    metaRequest.onsuccess = () => resolve();
                    metaRequest.onerror = () => reject(metaRequest.error);
                };
                request.onerror = () => reject(request.error);
            });
        } catch (error) {
            console.error('[DB] Error clearing database:', error);
        }
    }

    /**
     * Force recreates the database by deleting it and creating a new one.
     * Use this as a last resort when the database is in an inconsistent state.
     */
    async forceRecreate(): Promise<void> {
        return new Promise((resolve, reject) => {
            console.log('[DB] Force recreating database...');

            const request = indexedDB.deleteDatabase(this.dbName);

            request.onsuccess = () => {
                console.log('[DB] Database deleted. Will be recreated on next access.');
                resolve();
            };

            request.onerror = () => {
                console.error('[DB] Failed to delete database:', request.error);
                reject(request.error);
            };

            request.onblocked = () => {
                console.warn('[DB] Database deletion blocked. Close other tabs.');
                reject(new Error('Database deletion blocked'));
            };
        });
    }
}

export const dbCache = new IndexedDBManager();
