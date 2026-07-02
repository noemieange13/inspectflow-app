import type { IssueCode, ReportEntryInput, Severity, ZoneCode } from "@/lib/reportNarrative";
import {
  buildKnowledgeContextFromDraft,
  evaluateInspectionKnowledge,
} from "@/lib/inspection_knowledge_engine";
import {
  mergeProfessionalNoteWithExisting,
  writeProfessionalObservation,
  type ReportWriterNormativeContext,
} from "@/lib/report_writer_engine";

import type { InspectionReasoningResult } from "@/lib/inspection_reasoning_engine";

import type { AIObservationDraft, ObservationSeverityClass } from "./types";

function defaultIssueForSystem(system: string): IssueCode {
  switch (system) {
    case "toiture":
      return "roof_wear";
    case "electricite":
      return "electrical_risk";
    case "plomberie":
      return "plumbing_issue";
    case "ventilation":
    case "chauffage":
      return "ventilation_issue";
    case "isolation":
      return "insulation_deficiency";
    case "structure":
      return "structure_movement";
    default:
      return "other";
  }
}

function severityToReportSeverity(severity: ObservationSeverityClass): Severity {
  switch (severity) {
    case "safety":
    case "major":
      return "high";
    case "attention":
      return "medium";
    case "maintenance":
      return "low";
    default:
      return "medium";
  }
}

function pickZone(draft: AIObservationDraft): ZoneCode {
  return draft.linked_zones[0] ?? "autre";
}

function severityWithReasoningBump(
  severity: Severity,
  draftId: string,
  reasoning?: InspectionReasoningResult,
): Severity {
  if (!reasoning) return severity;
  const inBoostedPattern = reasoning.patterns.some(
    (p) =>
      p.related_observation_ids.includes(draftId) && p.severity_adjustment === "increase",
  );
  if (!inBoostedPattern) return severity;
  if (severity === "low") return "medium";
  if (severity === "medium") return "high";
  return severity;
}

export type AdaptDraftToEntryOptions = {
  normative_context?: ReportWriterNormativeContext;
  existing_note?: string;
};

/** Adaptateur Zero Draft — rédaction via `report_writer_engine` (3B). */
export function aiObservationDraftToReportEntry(
  draft: AIObservationDraft,
  language: "fr" | "en",
  opts?: AdaptDraftToEntryOptions,
): ReportEntryInput {
  const normative_context: ReportWriterNormativeContext = opts?.normative_context ?? {
    province: "QC",
    language,
    norme: draft.normative_references[0],
  };

  const knowledgeContext = buildKnowledgeContextFromDraft(draft, normative_context);
  const knowledge = evaluateInspectionKnowledge({
    context: knowledgeContext,
    draft_reference_hints: draft.normative_references,
    draft_confidence: draft.confidence_score,
  });

  const written = writeProfessionalObservation({ draft, normative_context, knowledge });
  const note = mergeProfessionalNoteWithExisting(opts?.existing_note, written.formatted_note);

  return {
    zone: pickZone(draft),
    issue: defaultIssueForSystem(draft.system),
    severity: severityToReportSeverity(draft.severity),
    note,
  };
}

export function aiObservationDraftsToReportEntries(
  drafts: AIObservationDraft[],
  language: "fr" | "en",
  opts?: {
    normative_context?: ReportWriterNormativeContext;
    existing_notes_by_draft_id?: Record<string, string | undefined>;
    reasoning_result?: InspectionReasoningResult;
  },
): ReportEntryInput[] {
  const normative_context: ReportWriterNormativeContext = opts?.normative_context ?? {
    province: "QC",
    language,
  };

  return drafts.map((draft) => {
    const entry = aiObservationDraftToReportEntry(draft, language, {
      normative_context: {
        ...normative_context,
        norme: normative_context.norme ?? draft.normative_references[0],
      },
      existing_note: opts?.existing_notes_by_draft_id?.[draft.draft_id],
    });
    return {
      ...entry,
      severity: severityWithReasoningBump(
        entry.severity,
        draft.draft_id,
        opts?.reasoning_result,
      ),
    };
  });
}
