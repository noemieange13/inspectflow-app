import { snippetsFromPhotoAnalysis } from "@/lib/photoAnalysisSnippets";
import type { IssueCode, ReportEntryInput, ZoneCode } from "@/lib/reportNarrative";
import {
  serializeSelectionReason,
  type ReportPhotoSelectionDecision,
} from "@/lib/reportPhotoSelectionTypes";

/** Plafond global de photos marquées « dans le rapport » (évite les PDF à 200 images). */
export const REPORT_PHOTO_MAX_TOTAL = 48;
/** Meilleures prises par constat (zone + type de problème). */
export const REPORT_PHOTO_MAX_PER_FINDING = 2;

export type PhotoForSelection = {
  id: string;
  serverPhotoId?: string | null;
  linked_zone?: ZoneCode;
  observation_id?: string | null;
  file_hash?: string | null;
  analysis?: unknown;
  ai_score?: number;
  uploading?: boolean;
  url?: string | null;
};

export function photoRowKey(p: PhotoForSelection): string {
  const sid = p.serverPhotoId?.trim();
  return sid && sid.length > 0 ? sid : p.id.trim();
}

/**
 * Score qualité / richesse du texte d’analyse (aligné sur l’esprit de `reports-pdf` Edge).
 */
export function scorePhotoQualityFromAnalysis(analysis: unknown): number {
  const snippets = snippetsFromPhotoAnalysis(analysis);
  let score = 0;
  score += Math.min(snippets.length * 2, 10);
  const text = snippets.join(" ").toLowerCase();
  const defectKeywords = [
    "crack",
    "fissure",
    "leak",
    "fuite",
    "mold",
    "moisissure",
    "damage",
    "dommage",
    "rust",
    "corrosion",
    "stain",
    "tache",
    "broken",
    "defect",
    "anomaly",
    "anomalie",
    "wear",
    "usure",
  ];
  for (const kw of defectKeywords) {
    if (text.includes(kw)) score += 3;
  }
  const severityKeywords = ["high", "critical", "urgent", "elevee", "élevée", "critique"];
  for (const kw of severityKeywords) {
    if (text.includes(kw)) score += 5;
  }
  return score;
}

const ISSUE_KEYWORDS: Record<IssueCode, readonly string[]> = {
  water_infiltration: ["infiltr", "fuite", "leak", "eau", "water", "humid", "humidity", "condens"],
  crack_wall: ["fissur", "crack", "structur", "mur", "wall"],
  electrical_risk: ["electri", "électri", "panel", "tableau", "breaker", "disjonc", "câbl", "cabl", "wire", "fil "],
  humidity_mold: ["mold", "moisiss", "humid", "condens", "spore"],
  ventilation_issue: ["ventil", "extract", "vmc", "air"],
  roof_wear: ["toit", "roof", "shingle", "bardea", "goutti", "gutter", "couvertur"],
  window_seal_failure: ["fenêtr", "window", "joint", "seal", "vitr"],
  structure_movement: ["structur", "movement", "déform", "defor", "poutr", "beam"],
  plumbing_issue: ["plomb", "plumb", "drain", "tuyau", "pipe", "siphon"],
  insulation_deficiency: ["isolat", "insulation", "mousse", "vapeur"],
  fire_safety: ["feu", "fire", "fumée", "smoke", "alarm", "extinct"],
  exterior_damage: ["facade", "façade", "siding", "cladding", "extérieur", "exterior"],
  other: [],
};

function issueMatchScore(entry: ReportEntryInput, analysisLower: string): number {
  let s = 0;
  for (const kw of ISSUE_KEYWORDS[entry.issue] ?? []) {
    if (kw && analysisLower.includes(kw)) s += 4;
  }
  const note = (entry.note ?? "").toLowerCase();
  if (note.length > 3) {
    for (const w of note.split(/\s+/)) {
      const t = w.replace(/[^a-zàâäéèêëïîôùûüç0-9-]/gi, "");
      if (t.length > 4 && analysisLower.includes(t)) s += 2;
    }
  }
  return s;
}

function totalPhotoScore(p: PhotoForSelection, analysisLower: string): number {
  const q = scorePhotoQualityFromAnalysis(p.analysis);
  const h = typeof p.ai_score === "number" && Number.isFinite(p.ai_score) ? p.ai_score : 0;
  return q + h * 0.15;
}

function candidatePhotosForEntry(entry: ReportEntryInput, photos: PhotoForSelection[]): PhotoForSelection[] {
  const ez = entry.zone;
  const withZone = photos.filter((p) => (p.linked_zone ?? "autre") === ez);
  if (withZone.length > 0) return withZone;
  if (ez !== "autre") {
    const autreMatched = photos.filter((p) => {
      if ((p.linked_zone ?? "autre") !== "autre") return false;
      const snippets = snippetsFromPhotoAnalysis(p.analysis);
      const low = snippets.join(" ").toLowerCase();
      return issueMatchScore(entry, low) >= 4;
    });
    if (autreMatched.length > 0) return autreMatched;
  }
  const anyMatched = photos.filter((p) => {
    const snippets = snippetsFromPhotoAnalysis(p.analysis);
    const low = snippets.join(" ").toLowerCase();
    return issueMatchScore(entry, low) >= 2;
  });
  if (anyMatched.length > 0) return anyMatched;
  return photos;
}

