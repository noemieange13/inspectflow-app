import {
  buildStructuredReport,
  normalizeJurisdictionProfile,
  normalizeReportLanguage,
  parseStructuredEntriesFromPayload,
  type JurisdictionProfile,
  type ReportEntryInput,
  type ReportLanguage,
  ZONES,
} from "@/lib/reportNarrative";
import {
  resolvePayloadReportLanguage,
  resolvePayloadReportLocale,
  REPORT_LANGUAGE_PAYLOAD_KEY,
  MANUAL_REVISIONS_PAYLOAD_KEY,
  parseManualRevisionsV1,
  type ManualRevisionsV1,
} from "@/lib/reportLanguage";
import { normalizeReportLocale, toWriterLanguage, type ReportLocale } from "@/lib/reportLocale";
import { ensureReportEntryIds } from "@/lib/observationIds";
import type { ObservationSeverityClass } from "@/lib/observation_ai_engine/types";
import { hashObservationText } from "@/lib/inspector_feedback_engine/hash";
import { parseAIObservationSnapshot } from "@/lib/inspector_feedback_engine/snapshot";
import { isMachineGeneratedEntryNote } from "@/lib/report_writer_engine/protectInspector";

export type FindingReviewStatus = "pending" | "accepted" | "modified" | "ignored";

export type FindingDisplay = {
  id: string;
  entry: ReportEntryInput;
  title: string;
  observation: string;
  consequence: string;
  recommendation: string;
  zoneLabel: string;
  severityLabel: string;
  photoUrl: string | null;
  linkedPhotoCount: number;
  needsReview: boolean;
};

export type FindingReviewStats = {
  total: number;
  ready: number;
  toVerify: number;
  reviewed: number;
};

function zoneLabel(zone: ReportEntryInput["zone"], language: ReportLanguage): string {
  const match = ZONES.find((z) => z.value === zone);
  return match?.label ?? zone;
}

/** Infère la classe de gravité IA à partir de l'entry rapport (sans exposer la valeur technique). */
export function inferObservationSeverityClass(
  entry: ReportEntryInput,
): ObservationSeverityClass {
  if (entry.severity === "high") {
    if (entry.issue === "fire_safety" || entry.issue === "electrical_risk") {
      return "safety";
    }
    return "major";
  }
  if (entry.severity === "low") return "maintenance";
  return "attention";
}

const HUMAN_SEVERITY_LABELS: Record<ReportLanguage, Record<ObservationSeverityClass, string>> = {
  fr: {
    maintenance: "À surveiller",
    attention: "À corriger",
    major: "Important",
    safety: "Sécurité",
  },
  en: {
    maintenance: "Monitor",
    attention: "To correct",
    major: "Important",
    safety: "Safety",
  },
};

export function humanSeverityLabel(
  entry: ReportEntryInput,
  language: ReportLanguage = "fr",
): string {
  const cls = inferObservationSeverityClass(entry);
  return HUMAN_SEVERITY_LABELS[language][cls];
}

export function buildPhotoCountByObservationId(
  photos: ReadonlyArray<{ observation_id?: string | null }>,
): Map<string, number> {
  const counts = new Map<string, number>();
  for (const ph of photos) {
    const obs = ph.observation_id?.trim();
    if (!obs) continue;
    counts.set(obs, (counts.get(obs) ?? 0) + 1);
  }
  return counts;
}

export function buildPrimaryPhotoByObservationId(
  photos: ReadonlyArray<{ observation_id?: string | null; url?: string | null }>,
): Map<string, string> {
  const map = new Map<string, string>();
  for (const ph of photos) {
    const obs = ph.observation_id?.trim();
    if (!obs || !ph.url || map.has(obs)) continue;
    map.set(obs, ph.url);
  }
  return map;
}

function stripMachineComments(note: string): string {
  return note.replace(/<!--[\s\S]*?-->/g, "").trim();
}

function parseStructuredNote(note: string): {
  observation: string;
  consequence: string;
  recommendation: string;
} | null {
  const cleaned = stripMachineComments(note);
  const obsMatch = cleaned.match(
    /Observation\s*\n([\s\S]*?)(?=\n\n(?:Conséquence possible|Possible consequence|Recommandation|Recommendation|Limitation)\s*\n|$)/i,
  );
  const impactMatch = cleaned.match(
    /(?:Conséquence possible|Possible consequence)\s*\n([\s\S]*?)(?=\n\n(?:Recommandation|Recommendation|Limitation)\s*\n|$)/i,
  );
  const recoMatch = cleaned.match(
    /(?:Recommandation|Recommendation)\s*\n([\s\S]*?)(?=\n\n(?:Limitation)\s*\n|$)/i,
  );
  if (!obsMatch && !recoMatch) return null;
  return {
    observation: (obsMatch?.[1] ?? cleaned).trim(),
    consequence: (impactMatch?.[1] ?? "").trim(),
    recommendation: (recoMatch?.[1] ?? "").trim(),
  };
}

