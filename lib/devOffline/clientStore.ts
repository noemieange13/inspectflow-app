import type { AnyDevOfflineInspection } from "./types";

export const DEV_OFFLINE_INSPECTIONS_KEY = "inspectflow:dev_offline_inspections_v1";

export const OFFLINE_INSPECTION_CREATED_EVENT = "inspectflow:offline-inspection-created";

export function persistOfflineInspectionClientSide(record: AnyDevOfflineInspection): void {
  if (typeof window === "undefined") return;
  try {
    const raw = window.localStorage.getItem(DEV_OFFLINE_INSPECTIONS_KEY);
    const list: AnyDevOfflineInspection[] = raw ? (JSON.parse(raw) as AnyDevOfflineInspection[]) : [];
    const idx = list.findIndex((x) => x.id === record.id);
    if (idx >= 0) list[idx] = record;
    else list.unshift(record);
    window.localStorage.setItem(DEV_OFFLINE_INSPECTIONS_KEY, JSON.stringify(list.slice(0, 50)));
    window.dispatchEvent(new CustomEvent(OFFLINE_INSPECTION_CREATED_EVENT, { detail: { id: record.id } }));
  } catch {
    /* ignore quota */
  }
}

export function readOfflineInspectionsClientSide(): AnyDevOfflineInspection[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(DEV_OFFLINE_INSPECTIONS_KEY);
    return raw ? (JSON.parse(raw) as AnyDevOfflineInspection[]) : [];
  } catch {
    return [];
  }
}
