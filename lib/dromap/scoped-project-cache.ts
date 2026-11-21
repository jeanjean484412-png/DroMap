type CacheValue = { ownerScope?: string; [key: string]: unknown };

export function createScopedProjectCache(
  open: () => Promise<IDBDatabase>,
  storeName: string,
  currentScope: () => string,
  legacyOwners: Map<string, string>,
) {
  const pendingWrites = new Map<string, Promise<boolean>>();
  async function read(projectId: string): Promise<unknown> {
    const scope = currentScope();
    const db = await open();
    try {
      const value = await new Promise<unknown>((resolve, reject) => {
        const tx = db.transaction(storeName, "readonly");
        const store = tx.objectStore(storeName);
        const request = store.get([scope, projectId]);
        request.onerror = () => reject(request.error);
        request.onsuccess = () => {
          if (request.result !== undefined || legacyOwners.get(projectId) !== scope) {
            resolve(request.result); return;
          }
          const legacy = store.get(projectId);
          legacy.onsuccess = () => resolve(legacy.result);
          legacy.onerror = () => reject(legacy.error);
        };
      });
      if (scope !== currentScope() || !value || typeof value !== "object") return null;
      const record = value as CacheValue;
      if (record.ownerScope !== scope && !(record.ownerScope === undefined && legacyOwners.get(projectId) === scope)) return null;
      return record;
    } finally { db.close(); }
  }

  async function write(projectId: string, value: CacheValue) {
    const scope = currentScope();
    const key = JSON.stringify([scope, projectId]);
    const previous = pendingWrites.get(key);
    const writeNext = async () => {
      if (scope !== currentScope()) return false;
      const db = await open();
      try {
        if (scope !== currentScope()) return false;
        await new Promise<void>((resolve, reject) => {
          const tx = db.transaction(storeName, "readwrite");
          tx.oncomplete = () => resolve();
          tx.onerror = () => reject(tx.error);
          tx.onabort = () => reject(tx.error);
          const store = tx.objectStore(storeName);
          store.put({ ...value, ownerScope: scope }, [scope, projectId]);
          if (legacyOwners.get(projectId) === scope) store.delete(projectId);
        });
        return true;
      } finally { db.close(); }
    };
    const pending = previous ? previous.then(writeNext, writeNext) : writeNext();
    pendingWrites.set(key, pending);
    try {
      return await pending;
    } finally {
      if (pendingWrites.get(key) === pending) pendingWrites.delete(key);
    }
  }

  async function remove(projectId: string) {
    const scope = currentScope();
    const db = await open();
    try {
      await new Promise<void>((resolve, reject) => {
        const tx = db.transaction(storeName, "readwrite");
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
        const store = tx.objectStore(storeName);
        store.delete([scope, projectId]);
        if (legacyOwners.get(projectId) === scope) store.delete(projectId);
      });
    } finally { db.close(); }
  }

  async function listOwnerProjects(scope: string, filter: (project: unknown) => boolean): Promise<unknown[]> {
    const db = await open();
    try {
      return await new Promise((resolve, reject) => {
        const tx = db.transaction(storeName, "readonly");
        const projects: unknown[] = [];
        const cursor = tx.objectStore(storeName).openCursor(IDBKeyRange.bound([scope], [scope, []]));
        tx.oncomplete = () => resolve(projects);
        tx.onerror = () => reject(tx.error);
        tx.onabort = () => reject(tx.error);
        cursor.onsuccess = () => {
          const entry = cursor.result;
          if (!entry) return;
          if (entry.value?.ownerScope === scope && filter(entry.value.project)) projects.push(entry.value.project);
          entry.continue();
        };
      });
    } finally { db.close(); }
  }

  async function clearOwner(scope: string) {
    const db = await open();
    try {
      await new Promise<void>((resolve, reject) => {
        const tx = db.transaction(storeName, "readwrite");
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
        const cursor = tx.objectStore(storeName).openCursor();
        cursor.onsuccess = () => {
          const entry = cursor.result;
          if (!entry) return;
          if (entry.value?.ownerScope === scope ||
            (typeof entry.key === "string" && legacyOwners.get(entry.key) === scope)) entry.delete();
          entry.continue();
        };
      });
    } finally { db.close(); }
  }
  return { read, write, remove, listOwnerProjects, clearOwner };
}
