import { hashInspectionContent } from "@/lib/inspection_audit_trail/metadata";
import { MANUAL_REVISIONS_PAYLOAD_KEY } from "@/lib/reportLanguage";
import { parseReportPhotoSelectionIds } from "@/lib/reportPhotoSelectionPayload";
import type { ReportEntryInput } from "@/lib/reportNarrative";
import { REPORT_PROFESSIONAL_SNAPSHOT_KEY } from "@/lib/inspectorProfile";

/** Stable hash from entries + selection + snapshot keys — invalidates on manual revision. */
export function computeReportContentHash(
  payload: Record<string, unknown>,
  entries: ReportEntryInput[],
): string {
  const selectionIds = parseReportPhotoSelectionIds(payload.report_photo_selection_v1) ?? [];
  const revisions = payload[MANUAL_REVISIONS_PAYLOAD_KEY];

  const material = {
    entries: entries.map((e) => ({
      id: e.id ?? null,
      zone: e.zone ?? null,
      issue: e.issue ?? null,
      severity: e.severity ?? null,
      note_hash: e.note ? hashInspectionContent(e.note) : null,
    })),
    selection_ids: [...selectionIds].sort(),
    professional_snapshot: payload[REPORT_PROFESSIONAL_SNAPSHOT_KEY] ?? null,
    cover_v1: payload.cover_v1 ?? null,
    manual_revisions: revisions ?? null,
    report_language: payload.report_language ?? null,
  };

  return hashInspectionContent(material);
}
