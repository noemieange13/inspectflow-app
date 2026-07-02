import type { SyncEvent, SyncEventType } from "./syncTypes";

export type SyncEventListener = (event: SyncEvent) => void;

const listeners = new Set<SyncEventListener>();

export function onSyncEvent(listener: SyncEventListener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function emitSyncEvent(
  type: SyncEventType,
  fields: Omit<SyncEvent, "type" | "at"> = {},
): SyncEvent {
  const event: SyncEvent = { type, at: new Date().toISOString(), ...fields };
  for (const listener of listeners) {
    try {
      listener(event);
    } catch {
      /* listeners must never break the engine */
    }
  }
  return event;
}

export function resetSyncEventListeners(): void {
  listeners.clear();
}
