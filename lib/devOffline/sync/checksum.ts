import { createHash } from "node:crypto";

import type { AnyDevOfflineInspection } from "../types";

/** Deterministic JSON — object keys sorted recursively so checksums are stable. */
export function stableStringify(value: unknown): string {
  if (value === null || typeof value !== "object") {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map(stableStringify).join(",")}]`;
  }
  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([, v]) => v !== undefined)
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([k, v]) => `${JSON.stringify(k)}:${stableStringify(v)}`);
  return `{${entries.join(",")}}`;
}

/**
 * Checksum of the synchronizable content only — sync metadata is excluded so
 * that marking a record synced never changes its own checksum.
 */
export function computeInspectionChecksum(record: AnyDevOfflineInspection): string {
  const content = {
    id: record.id,
    user_id: record.user_id,
    inspector_id: record.inspector_id,
    inspector_name: record.inspector_name,
    inspector_company: record.inspector_company,
    created_at: record.created_at,
    payload: record.payload,
  };
  return createHash("sha256").update(stableStringify(content)).digest("hex");
}
