export {
  ALLOWED_AUDIT_METADATA_KEYS,
  APPEND_ONLY_AUDIT_TABLE,
  INSPECTION_AUDIT_TRAIL_VERSION,
} from "./constants";

export type {
  InspectionAuditActorType,
  InspectionAuditEventRow,
  InspectionAuditEventType,
  RecordInspectionEventInput,
  RecordInspectionEventResult,
} from "./types";

export { hashInspectionContent, sanitizeAuditMetadata } from "./metadata";

export { buildEntriesContentHash, recordInspectionEvent } from "./record";

import type { SupabaseClient } from "@supabase/supabase-js";

import { enrichDevInspectorAuditMetadata } from "@/lib/devInspectorMode";

import { recordInspectionEvent } from "./record";
import type { RecordInspectionEventInput } from "./types";

/** Alias explicite — jamais bloquant pour l'appelant. */
export async function recordInspectionEventSafe(
  supabase: SupabaseClient,
  input: RecordInspectionEventInput,
) {
  return recordInspectionEvent(supabase, {
    ...input,
    metadata: enrichDevInspectorAuditMetadata(input.metadata),
  });
}