/**
 * Journal minimal dans `reports.payload.audit_trail_v1` (append-only tronqué).
 * Complète le ledger SQL (`report_events`) pour traçabilité « champ » côté document.
 */

export type AuditTrailEntryV1 = {
  schema_version: 1;
  t: string;
  field_path: string;
  /** Aperçu court (pas de secrets volumineux). */
  old_preview: string;
  new_preview: string;
  source?: "cover_save" | "report_content" | "client";
};

const MAX_ENTRIES = 150;
const MAX_PREVIEW = 480;

export function truncatePreview(s: string): string {
  const t = s.replace(/\s+/g, " ").trim();
  return t.length <= MAX_PREVIEW ? t : `${t.slice(0, MAX_PREVIEW)}…`;
}

export function buildAuditTrailEntry(
  partial: Omit<AuditTrailEntryV1, "schema_version" | "t" | "old_preview" | "new_preview"> & {
    old_preview: string;
    new_preview: string;
  },
): AuditTrailEntryV1 {
  return {
    schema_version: 1,
    t: new Date().toISOString(),
    field_path: partial.field_path,
    old_preview: truncatePreview(partial.old_preview),
    new_preview: truncatePreview(partial.new_preview),
    source: partial.source,
  };
}

export function appendAuditTrail(
  payload: Record<string, unknown>,
  partial: Omit<AuditTrailEntryV1, "schema_version" | "t" | "old_preview" | "new_preview"> & {
    old_preview: string;
    new_preview: string;
  },
): Record<string, unknown> {
  const prev = Array.isArray(payload.audit_trail_v1)
    ? (payload.audit_trail_v1 as unknown[])
    : [];
  const entry = buildAuditTrailEntry(partial);
  const next = [...prev, entry].slice(-MAX_ENTRIES);
  return { ...payload, audit_trail_v1: next };
}