export type SelectPhotosForReportOptions = {
  entries: ReportEntryInput[];
  photos: PhotoForSelection[];
  maxPerFinding?: number;
  maxTotal?: number;
};

/** Libellés courts pour l’UI (sélection auto explicable). */
export type PhotoSelectionReasonLabels = { fr: string; en: string };
export type ReportPhotoTier = "critical" | "support" | "excluded";

const REASON_FINDING: PhotoSelectionReasonLabels = {
  fr: "Mise en relation forte avec un constat (zone + analyse).",
  en: "Strong match to a finding (zone + analysis).",
};

const REASON_FILL: PhotoSelectionReasonLabels = {
  fr: "Complément au plafond (score d’analyse élevé).",
  en: "Fills the photo budget (strong analysis score).",
};

const FINDING_REASON_PRIORITY = 10;
const FILL_REASON_PRIORITY = 1;

type PickMeta = {
  score: number;
  priority: number;
  reason: PhotoSelectionReasonLabels;
};

function considerPick(
  picked: Map<string, PickMeta>,
  key: string,
  score: number,
  priority: number,
  reason: PhotoSelectionReasonLabels,
) {
  const prev = picked.get(key);
  if (!prev) {
    picked.set(key, { score, priority, reason });
    return;
  }
  if (score > prev.score) {
    picked.set(key, { score, priority, reason });
    return;
  }
  if (score === prev.score && priority > prev.priority) {
    picked.set(key, { score, priority, reason });
  }
}

function duplicateGroupForPhoto(p: PhotoForSelection): string | null {
  const hash = p.file_hash?.trim();
  return hash && hash.length > 0 ? hash : null;
}

/** Ne conserve qu’une photo par groupe duplicate (file_hash) — la mieux scorée. */
export function dedupePickedByDuplicateGroup(
  picked: Map<string, PickMeta>,
  keyToPhoto: Map<string, PhotoForSelection>,
): Map<string, PickMeta> {
  const bestKeyByGroup = new Map<string, string>();
  for (const [key, meta] of picked) {
    const photo = keyToPhoto.get(key);
    const group = photo ? duplicateGroupForPhoto(photo) : null;
    if (!group) continue;
    const prevKey = bestKeyByGroup.get(group);
    if (!prevKey) {
      bestKeyByGroup.set(group, key);
      continue;
    }
    const prevMeta = picked.get(prevKey);
    if (!prevMeta || meta.score > prevMeta.score) {
      picked.delete(prevKey);
      bestKeyByGroup.set(group, key);
    } else {
      picked.delete(key);
    }
  }
  return picked;
}

export type PhotoSelectionScoreMeta = {
  relevanceScore: number;
  qualityScore: number;
  duplicateGroup: string | null;
};

function scoreMetaForPhoto(p: PhotoForSelection, entry?: ReportEntryInput): PhotoSelectionScoreMeta {
  const snippets = snippetsFromPhotoAnalysis(p.analysis);
  const low = snippets.join(" ").toLowerCase();
  const qualityScore = totalPhotoScore(p, low);
  const relevanceScore =
    entry != null ? issueMatchScore(entry, low) * 8 + qualityScore : qualityScore;
  return {
    relevanceScore,
    qualityScore,
    duplicateGroup: duplicateGroupForPhoto(p),
  };
}

/**
 * Choisit les IDs (serverPhotoId si présent, sinon id client) des photos à inclure dans le rapport,
 * avec une courte justification par clé (pour l’UI).
 */
