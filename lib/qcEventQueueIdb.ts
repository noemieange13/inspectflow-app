/**
 * File d’attente persistante IndexedDB pour événements QC (remplace sessionStorage à terme).
 */

const DB_NAME = "inspectflow_qc";
const DB_VERSION = 1;
const STORE = "qc_event_queue";

export type QcQueuedEvent = {
  id: string;
  payload: string;
  created_at: number;
  retry_count: number;
};

function openDb(): Promise<IDBDatabase> {
  if (typeof indexedDB === "undefined") {
    return Promise.reject(new Error("indexedDB unavailable"));
  }
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onerror = () => reject(req.error);
    req.onsuccess = () => resolve(req.result);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE, { keyPath: "id" });
      }
    };
  });
}

export async function idbEnqueue(payloadJson: string): Promise<void> {
  const db = await openDb();
  const row: QcQueuedEvent = {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`,
    payload: payloadJson,
    created_at: Date.now(),
    retry_count: 0,
  };
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.objectStore(STORE).put(row);
  });
  db.close();
}

export async function idbDequeueAll(): Promise<QcQueuedEvent[]> {
  const db = await openDb();
  const rows = await new Promise<QcQueuedEvent[]>((resolve, reject) => {
    const tx = db.transaction(STORE, "readonly");
    const r = tx.objectStore(STORE).getAll();
    r.onsuccess = () => resolve(((r.result as QcQueuedEvent[]) ?? []).slice());
    r.onerror = () => reject(r.error);
  });
  db.close();
  return rows.sort((a, b) => a.created_at - b.created_at);
}

export async function idbRemove(id: string): Promise<void> {
  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.objectStore(STORE).delete(id);
  });
  db.close();
}

export async function idbIncrementRetry(id: string): Promise<void> {
  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    tx.onerror = () => reject(tx.error);
    const store = tx.objectStore(STORE);
    const g = store.get(id);
    g.onsuccess = () => {
      const v = g.result as QcQueuedEvent | undefined;
      if (!v) {
        resolve();
        return;
      }
      v.retry_count += 1;
      const p = store.put(v);
      p.onsuccess = () => resolve();
      p.onerror = () => reject(p.error);
    };
    g.onerror = () => reject(g.error);
  });
  db.close();
}
