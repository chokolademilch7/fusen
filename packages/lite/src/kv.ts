/**
 * The tiny key-value surface the lite store needs, and its IndexedDB
 * implementation.
 *
 * WHY THE INDIRECTION. IndexedDB exists only in a browser, and `bun test` has no
 * implementation of it. Without a seam here the entire lite store would be
 * untestable except through a real browser, which means its logic — id
 * allocation, ordering, vote arithmetic — would only ever be checked by an
 * end-to-end test that is slow and reports failures in the wrong place.
 *
 * So the logic is written against `Kv`, tested in-process against a memory
 * implementation, and the IndexedDB implementation below is the ONE part that
 * needs a browser to exercise. That part is covered by the demos' acceptance
 * tests, which drive a real browser anyway.
 */

export type Kv = {
  get<T>(key: string): Promise<T | undefined>;
  set(key: string, value: unknown): Promise<void>;
  delete(key: string): Promise<void>;
  /**
   * Read-modify-write one key as a single atomic step, resolving to the value
   * written. A separate `get` then `set` is not enough: two tabs (or two quick
   * calls in one tab) can both read the same value and the later write silently
   * discards the earlier one — duplicate ids, lost comments, lost votes.
   * `fn` must be synchronous and pure; it may be called with `undefined`.
   */
  update<T>(key: string, fn: (current: T | undefined) => T): Promise<T>;
};

/** For tests, and for a page that would rather not persist at all. */
export function createMemoryKv(seed: Record<string, unknown> = {}): Kv {
  const map = new Map<string, unknown>(Object.entries(seed));
  return {
    async get<T>(key: string): Promise<T | undefined> {
      return map.get(key) as T | undefined;
    },
    async set(key: string, value: unknown): Promise<void> {
      map.set(key, value);
    },
    async delete(key: string): Promise<void> {
      map.delete(key);
    },
    async update<T>(key: string, fn: (current: T | undefined) => T): Promise<T> {
      // No await between the read and the write, so nothing can interleave.
      const next = fn(map.get(key) as T | undefined);
      map.set(key, next);
      return next;
    },
  };
}

export const DEFAULT_DB_NAME = "fusen";
export const DEFAULT_STORE_NAME = "kv";

function promisify<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

/**
 * IndexedDB rather than localStorage.
 *
 * localStorage is synchronous — it blocks the page's main thread on every read
 * and write — capped at a few megabytes, and stores only strings, so every
 * access pays a `JSON.parse`. A comment carries an anchor and possibly a page
 * snapshot; a few hundred of them is not a hypothetical size. IndexedDB is
 * asynchronous, stores structured values, and has room. The only thing
 * localStorage would have bought is a shorter file than this one.
 */
export function createIndexedDbKv(
  dbName: string = DEFAULT_DB_NAME,
  storeName: string = DEFAULT_STORE_NAME,
): Kv {
  let open: Promise<IDBDatabase> | null = null;

  function db(): Promise<IDBDatabase> {
    if (open) return open;
    open = new Promise((resolve, reject) => {
      const request = indexedDB.open(dbName, 1);
      request.onupgradeneeded = () => {
        if (!request.result.objectStoreNames.contains(storeName)) {
          request.result.createObjectStore(storeName);
        }
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    return open;
  }

  async function tx<T>(
    mode: IDBTransactionMode,
    run: (store: IDBObjectStore) => IDBRequest<T>,
  ): Promise<T> {
    const database = await db();
    const transaction = database.transaction(storeName, mode);
    const result = await promisify(run(transaction.objectStore(storeName)));
    // Wait for the transaction itself, not just the request: a write whose
    // request succeeded can still be rolled back when the transaction aborts,
    // and returning early would report a save that did not happen.
    await new Promise<void>((resolve, reject) => {
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error);
      transaction.onabort = () => reject(transaction.error);
    });
    return result;
  }

  return {
    get<T>(key: string): Promise<T | undefined> {
      return tx("readonly", (store) => store.get(key) as IDBRequest<T | undefined>);
    },
    async set(key: string, value: unknown): Promise<void> {
      await tx("readwrite", (store) => store.put(value, key));
    },
    async delete(key: string): Promise<void> {
      await tx("readwrite", (store) => store.delete(key));
    },
    async update<T>(key: string, fn: (current: T | undefined) => T): Promise<T> {
      // The get and the put share ONE readwrite transaction, issued from the
      // get's success callback so the transaction never goes inactive. IndexedDB
      // runs readwrite transactions on the same store one at a time, across
      // every tab of the origin, which is what makes this atomic.
      const database = await db();
      const transaction = database.transaction(storeName, "readwrite");
      const store = transaction.objectStore(storeName);
      let next!: T;
      let failure: unknown;
      const done = new Promise<void>((resolve, reject) => {
        transaction.oncomplete = () => resolve();
        transaction.onerror = () => reject(transaction.error);
        transaction.onabort = () => reject(transaction.error);
      });
      const read = store.get(key) as IDBRequest<T | undefined>;
      read.onsuccess = () => {
        try {
          next = fn(read.result);
          store.put(next, key);
        } catch (error) {
          failure = error;
          transaction.abort();
        }
      };
      try {
        await done;
      } catch (error) {
        throw failure ?? error;
      }
      return next;
    },
  };
}