/** Export pour moteur de génération native (8I). */
export function parseStructuredNoteFromEntryNote(note: string): {
  observation: string;
  consequence: string;
  recommendation: string;
} | null {
  return parseStructuredNote(note);
}

export function displayFindingFromEntry(
  entry: ReportEntryInput,
  language: ReportLanguage,
  jurisdiction: JurisdictionProfile,
  photoUrl: string | null,
  linkedPhotoCount: number,
  reviewedIds: ReadonlySet<string>,
): FindingDisplay {
  const id = entry.id?.trim() ?? "";
  const generated = buildStructuredReport([entry], language, jurisdiction);
  const section = generated.sections[0];
  const parsed = entry.note ? parseStructuredNote(entry.note) : null;

  const needsReview =
    Boolean(id) &&
    isMachineGeneratedEntryNote(entry.note) &&
    !reviewedIds.has(id);

  return {
    id: id || `entry-${entry.zone}-${entry.issue}`,
    entry,
    title: (section?.title as string) ?? zoneLabel(entry.zone, language),
    observation: parsed?.observation ?? (section?.observation as string) ?? "",
    consequence: parsed?.consequence ?? (section?.analysis as string) ?? "",
    recommendation: parsed?.recommendation ?? (section?.recommendation as string) ?? "",
    zoneLabel: zoneLabel(entry.zone, language),
    severityLabel: humanSeverityLabel(entry, language),
    photoUrl,
    linkedPhotoCount,
    needsReview,
  };
}

export function buildFindingDisplays(
  entries: ReportEntryInput[],
  language: ReportLanguage,
  jurisdiction: JurisdictionProfile,
  photoByObservationId: ReadonlyMap<string, string>,
  photoCountByObservationId: ReadonlyMap<string, number>,
  reviewedIds: ReadonlySet<string>,
): FindingDisplay[] {
  return entries.map((entry) => {
    const obsId = entry.id?.trim() ?? "";
    return displayFindingFromEntry(
      entry,
      language,
      jurisdiction,
      obsId ? photoByObservationId.get(obsId) ?? null : null,
      obsId ? photoCountByObservationId.get(obsId) ?? 0 : 0,
      reviewedIds,
    );
  });
}

export function computeFindingReviewStats(
  displays: FindingDisplay[],
  reviewedIds: ReadonlySet<string>,
): FindingReviewStats {
  const total = displays.length;
  let toVerify = 0;
  let ready = 0;
  for (const d of displays) {
    if (d.needsReview) toVerify += 1;
    else ready += 1;
  }
  return {
    total,
    ready,
    toVerify,
    reviewed: reviewedIds.size,
  };
}

/** Accepter — conserve l'entry telle quelle. */
export function acceptFindingEntry(entry: ReportEntryInput): ReportEntryInput {
  return { ...entry };
}

/** Ignorer — retire du rapport (photos / snapshot IA conservés côté serveur). */
export function ignoreFindingEntry(
  entries: ReportEntryInput[],
  observationId: string,
): ReportEntryInput[] {
  return entries.filter((e) => e.id?.trim() !== observationId.trim());
}

/** Modifier — texte inspecteur sans marqueurs machine (feedback 4A : edited_text). */
export function buildInspectorEditedNote(
  observation: string,
  recommendation: string,
  language: ReportLanguage = "fr",
): string {
  const labels =
    language === "en"
      ? { observation: "Observation", recommendation: "Recommendation" }
      : { observation: "Observation", recommendation: "Recommandation" };
  return `${labels.observation}\n${observation.trim()}\n\n${labels.recommendation}\n${recommendation.trim()}`;
}

export function modifyFindingEntry(
  entries: ReportEntryInput[],
  observationId: string,
  fields: { observation: string; recommendation: string; title?: string },
  language: ReportLanguage = "fr",
): ReportEntryInput[] {
  return entries.map((entry) => {
    if (entry.id?.trim() !== observationId.trim()) return entry;
    return {
      ...entry,
      note: buildInspectorEditedNote(fields.observation, fields.recommendation, language),
    };
  });
}

export function upsertManualRevisionV1(
  existing: ManualRevisionsV1,
  observationId: string,
  fields: { observation: string; recommendation: string },
  reportLocale: ReportLocale,
): ManualRevisionsV1 {
  return {
    ...existing,
    [observationId.trim()]: {
      language: reportLocale,
      observation: fields.observation.trim(),
      recommendation: fields.recommendation.trim(),
      revised_at: new Date().toISOString(),
    },
  };
}

export function buildManualRevisionsForModifiedEntries(
  entries: ReportEntryInput[],
  priorPayload: Record<string, unknown>,
  reportLocale: ReportLocale,
): ManualRevisionsV1 {
  const existing = parseManualRevisionsV1(priorPayload[MANUAL_REVISIONS_PAYLOAD_KEY]);
  let next = { ...existing };
  for (const entry of entries) {
    const obsId = entry.id?.trim();
    if (!obsId || isMachineGeneratedEntryNote(entry.note)) continue;
    const parsed = entry.note ? parseStructuredNote(entry.note) : null;
    if (!parsed) continue;
    next = upsertManualRevisionV1(next, obsId, parsed, reportLocale);
  }
  return next;
}

