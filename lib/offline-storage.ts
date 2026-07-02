/**
 * Offline storage using IndexedDB (via the `idb` library).
 *
 * Stores photo / voice-note blobs and partial form data so the inspector
 * never loses work when the network drops.  The sync layer (in the form
 * component) reads this back when connectivity is restored.
 *
 * DB:  inspectflow-offline  (v1)
 * ├─ sessions   { id, timestamp, formData, synced }
 * ├─ blobs      { id="<sessionId>:<name>", sessionId, name, kind, blob }
 * └─ (indexes)  blobs.sessionId
 */

import { openDB, type IDBPDatabase } from "idb";

// ── Types ─────────────────────────────────────────────────────────────────────

export interface OfflineSession {
  id: string;
  timestamp: number;
  formData: Record<string, unknown>;
  synced: boolean;
}

export interface OfflineBlob {
  id: string;         // "<sessionId>:<name>"
  sessionId: string;
  name: string;
  kind: "photo" | "voiceNote";
  blob: Blob;
}

export interface OfflineData {
  session: OfflineSession;
  photos: Array<{ name: string; blob: Blob }>;
  voiceNotes: Array<{ name: string; blob: Blob }>;
}

// ── DB singleton (lazy, client-only) ─────────────────────────────────────────

let _db: IDBPDatabase | null = null;

async function getDb(): Promise<IDBPDatabase | null> {
  if (typeof window === "undefined" || !("indexedDB" in window)) return null;

  if (_db) return _db;

  try {
    _db = await openDB("inspectflow-offline", 1, {
      upgrade(db) {
        if (!db.objectStoreNames.contains("sessions")) {
          db.createObjectStore("sessions", { keyPath: "id" });
        }
        if (!db.objectStoreNames.contains("blobs")) {
          const blobStore = db.createObjectStore("blobs", { keyPath: "id" });
          blobStore.createIndex("sessionId", "sessionId");
        }
      },
    });
    return _db;
  } catch (err) {
    console.warn("[offline-storage] Failed to open IndexedDB:", err);
    return null;
  }
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Save (or overwrite) an inspection session including photo and voice blobs.
 * Pass `photos: []` / `voiceNotes: []` to leave blobs unchanged.
 */
export async function saveOffline(
  inspectionId: string,
  data: {
    photos?: File[];
    voiceNotes?: File[];
    formData?: Record<string, unknown>;
  }
): Promise<void> {
  const db = await getDb();
  if (!db) return;

  const tx = db.transaction(["sessions", "blobs"], "readwrite");

  // Upsert session record
  const existing = (await tx.objectStore("sessions").get(inspectionId)) as
    | OfflineSession
    | undefined;

  const session: OfflineSession = {
    id: inspectionId,
    timestamp: existing?.timestamp ?? Date.now(),
    formData: data.formData ?? existing?.formData ?? {},
    synced: false,
  };
  await tx.objectStore("sessions").put(session);

  // Write photo blobs
  if (data.photos && data.photos.length > 0) {
    for (const file of data.photos) {
      const record: OfflineBlob = {
        id: `${inspectionId}:photo:${file.name}`,
        sessionId: inspectionId,
        name: file.name,
        kind: "photo",
        blob: file,
      };
      await tx.objectStore("blobs").put(record);
    }
  }

  // Write voice-note blobs
  if (data.voiceNotes && data.voiceNotes.length > 0) {
    for (const file of data.voiceNotes) {
      const record: OfflineBlob = {
        id: `${inspectionId}:voice:${file.name}`,
        sessionId: inspectionId,
        name: file.name,
        kind: "voiceNote",
        blob: file,
      };
      await tx.objectStore("blobs").put(record);
    }
  }

  await tx.done;
}

/**
 * Load a session with all its blobs.
 * Returns `undefined` if the session doesn't exist.
 */
export async function loadOffline(
  inspectionId: string
): Promise<OfflineData | undefined> {
  const db = await getDb();
  if (!db) return undefined;

  const session = (await db.get("sessions", inspectionId)) as
    | OfflineSession
    | undefined;
  if (!session) return undefined;

  const allBlobs = (await db.getAllFromIndex(
    "blobs",
    "sessionId",
    inspectionId
  )) as OfflineBlob[];

  return {
    session,
    photos: allBlobs
      .filter((b) => b.kind === "photo")
      .map((b) => ({ name: b.name, blob: b.blob })),
    voiceNotes: allBlobs
      .filter((b) => b.kind === "voiceNote")
      .map((b) => ({ name: b.name, blob: b.blob })),
  };
}

/**
 * Mark a session as synced (blobs can be cleaned up later).
 */
export async function markSynced(inspectionId: string): Promise<void> {
  const db = await getDb();
  if (!db) return;

  const session = (await db.get("sessions", inspectionId)) as
    | OfflineSession
    | undefined;
  if (!session) return;

  await db.put("sessions", { ...session, synced: true });
}

/**
 * Delete a session and all its associated blobs.
 */
export async function clearOffline(inspectionId: string): Promise<void> {
  const db = await getDb();
  if (!db) return;

  const tx = db.transaction(["sessions", "blobs"], "readwrite");

  await tx.objectStore("sessions").delete(inspectionId);

  const blobs = (await tx
    .objectStore("blobs")
    .index("sessionId")
    .getAll(inspectionId)) as OfflineBlob[];

  for (const blob of blobs) {
    await tx.objectStore("blobs").delete(blob.id);
  }

  await tx.done;
}

/**
 * Returns the number of offline sessions that haven't been synced yet.
 * Useful for displaying a pending-sync badge.
 */
export async function getPendingSyncCount(): Promise<number> {
  const db = await getDb();
  if (!db) return 0;

  const sessions = (await db.getAll("sessions")) as OfflineSession[];
  return sessions.filter((s) => !s.synced).length;
}