export function selectPhotosForReportWithReasons(opts: SelectPhotosForReportOptions): {
  ids: Set<string>;
  reasonsByKey: Record<string, PhotoSelectionReasonLabels>;
  tiersByKey: Record<string, Exclude<ReportPhotoTier, "excluded">>;
} {
  const maxPerFinding = opts.maxPerFinding ?? REPORT_PHOTO_MAX_PER_FINDING;
  const maxTotal = opts.maxTotal ?? REPORT_PHOTO_MAX_TOTAL;
  const photos = opts.photos.filter((p) => p.uploading !== true);
  if (photos.length === 0) return { ids: new Set(), reasonsByKey: {}, tiersByKey: {} };

  const picked = new Map<string, PickMeta>();

  for (const entry of opts.entries) {
    const pool = candidatePhotosForEntry(entry, photos);
    const ranked = pool
      .map((p) => {
        const snippets = snippetsFromPhotoAnalysis(p.analysis);
        const low = snippets.join(" ").toLowerCase();
        const im = issueMatchScore(entry, low);
        const base = totalPhotoScore(p, low);
        return { p, score: im * 8 + base };
      })
      .sort((a, b) => b.score - a.score);
    for (let i = 0; i < Math.min(maxPerFinding, ranked.length); i++) {
      const row = ranked[i]!;
      considerPick(picked, photoRowKey(row.p), row.score, FINDING_REASON_PRIORITY, REASON_FINDING);
    }
  }

  const rankedAll = photos
    .map((p) => {
      const snippets = snippetsFromPhotoAnalysis(p.analysis);
      const low = snippets.join(" ").toLowerCase();
      return { p, score: totalPhotoScore(p, low) };
    })
    .sort((a, b) => b.score - a.score);

  for (const { p, score } of rankedAll) {
    if (picked.size >= maxTotal) break;
    const k = photoRowKey(p);
    if (!picked.has(k)) considerPick(picked, k, score * 0.5, FILL_REASON_PRIORITY, REASON_FILL);
  }

  const keyToPhoto = new Map<string, PhotoForSelection>();
  for (const p of photos) {
    keyToPhoto.set(photoRowKey(p), p);
  }
  dedupePickedByDuplicateGroup(picked, keyToPhoto);

  const arr = [...picked.entries()].sort((a, b) => b[1].score - a[1].score);
  const keys = arr.slice(0, maxTotal).map(([k]) => k);
  const reasonsByKey: Record<string, PhotoSelectionReasonLabels> = {};
  const tiersByKey: Record<string, Exclude<ReportPhotoTier, "excluded">> = {};
  for (const k of keys) {
    const m = picked.get(k);
    if (m) {
      reasonsByKey[k] = m.reason;
      tiersByKey[k] = m.priority >= FINDING_REASON_PRIORITY ? "critical" : "support";
    }
  }
  return { ids: new Set(keys), reasonsByKey, tiersByKey };
}

/**
 * Choisit les IDs (serverPhotoId si présent, sinon id client) des photos à inclure dans le rapport,
 * en privilégiant les meilleures prises par constat puis un complément global plafonné.
 */
export function selectPhotoIdsForReportExport(opts: SelectPhotosForReportOptions): Set<string> {
  return selectPhotosForReportWithReasons(opts).ids;
}

export type ComputeAiPhotoSelectionOptions = SelectPhotosForReportOptions & {
  /** Map photo id (server) → observation_id pour persistance DB. */
  observationIdByPhotoId?: Record<string, string | null>;
};

/**
 * Produit les décisions IA complètes (scores, rang, dédup) prêtes pour merge/persistance DB.
 */
export function computeAiPhotoSelectionDecisions(
  opts: ComputeAiPhotoSelectionOptions,
): ReportPhotoSelectionDecision[] {
  const { ids, reasonsByKey, tiersByKey } = selectPhotosForReportWithReasons(opts);
  const photos = opts.photos.filter((p) => p.uploading !== true);
  const observationIdByPhotoId = opts.observationIdByPhotoId ?? {};

  const scoreByKey = new Map<string, PhotoSelectionScoreMeta>();
  for (const entry of opts.entries) {
    const pool = candidatePhotosForEntry(entry, photos);
    for (const p of pool) {
      const key = photoRowKey(p);
      const meta = scoreMetaForPhoto(p, entry);
      const prev = scoreByKey.get(key);
      if (!prev || meta.relevanceScore > prev.relevanceScore) {
        scoreByKey.set(key, meta);
      }
    }
  }
  for (const p of photos) {
    const key = photoRowKey(p);
    if (!scoreByKey.has(key)) {
      scoreByKey.set(key, scoreMetaForPhoto(p));
    }
  }

  const rankedSelected = [...ids]
    .map((key) => ({
      key,
      score: scoreByKey.get(key)?.relevanceScore ?? 0,
    }))
    .sort((a, b) => b.score - a.score);

  const rankByKey = new Map<string, number>();
  rankedSelected.forEach((row, idx) => {
    rankByKey.set(row.key, idx + 1);
  });

  const keyToPhotoId = new Map<string, string>();
  for (const p of photos) {
    const key = photoRowKey(p);
    const photoId = p.serverPhotoId?.trim() || p.id.trim();
    keyToPhotoId.set(key, photoId);
  }

  const decisions: ReportPhotoSelectionDecision[] = [];
  for (const p of photos) {
    const key = photoRowKey(p);
    const photoId = keyToPhotoId.get(key) ?? p.id.trim();
    const selected = ids.has(key);
    const meta = scoreByKey.get(key);
    const reasonLabels = reasonsByKey[key];
    decisions.push({
      photoId,
      observationId: observationIdByPhotoId[photoId] ?? p.observation_id ?? null,
      reportSelected: selected,
      tier: tiersByKey[key] ?? "support",
      selectionSource: "ai",
      relevanceScore: meta?.relevanceScore ?? null,
      qualityScore: meta?.qualityScore ?? null,
      duplicateGroup: meta?.duplicateGroup ?? null,
      selectionReason: reasonLabels ? serializeSelectionReason(reasonLabels) : null,
      aiRecommended: selected,
      aiRank: selected ? (rankByKey.get(key) ?? null) : null,
    });
  }

  return decisions;
}
