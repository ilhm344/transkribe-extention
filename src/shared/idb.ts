/**
 * Minimal IndexedDB wrapper for Transkribe — zero dependencies.
 *
 * Used primarily by offscreen's chunkUploader to persist audio chunks
 * across network outages and browser restarts. Keep the API small on
 * purpose: open, put, getAll, delete, clear.
 */

const LOG = '[idb]';

export interface IdbStoreSpec {
  name: string;
  keyPath: string;
  indexes?: Array<{ name: string; keyPath: string | string[]; unique?: boolean }>;
}

export interface IdbDbSpec {
  name: string;
  version: number;
  stores: IdbStoreSpec[];
}

/** Open (or upgrade) an IDB database. Promisified. */
export function openDb(spec: IdbDbSpec): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(spec.name, spec.version);
    req.onupgradeneeded = () => {
      const db = req.result;
      for (const s of spec.stores) {
        if (db.objectStoreNames.contains(s.name)) continue;
        const store = db.createObjectStore(s.name, { keyPath: s.keyPath });
        for (const idx of s.indexes ?? []) {
          store.createIndex(idx.name, idx.keyPath, { unique: idx.unique === true });
        }
        console.log(LOG, 'created store', s.name, 'keyPath:', s.keyPath);
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => {
      console.error(LOG, 'open failed', spec.name, req.error);
      reject(req.error ?? new Error('openDb failed'));
    };
    req.onblocked = () => {
      console.warn(LOG, 'open blocked by another tab', spec.name);
    };
  });
}

function tx<T>(
  db: IDBDatabase,
  store: string,
  mode: IDBTransactionMode,
  run: (s: IDBObjectStore) => IDBRequest<T>,
): Promise<T> {
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(store, mode);
    const os = transaction.objectStore(store);
    const req = run(os);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error(`idb ${store} request failed`));
    transaction.onerror = () => reject(transaction.error ?? new Error(`idb ${store} tx failed`));
  });
}

/** Add or replace a record. */
export function put<T>(db: IDBDatabase, store: string, value: T): Promise<IDBValidKey> {
  return tx<IDBValidKey>(db, store, 'readwrite', (s) => s.put(value as unknown as object));
}

/** Get one record by primary key. */
export function get<T>(db: IDBDatabase, store: string, key: IDBValidKey): Promise<T | undefined> {
  return tx<T | undefined>(db, store, 'readonly', (s) => s.get(key) as IDBRequest<T | undefined>);
}

/** Return all records in the store (optionally filtered by an index range). */
export function getAll<T>(
  db: IDBDatabase,
  store: string,
  opts?: { index?: string; query?: IDBKeyRange | IDBValidKey },
): Promise<T[]> {
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(store, 'readonly');
    const os = transaction.objectStore(store);
    const src = opts?.index ? os.index(opts.index) : os;
    const req = src.getAll(opts?.query);
    req.onsuccess = () => resolve((req.result as T[]) ?? []);
    req.onerror = () => reject(req.error ?? new Error(`idb ${store} getAll failed`));
  });
}

/** Delete a record by primary key. */
export function del(db: IDBDatabase, store: string, key: IDBValidKey): Promise<void> {
  return tx<undefined>(db, store, 'readwrite', (s) => s.delete(key) as IDBRequest<undefined>).then(
    () => undefined,
  );
}

/** Count rows, optionally in an index range. */
export function count(
  db: IDBDatabase,
  store: string,
  opts?: { index?: string; query?: IDBKeyRange | IDBValidKey },
): Promise<number> {
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(store, 'readonly');
    const os = transaction.objectStore(store);
    const src = opts?.index ? os.index(opts.index) : os;
    const req = src.count(opts?.query);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error(`idb ${store} count failed`));
  });
}

/** Remove every row from a store (used on session reset). */
export function clear(db: IDBDatabase, store: string): Promise<void> {
  return tx<undefined>(db, store, 'readwrite', (s) => s.clear() as IDBRequest<undefined>).then(
    () => undefined,
  );
}

// ─── Transkribe-specific database definition ───────────────────────────────

/**
 * Single DB shared by offscreen + background (service worker). Keep the
 * schema small; add new stores only with a version bump.
 *
 * Chunks use a synthesized string `id = sessionId + ':' + index` as keyPath,
 * because IDB composite array keys forbid null, but we need to buffer chunks
 * before POST /sessions succeeds (with `sessionId === null`). The helper
 * functions in chunkStore translate null → '__pending__' prefix.
 */
export const TRANSKRIBE_DB: IdbDbSpec = {
  name: 'transkribe',
  version: 1,
  stores: [
    {
      name: 'chunks',
      keyPath: 'id',
      indexes: [{ name: 'bySession', keyPath: 'sessionId' }],
    },
  ],
};

export const PENDING_SESSION_SENTINEL = '__pending__';

/** Compose the synthetic primary key for a ChunkRecord. */
export function makeChunkId(sessionId: string | null, index: number): string {
  return `${sessionId ?? PENDING_SESSION_SENTINEL}:${String(index).padStart(6, '0')}`;
}
