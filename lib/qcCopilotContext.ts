/**
 * Contexte léger pour stats V3 + ranking Copilot (aligné avec qc_context_hash côté SQL).
 */

import type { InspectionCoverPayloadV1 } from "@/lib/inspectionCoverPayload";
import type { QcAiSuggestion } from "@/lib/qcAiSuggestions";

export type QcCopilotContext = {
  system?: string;
  property_type?: string;
  severity?: string;
};

/** Clé stable côté client pour associer une ligne stats à une suggestion (sans MD5). */
export function qcStatsLookupKey(statsKey: string, ctx: QcCopilotContext): string {
  return `${statsKey}::${ctx.system ?? ""}|${ctx.property_type ?? ""}|${ctx.severity ?? ""}`;
}

export function buildQcReportContext(
  cover: InspectionCoverPayloadV1 | null | undefined,
): QcCopilotContext {
  if (!cover) return {};
  const prop =
    cover.propriete?.type_propriete?.trim() ||
    cover.description_sommaire?.type_maison?.trim() ||
    "";
  return {
    property_type: prop || undefined,
  };
}

export function buildSuggestionQcContext(
  suggestion: QcAiSuggestion,
  reportPayload: Record<string, unknown> | null | undefined,
  cover: InspectionCoverPayloadV1 | null | undefined,
): QcCopilotContext {
  const base = buildQcReportContext(cover ?? null);
  const sections = Array.isArray(reportPayload?.sections) ? reportPayload!.sections : [];
  const entries = Array.isArray(reportPayload?.entries) ? reportPayload!.entries : [];
  let severity: string | undefined;
  if (suggestion.sectionIndex != null) {
    const sec = sections[suggestion.sectionIndex] as { severity?: string } | undefined;
    const ent = entries[suggestion.sectionIndex] as { severity?: string } | undefined;
    const sv = sec?.severity ?? ent?.severity;
    severity = typeof sv === "string" ? sv.trim() : undefined;
  }
  return {
    ...base,
    system: suggestion.system?.trim() || undefined,
    severity,
  };
}
