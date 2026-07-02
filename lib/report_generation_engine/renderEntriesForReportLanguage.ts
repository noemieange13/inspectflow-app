import type { AIObservationDraft, ObservationSeverityClass } from "@/lib/observation_ai_engine";
import { parseAIObservationSnapshot } from "@/lib/inspector_feedback_engine/snapshot";
import { systemFromIssue } from "@/lib/inspector_feedback_engine/system";
import {
  buildInspectorEditedNote,
  inferObservationSeverityClass,
  parseStructuredNoteFromEntryNote,
} from "@/lib/findingsReview";
import {
  buildStructuredReport,
  type JurisdictionProfile,
  type ReportEntryInput,
} from "@/lib/reportNarrative";
import {
  normalizeReportLocale,
  toWriterLanguage,
  toReportLocaleFromWriterLanguage,
  type ReportLocale,
} from "@/lib/reportLocale";
import { parseManualRevisionsV1 } from "@/lib/reportLanguage";
import {
  readInspectorReportStyleFromPayload,
  reportStyleFromProfile,
} from "@/lib/inspectorReportStyle";
import { translateManualRevision } from "@/lib/report_translation_engine/translateManualRevision";
import { translateReportContent } from "@/lib/report_translation_engine";
import {
  isMachineGeneratedEntryNote,
  writeProfessionalObservation,
  detectEntryNoteLanguage,
  type ReportWriterNormativeContext,
} from "@/lib/report_writer_engine";

function provinceFromJurisdiction(jurisdiction: JurisdictionProfile): string {
  return jurisdiction === "ca_qc" ? "QC" : "CA";
}

function severityClassFromEntry(entry: ReportEntryInput): ObservationSeverityClass {
  return inferObservationSeverityClass(entry);
}

function buildMinimalDraftFromEntry(entry: ReportEntryInput): AIObservationDraft {
  const parsed = entry.note ? parseStructuredNoteFromEntryNote(entry.note) : null;
  const observationText =
    parsed?.observation?.trim() ||
    entry.note?.trim() ||
    `${entry.zone} — ${entry.issue}`;
  const recommendation =
    parsed?.recommendation?.trim() ||
    "Suivi par un professionnel qualifié selon les bonnes pratiques.";

  return {
    draft_id: entry.id?.trim()?.slice(0, 16) ?? "render00000001",
    system: systemFromIssue(entry.issue),
    component: entry.zone.replace(/_/g, " "),
    title: observationText.slice(0, 80),
    observation_text: observationText,
    recommendation,
    severity: severityClassFromEntry(entry),
    confidence_score: 0.7,
    source_photo_ids: [],
    reasoning_summary: "render-from-entry",
    linked_zones: [entry.zone],
    normative_references: [],
    traceability: {
      ai_generated: true,
      model: "report-generation-engine",
      prompt_version: "native-render-v1",
      created_at: new Date().toISOString(),
    },
  };
}

function lookupDraftFromPayload(
  payload: Record<string, unknown>,
  entry: ReportEntryInput,
  snapshotItemDraftId?: string,
): AIObservationDraft | null {
  const draftsRaw = payload.ai_observation_drafts_v1 ?? payload.ai_observation_drafts;
  if (Array.isArray(draftsRaw)) {
    const obsId = entry.id?.trim();
    for (const row of draftsRaw) {
      if (!row || typeof row !== "object") continue;
      const d = row as AIObservationDraft;
      if (snapshotItemDraftId && d.draft_id === snapshotItemDraftId) return d;
      if (obsId && d.draft_id === obsId.slice(0, 16)) return d;
    }
  }
  return null;
}

function collectProtectedTerms(payload: Record<string, unknown>): string[] {
  const terms: string[] = [];
  const cover = payload.cover_v1;
  if (cover && typeof cover === "object") {
    const c = cover as Record<string, unknown>;
    if (typeof c.client_name === "string" && c.client_name.trim()) {
      terms.push(c.client_name.trim());
    }
    if (typeof c.address === "string" && c.address.trim()) {
      terms.push(c.address.trim());
    }
  }
  const snap = payload.report_professional_snapshot_v1;
  if (snap && typeof snap === "object") {
    const s = snap as Record<string, unknown>;
    for (const key of ["inspector", "company", "certification"] as const) {
      if (typeof s[key] === "string" && (s[key] as string).trim()) {
        terms.push((s[key] as string).trim());
      }
    }
  }
  return terms;
}

function glossaryTranslateText(
  text: string,
  sourceLocale: ReportLocale,
  targetLocale: ReportLocale,
  protectedTerms: string[],
): string {
  if (!text.trim() || sourceLocale === targetLocale) return text;
  const sourceLang = toWriterLanguage(sourceLocale);
  const targetLang = toWriterLanguage(targetLocale);
  const [translated] = translateReportContent(
    [{ note: text }],
    targetLang,
    { sourceLang, protectedTerms, skipWhenAlreadyTargetLang: false },
  );
  return typeof translated?.note === "string" ? translated.note : text;
}

