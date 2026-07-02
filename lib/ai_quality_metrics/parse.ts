import type { InspectionAiFeedbackRow } from "./types";

function parseJsonSide(raw: unknown): InspectionAiFeedbackRow["original_ai"] {
  if (!raw || typeof raw !== "object") return null;
  const rec = raw as Record<string, unknown>;
  const severity = typeof rec.severity === "string" ? rec.severity : "";
  const system = typeof rec.system === "string" ? rec.system : "general";
  const text_hash = typeof rec.text_hash === "string" ? rec.text_hash : "";
  if (!severity || !text_hash) return null;
  return { severity, system, text_hash };
}

/** Normalise des lignes Supabase / vue SQL vers le contrat moteur. */
export function parseInspectionAiFeedbackRows(raw: unknown): InspectionAiFeedbackRow[] {
  if (!Array.isArray(raw)) return [];
  const out: InspectionAiFeedbackRow[] = [];

  for (const row of raw) {
    if (!row || typeof row !== "object") continue;
    const rec = row as Record<string, unknown>;
    const report_id = typeof rec.report_id === "string" ? rec.report_id.trim() : "";
    const observation_id =
      typeof rec.observation_id === "string" ? rec.observation_id.trim() : "";
    const change_type = rec.change_type;
    if (
      !report_id ||
      !observation_id ||
      (change_type !== "accepted" &&
        change_type !== "edited_text" &&
        change_type !== "changed_severity" &&
        change_type !== "deleted" &&
        change_type !== "added_manual")
    ) {
      continue;
    }

    out.push({
      report_id,
      inspection_id:
        typeof rec.inspection_id === "string" ? rec.inspection_id.trim() : null,
      observation_id,
      change_type,
      original_ai: parseJsonSide(rec.original_ai),
      inspector_final: parseJsonSide(rec.inspector_final),
      feedback_category:
        rec.feedback_category === "ai_too_aggressive" ||
        rec.feedback_category === "ai_too_minor" ||
        rec.feedback_category === "wording_change" ||
        rec.feedback_category === "false_positive" ||
        rec.feedback_category === "missed_issue"
          ? rec.feedback_category
          : null,
      created_at: typeof rec.created_at === "string" ? rec.created_at : undefined,
    });
  }

  return out;
}
