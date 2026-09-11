/** Prevent a delayed database open from restoring an older account snapshot. */
export function createLatestIndexedWriter(open: () => Promise<IDBDatabase>, storeName: string, key: IDBValidKey) {
  let generation = 0;
  return async (value: unknown) => {
    const requestedGeneration = ++generation;
    const database = await open();
    try {
      if (requestedGeneration !== generation) return false;
      await new Promise<void>((resolve, reject) => {
        const transaction = database.transaction(storeName, "readwrite");
        transaction.oncomplete = () => resolve();
        transaction.onerror = () => reject(transaction.error);
        transaction.onabort = () => reject(transaction.error ?? new Error("Écriture annulée."));
        transaction.objectStore(storeName).put(value, key);
      });
      return true;
    } finally { database.close(); }
  };
}