function localizeDraftForLocale(
  draft: AIObservationDraft,
  sourceLocale: ReportLocale,
  targetLocale: ReportLocale,
  protectedTerms: string[],
): AIObservationDraft {
  if (sourceLocale === targetLocale) return draft;
  return {
    ...draft,
    title: glossaryTranslateText(draft.title, sourceLocale, targetLocale, protectedTerms),
    observation_text: glossaryTranslateText(
      draft.observation_text,
      sourceLocale,
      targetLocale,
      protectedTerms,
    ),
    recommendation: glossaryTranslateText(
      draft.recommendation,
      sourceLocale,
      targetLocale,
      protectedTerms,
    ),
    component: glossaryTranslateText(draft.component, sourceLocale, targetLocale, protectedTerms),
  };
}

function glossaryTranslateEntryNote(
  note: string,
  sourceLocale: ReportLocale,
  targetLocale: ReportLocale,
  protectedTerms: string[],
): string {
  return glossaryTranslateText(note, sourceLocale, targetLocale, protectedTerms);
}

function renderEntryNoteForLocale(
  entry: ReportEntryInput,
  payload: Record<string, unknown>,
  targetLocale: ReportLocale,
  jurisdiction: JurisdictionProfile,
  protectedTerms: string[],
): string {
  const writerLang = toWriterLanguage(targetLocale);
  const obsId = entry.id?.trim() ?? "";
  const manualRevisions = parseManualRevisionsV1(payload);
  const snapshot = parseAIObservationSnapshot(payload.ai_observation_snapshot_v1);
  const snapshotItem = snapshot?.items.find((i) => i.observation_id === obsId);

  // Priority 2 — révisions manuelles inspecteur
  if (!isMachineGeneratedEntryNote(entry.note)) {
    const revision = obsId ? manualRevisions[obsId] : undefined;
    if (revision) {
      const revLocale = normalizeReportLocale(revision.language);
      const text =
        revLocale === targetLocale
          ? revision
          : translateManualRevision(revision, targetLocale, protectedTerms);
      return buildInspectorEditedNote(
        text.observation,
        text.recommendation,
        writerLang,
      );
    }
    if (entry.note?.trim()) {
      const sourceLocale = toReportLocaleFromWriterLanguage(
        detectEntryNoteLanguage(entry.note),
      );
      return glossaryTranslateEntryNote(
        entry.note,
        sourceLocale,
        targetLocale,
        protectedTerms,
      );
    }
    return entry.note ?? "";
  }

  // Priority 1 — entrées machine : rédaction native via writer engine
  const inspectorStyle = reportStyleFromProfile(readInspectorReportStyleFromPayload(payload));
  const normative_context: ReportWriterNormativeContext = {
    province: provinceFromJurisdiction(jurisdiction),
    language: writerLang,
    inspector_style: inspectorStyle,
  };

  const draft =
    lookupDraftFromPayload(payload, entry, snapshotItem?.draft_id) ??
    buildMinimalDraftFromEntry(entry);

  const parsed = entry.note ? parseStructuredNoteFromEntryNote(entry.note) : null;
  const sourceText = parsed?.observation ?? entry.note ?? "";
  const sourceLocale = sourceText.trim()
    ? toReportLocaleFromWriterLanguage(detectEntryNoteLanguage(sourceText))
    : "fr-CA";

  const localizedDraft = localizeDraftForLocale(
    draft,
    sourceLocale,
    targetLocale,
    protectedTerms,
  );

  const written = writeProfessionalObservation({ draft: localizedDraft, normative_context });
  return written.formatted_note;
}

/**
 * Produit des entrées rendues pour HTML/PDF dans la langue cible — sans muter le stockage DB.
 */
export function renderEntriesForReportLanguage(
  entries: ReportEntryInput[],
  payload: Record<string, unknown>,
  targetLocale: ReportLocale,
  jurisdiction: JurisdictionProfile,
): ReportEntryInput[] {
  const protectedTerms = collectProtectedTerms(payload);
  return entries.map((entry) => ({
    ...entry,
    note: renderEntryNoteForLocale(entry, payload, targetLocale, jurisdiction, protectedTerms),
  }));
}

/** Sections client-facing pour HTML — dérivées des entrées rendues. */
export function renderSectionsForReportLanguage(
  entries: ReportEntryInput[],
  payload: Record<string, unknown>,
  targetLocale: ReportLocale,
  jurisdiction: JurisdictionProfile,
) {
  const rendered = renderEntriesForReportLanguage(entries, payload, targetLocale, jurisdiction);
  const writerLang = toWriterLanguage(targetLocale);
  return buildStructuredReport(rendered, writerLang, jurisdiction);
}