export function parseEntriesFromPayload(payload: unknown): ReportEntryInput[] {
  if (!payload || typeof payload !== "object") return [];
  const raw = (payload as Record<string, unknown>).entries;
  return ensureReportEntryIds(parseStructuredEntriesFromPayload(raw));
}

export function resolveReportLanguage(payload: unknown): ReportLanguage {
  if (!payload || typeof payload !== "object") return "fr";
  return resolvePayloadReportLanguage(payload as Record<string, unknown>);
}

export function resolveReportJurisdiction(payload: unknown): JurisdictionProfile {
  if (!payload || typeof payload !== "object") return "ca_general";
  const p = payload as Record<string, unknown>;
  return normalizeJurisdictionProfile(
    typeof p.jurisdiction === "string" ? p.jurisdiction : undefined,
  );
}

/** Corps minimal pour `/api/report-content` — propage snapshot IA et liens existants. */
export function buildFindingsReviewSaveBody(
  reportId: string,
  accessToken: string,
  payload: Record<string, unknown>,
  entries: ReportEntryInput[],
): Record<string, unknown> {
  const reportLocale = resolvePayloadReportLocale(payload);
  const language = toWriterLanguage(reportLocale);
  const jurisdiction = resolveReportJurisdiction(payload);
  const clientFacing = buildStructuredReport(entries, language, jurisdiction);

  const title =
    typeof payload.title === "string" && payload.title.trim()
      ? payload.title.trim()
      : "Rapport d'inspection";

  const inspectorNote =
    typeof payload.inspector_note === "string" ? payload.inspector_note : "";

  const clientSection =
    typeof payload.client_section === "string" && payload.client_section.trim()
      ? payload.client_section.trim()
      : clientFacing.summary;

  const body: Record<string, unknown> = {
    report_id: reportId,
    access_token: accessToken,
    title,
    inspector_note: inspectorNote,
    client_section: clientSection,
    polish_client: false,
    entries: ensureReportEntryIds(entries),
    language,
    [REPORT_LANGUAGE_PAYLOAD_KEY]: reportLocale,
    [MANUAL_REVISIONS_PAYLOAD_KEY]: buildManualRevisionsForModifiedEntries(
      entries,
      payload,
      reportLocale,
    ),
    jurisdiction,
    photos_coverage:
      payload.photos_coverage_v1 && typeof payload.photos_coverage_v1 === "object"
        ? payload.photos_coverage_v1
        : {},
  };

  if (Array.isArray(payload.photo_observation_links)) {
    body.photo_observation_links = payload.photo_observation_links;
  }
  if (payload.report_photo_selection_v1) {
    body.report_photo_selection_v1 = payload.report_photo_selection_v1;
  }
  if (payload.ai_observation_snapshot_v1) {
    body.ai_observation_snapshot_v1 = payload.ai_observation_snapshot_v1;
  }
  if (payload.inspection_weather_v1) {
    body.inspection_weather_v1 = payload.inspection_weather_v1;
  }
  if (payload.report_backup_snapshot_v1) {
    body.report_backup_snapshot_v1 = payload.report_backup_snapshot_v1;
  }

  return body;
}

/** Restaure les décisions depuis le payload après rechargement (snapshot + entries). */
export function deriveReviewDecisionsFromPayload(
  payload: unknown,
  entries: ReportEntryInput[],
): Map<string, FindingReviewStatus> {
  const decisions = new Map<string, FindingReviewStatus>();
  const snapshot = parseAIObservationSnapshot(
    payload && typeof payload === "object"
      ? (payload as Record<string, unknown>).ai_observation_snapshot_v1
      : null,
  );
  if (!snapshot) return decisions;

  const entryById = new Map(
    entries
      .map((e) => [e.id?.trim() ?? "", e] as const)
      .filter(([id]) => id.length > 0),
  );

  for (const item of snapshot.items) {
    const entry = entryById.get(item.observation_id);
    if (!entry) {
      decisions.set(item.observation_id, "ignored");
      continue;
    }
    if (!isMachineGeneratedEntryNote(entry.note)) {
      decisions.set(item.observation_id, "modified");
      continue;
    }
    const hash = hashObservationText(entry.note);
    if (hash === item.text_hash) {
      decisions.set(item.observation_id, "accepted");
    }
  }

  return decisions;
}

export function reviewedIdsFromDecisions(
  decisions: ReadonlyMap<string, FindingReviewStatus>,
): Set<string> {
  const ids = new Set<string>();
  for (const [id, status] of decisions) {
    if (status === "accepted" || status === "modified" || status === "ignored") {
      ids.add(id);
    }
  }
  return ids;
}

export { isReviewSessionComplete, reviewProgressPercent } from "@/lib/reviewProgress";
