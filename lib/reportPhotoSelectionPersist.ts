import { inferLinkedZoneFromPhotoAnalysis } from "@/lib/inferLinkedZoneFromPhotoAnalysis";
import { isObservationId } from "@/lib/observationIds";
import {
  computeAiPhotoSelectionDecisions,
  photoRowKey,
  type PhotoForSelection,
} from "@/lib/reportPhotoSelection";
import {
  photoSelectionSourceOutranks,
  serializeSelectionReason,
  type PhotoSelectionSource,
  type ReportPhotoSelectionDecision,
} from "@/lib/reportPhotoSelectionTypes";
import type { ReportEntryInput } from "@/lib/reportNarrative";
import { MAX_INSPECTION_PHOTOS_LOAD } from "@/lib/inspectionPhotoLimits";
import { loadPhotoRowsForReport } from "@/lib/reportPhotosForReport";
import type { SupabaseClient } from "@supabase/supabase-js";

export const OBSERVATION_REMOVED_SELECTION_REASON = "observation_removed";

export type SyncReportPhotoSelectionAfterLinksOptions = {
  linkedPhotoIds: string[];
  validObservationIds?: Set<string>;
  removedObservationIds?: Set<string>;
};

export type InspectorPhotoSelectionPayload = {
  selectedPhotoIds: string[];
  tiersByPhotoId: Record<string, "critical" | "support">;
};

const INSPECTOR_ADDED_REASON = serializeSelectionReason({
  fr: "Ajoutée manuellement par l'inspecteur.",
  en: "Manually added by inspector.",
});

const INSPECTOR_REMOVED_REASON = serializeSelectionReason({
  fr: "Retirée manuellement par l'inspecteur.",
  en: "Manually removed by inspector.",
});

const INSPECTOR_SELECTED_REASON = serializeSelectionReason({
  fr: "Sélection confirmée par l'inspecteur.",
  en: "Selection confirmed by inspector.",
});

type DbRow = {
  photo_id: string;
  observation_id: string | null;
  tier: "critical" | "support";
  report_selected: boolean;
  selection_source: PhotoSelectionSource;
  relevance_score: number | null;
  quality_score: number | null;
  duplicate_group: string | null;
  selection_reason: string | null;
  ai_recommended: boolean;
  ai_rank: number | null;
};

function normalizeObservationId(raw: unknown): string | null {
  return typeof raw === "string" && isObservationId(raw) ? raw.trim() : null;
}

export function dbRowToDecision(row: DbRow): ReportPhotoSelectionDecision {
  return {
    photoId: row.photo_id,
    observationId: row.observation_id,
    reportSelected: row.report_selected,
    tier: row.tier,
    selectionSource: row.selection_source,
    relevanceScore: row.relevance_score,
    qualityScore: row.quality_score,
    duplicateGroup: row.duplicate_group,
    selectionReason: row.selection_reason,
    aiRecommended: row.ai_recommended,
    aiRank: row.ai_rank,
  };
}

export function decisionToDbRow(
  reportId: string,
  decision: ReportPhotoSelectionDecision,
): Record<string, unknown> {
  return {
    report_id: reportId,
    photo_id: decision.photoId,
    observation_id: decision.observationId,
    tier: decision.tier,
    report_selected: decision.reportSelected,
    selection_source: decision.selectionSource,
    relevance_score: decision.relevanceScore,
    quality_score: decision.qualityScore,
    duplicate_group: decision.duplicateGroup,
    selection_reason: decision.selectionReason,
    ai_recommended: decision.aiRecommended,
    ai_rank: decision.aiRank,
    updated_at: new Date().toISOString(),
  };
}

/**
 * Fusionne les décisions IA avec l’existant : inspector > compliance > ai.
 * Préserve `report_selected` / tier / raison inspecteur — pas un `observation_id` stale
 * (resync via `syncReportPhotoSelectionAfterObservationLinks`).
 */
export function mergeAiPhotoSelectionWithExisting(
  existing: ReportPhotoSelectionDecision[],
  aiDecisions: ReportPhotoSelectionDecision[],
): ReportPhotoSelectionDecision[] {
  const byPhotoId = new Map<string, ReportPhotoSelectionDecision>();
  for (const row of existing) {
    byPhotoId.set(row.photoId, row);
  }

  for (const ai of aiDecisions) {
    const prev = byPhotoId.get(ai.photoId);
    if (prev && photoSelectionSourceOutranks(prev.selectionSource, "ai")) {
      byPhotoId.set(ai.photoId, {
        ...prev,
        relevanceScore: ai.relevanceScore ?? prev.relevanceScore,
        qualityScore: ai.qualityScore ?? prev.qualityScore,
        duplicateGroup: ai.duplicateGroup ?? prev.duplicateGroup,
        aiRecommended: ai.aiRecommended,
        aiRank: ai.aiRank,
      });
      continue;
    }
    byPhotoId.set(ai.photoId, { ...ai, selectionSource: "ai" });
  }

  return [...byPhotoId.values()];
}

function observationWasRemoved(
  previousObservationId: string | null,
  photosObservationId: string | null,
  opts?: Pick<
    SyncReportPhotoSelectionAfterLinksOptions,
    "validObservationIds" | "removedObservationIds"
  >,
): boolean {
  if (previousObservationId == null) return false;
  if (opts?.removedObservationIds?.has(previousObservationId)) return true;
  if (
    opts?.validObservationIds &&
    !opts.validObservationIds.has(previousObservationId) &&
    photosObservationId === null
  ) {
    return true;
  }
  return false;
}

/**
 * Applique la sync `photos.observation_id` → sélection sans toucher inclusion/source,
 * sauf constat supprimé (force exclusion PDF même source inspector).
 */
export function applyObservationLinkSyncToDecision(
  decision: ReportPhotoSelectionDecision,
  photosObservationId: string | null,
  opts?: Pick<
    SyncReportPhotoSelectionAfterLinksOptions,
    "validObservationIds" | "removedObservationIds"
  >,
): ReportPhotoSelectionDecision {
  const synced: ReportPhotoSelectionDecision = {
    ...decision,
    observationId: photosObservationId,
  };

  if (
    observationWasRemoved(decision.observationId, photosObservationId, opts)
  ) {
    return {
      ...synced,
      observationId: null,
      reportSelected: false,
      selectionReason: OBSERVATION_REMOVED_SELECTION_REASON,
    };
  }

  return synced;
}

export async function syncReportPhotoSelectionAfterObservationLinks(
  supabase: SupabaseClient,
  reportId: string,
  opts: SyncReportPhotoSelectionAfterLinksOptions,
): Promise<void> {
  const photoIds = new Set(
    opts.linkedPhotoIds.map((x) => x.trim()).filter((x) => x.length > 0),
  );

  if (opts.validObservationIds) {
    const existing = await loadReportPhotoSelectionDecisions(supabase, reportId);
    for (const row of existing) {
      if (
        row.observationId &&
        !opts.validObservationIds.has(row.observationId)
      ) {
        photoIds.add(row.photoId);
      }
    }
  }

  if (photoIds.size === 0) return;

  const { data: photoRows, error: photoErr } = await supabase
    .from("photos")
    .select("id, observation_id")
    .in("id", [...photoIds]);
  if (photoErr) {
    if (photoErr.code === "42P01") return;
    throw photoErr;
  }

  const observationIdByPhotoId = new Map<string, string | null>();
  for (const row of photoRows ?? []) {
    const r = row as { id?: unknown; observation_id?: unknown };
    if (typeof r.id !== "string") continue;
    observationIdByPhotoId.set(r.id, normalizeObservationId(r.observation_id));
  }

  const existing = await loadReportPhotoSelectionDecisions(supabase, reportId);
  const existingByPhotoId = new Map(existing.map((row) => [row.photoId, row]));
  const toUpsert: ReportPhotoSelectionDecision[] = [];

  for (const photoId of photoIds) {
    const prev = existingByPhotoId.get(photoId);
    if (!prev) continue;

    const photosObservationId = observationIdByPhotoId.get(photoId) ?? null;
    const next = applyObservationLinkSyncToDecision(prev, photosObservationId, {
      validObservationIds: opts.validObservationIds,
      removedObservationIds: opts.removedObservationIds,
    });

    if (
      next.observationId !== prev.observationId ||
      next.reportSelected !== prev.reportSelected ||
      next.selectionReason !== prev.selectionReason
    ) {
      toUpsert.push(next);
    }
  }

  await upsertReportPhotoSelectionDecisions(supabase, reportId, toUpsert);
}

/**
 * Applique le payload UI (sélection manuelle) avec source `inspector`.
 */
export function applyInspectorPhotoSelectionPayload(
  existing: ReportPhotoSelectionDecision[],
  payload: InspectorPhotoSelectionPayload,
  observationIdByPhotoId: Record<string, string | null> = {},
): ReportPhotoSelectionDecision[] {
  const byPhotoId = new Map(existing.map((row) => [row.photoId, row]));
  const selectedSet = new Set(
    payload.selectedPhotoIds.map((x) => x.trim()).filter((x) => x.length > 0),
  );
  const previouslySelected = new Set(
    existing.filter((row) => row.reportSelected).map((row) => row.photoId),
  );

  for (const photoId of selectedSet) {
    const prev = byPhotoId.get(photoId);
    const tier = payload.tiersByPhotoId[photoId] === "critical" ? "critical" : "support";
    const wasSelected = prev?.reportSelected ?? previouslySelected.has(photoId);
    byPhotoId.set(photoId, {
      photoId,
      observationId:
        observationIdByPhotoId[photoId] ?? prev?.observationId ?? null,
      reportSelected: true,
      tier,
      selectionSource: "inspector",
      relevanceScore: prev?.relevanceScore ?? null,
      qualityScore: prev?.qualityScore ?? null,
      duplicateGroup: prev?.duplicateGroup ?? null,
      selectionReason: wasSelected ? INSPECTOR_SELECTED_REASON : INSPECTOR_ADDED_REASON,
      aiRecommended: prev?.aiRecommended ?? false,
      aiRank: prev?.aiRank ?? null,
    });
  }

  for (const photoId of previouslySelected) {
    if (selectedSet.has(photoId)) continue;
    const prev = byPhotoId.get(photoId);
    byPhotoId.set(photoId, {
      photoId,
      observationId:
        observationIdByPhotoId[photoId] ?? prev?.observationId ?? null,
      reportSelected: false,
      tier: prev?.tier ?? "support",
      selectionSource: "inspector",
      relevanceScore: prev?.relevanceScore ?? null,
      qualityScore: prev?.qualityScore ?? null,
      duplicateGroup: prev?.duplicateGroup ?? null,
      selectionReason: INSPECTOR_REMOVED_REASON,
      aiRecommended: false,
      aiRank: null,
    });
  }

  return [...byPhotoId.values()];
}

export async function loadReportPhotoSelectionDecisions(
  supabase: SupabaseClient,
  reportId: string,
): Promise<ReportPhotoSelectionDecision[]> {
  const { data, error } = await supabase
    .from("report_photo_selections")
    .select(
      "photo_id, observation_id, tier, report_selected, selection_source, relevance_score, quality_score, duplicate_group, selection_reason, ai_recommended, ai_rank",
    )
    .eq("report_id", reportId);

  if (error) {
    if (error.code === "42P01") return [];
    throw error;
  }

  return (data ?? []).map((row) => {
    const r = row as Record<string, unknown>;
    const tierRaw = r.tier;
    const tier: "critical" | "support" =
      tierRaw === "critical" ? "critical" : "support";
    const sourceRaw = r.selection_source;
    const selectionSource: PhotoSelectionSource =
      sourceRaw === "ai" || sourceRaw === "compliance" || sourceRaw === "inspector"
        ? sourceRaw
        : "inspector";
    return dbRowToDecision({
      photo_id: String(r.photo_id),
      observation_id: normalizeObservationId(r.observation_id),
      tier,
      report_selected:
        typeof r.report_selected === "boolean" ? r.report_selected : true,
      selection_source: selectionSource,
      relevance_score:
        typeof r.relevance_score === "number" && Number.isFinite(r.relevance_score)
          ? r.relevance_score
          : null,
      quality_score:
        typeof r.quality_score === "number" && Number.isFinite(r.quality_score)
          ? r.quality_score
          : null,
      duplicate_group:
        typeof r.duplicate_group === "string" && r.duplicate_group.trim().length > 0
          ? r.duplicate_group.trim()
          : null,
      selection_reason:
        typeof r.selection_reason === "string" ? r.selection_reason : null,
      ai_recommended: r.ai_recommended === true,
      ai_rank:
        typeof r.ai_rank === "number" && Number.isFinite(r.ai_rank)
          ? Math.trunc(r.ai_rank)
          : null,
    });
  });
}

async function upsertReportPhotoSelectionDecisions(
  supabase: SupabaseClient,
  reportId: string,
  decisions: ReportPhotoSelectionDecision[],
): Promise<void> {
  if (decisions.length === 0) return;

  const rows = decisions.map((d) => decisionToDbRow(reportId, d));
  const { error } = await supabase
    .from("report_photo_selections")
    .upsert(rows, { onConflict: "report_id,photo_id" });
  if (error) {
    if (error.code === "42P01") return;
    throw error;
  }
}

function photoRowsToSelectionInput(
  rows: Awaited<ReturnType<typeof loadPhotoRowsForReport>>["rows"],
): {
  photos: PhotoForSelection[];
  observationIdByPhotoId: Record<string, string | null>;
} {
  const photos: PhotoForSelection[] = [];
  const observationIdByPhotoId: Record<string, string | null> = {};

  for (const row of rows) {
    const linked_zone = inferLinkedZoneFromPhotoAnalysis(row.analysis) ?? "autre";
    const observation_id = normalizeObservationId(row.observation_id);
    photos.push({
      id: row.id,
      serverPhotoId: row.id,
      linked_zone,
      observation_id,
      file_hash:
        typeof (row as { file_hash?: unknown }).file_hash === "string"
          ? (row as { file_hash: string }).file_hash
          : null,
      analysis: row.analysis ?? null,
    });
    observationIdByPhotoId[row.id] = observation_id;
  }

  return { photos, observationIdByPhotoId };
}

export async function syncAiPhotoSelectionToDb(
  supabase: SupabaseClient,
  reportId: string,
  entries: ReportEntryInput[],
): Promise<ReportPhotoSelectionDecision[]> {
  const existing = await loadReportPhotoSelectionDecisions(supabase, reportId);
  const { rows } = await loadPhotoRowsForReport(supabase, reportId, MAX_INSPECTION_PHOTOS_LOAD);
  const { photos, observationIdByPhotoId } = photoRowsToSelectionInput(rows);

  if (photos.length === 0) {
    return existing;
  }

  const aiDecisions = computeAiPhotoSelectionDecisions({
    entries,
    photos,
    observationIdByPhotoId,
  });
  const merged = mergeAiPhotoSelectionWithExisting(existing, aiDecisions);
  await upsertReportPhotoSelectionDecisions(supabase, reportId, merged);
  return merged;
}

export async function persistInspectorPhotoSelectionToDb(
  supabase: SupabaseClient,
  reportId: string,
  payload: InspectorPhotoSelectionPayload,
): Promise<ReportPhotoSelectionDecision[]> {
  const existing = await loadReportPhotoSelectionDecisions(supabase, reportId);
  const { rows } = await loadPhotoRowsForReport(supabase, reportId, MAX_INSPECTION_PHOTOS_LOAD);
  const { observationIdByPhotoId } = photoRowsToSelectionInput(rows);
  const merged = applyInspectorPhotoSelectionPayload(
    existing,
    payload,
    observationIdByPhotoId,
  );
  await upsertReportPhotoSelectionDecisions(supabase, reportId, merged);
  return merged;
}

export type InspectorPhotoSelectionPatch = {
  photoId: string;
  reportSelected: boolean;
  tier?: "critical" | "support";
  observationId?: string | null;
};

/** Patch unitaire galerie — source `inspector`, priorité sur IA ultérieure. */
export function patchInspectorPhotoSelectionDecision(
  existing: ReportPhotoSelectionDecision[],
  patch: InspectorPhotoSelectionPatch,
): ReportPhotoSelectionDecision[] {
  const prev = existing.find((r) => r.photoId === patch.photoId);
  const resolvedTier: "critical" | "support" =
    patch.tier ??
    (patch.reportSelected
      ? prev?.tier === "critical"
        ? "critical"
        : "support"
      : prev?.tier === "critical"
        ? "critical"
        : "support");

  const next: ReportPhotoSelectionDecision = {
    photoId: patch.photoId,
    observationId: patch.observationId ?? prev?.observationId ?? null,
    reportSelected: patch.reportSelected,
    tier: patch.reportSelected ? resolvedTier : prev?.tier ?? "support",
    selectionSource: "inspector",
    relevanceScore: prev?.relevanceScore ?? null,
    qualityScore: prev?.qualityScore ?? null,
    duplicateGroup: prev?.duplicateGroup ?? null,
    selectionReason: patch.reportSelected
      ? prev?.reportSelected
        ? INSPECTOR_SELECTED_REASON
        : INSPECTOR_ADDED_REASON
      : INSPECTOR_REMOVED_REASON,
    aiRecommended: patch.reportSelected ? (prev?.aiRecommended ?? false) : false,
    aiRank: patch.reportSelected ? (prev?.aiRank ?? null) : null,
  };

  const byPhotoId = new Map(existing.map((row) => [row.photoId, row]));
  byPhotoId.set(patch.photoId, next);
  return [...byPhotoId.values()];
}

export async function persistInspectorPhotoSelectionPatch(
  supabase: SupabaseClient,
  reportId: string,
  patch: InspectorPhotoSelectionPatch,
): Promise<ReportPhotoSelectionDecision[]> {
  const existing = await loadReportPhotoSelectionDecisions(supabase, reportId);
  const merged = patchInspectorPhotoSelectionDecision(existing, patch);
  await upsertReportPhotoSelectionDecisions(supabase, reportId, merged);
  return merged;
}

export async function persistReportPhotoSelectionLayer(
  supabase: SupabaseClient,
  reportId: string,
  opts: {
    entries: ReportEntryInput[];
    inspectorPayload?: InspectorPhotoSelectionPayload | null;
    runAi?: boolean;
  },
): Promise<void> {
  let current = await loadReportPhotoSelectionDecisions(supabase, reportId);

  if (opts.inspectorPayload) {
    const { rows } = await loadPhotoRowsForReport(supabase, reportId, MAX_INSPECTION_PHOTOS_LOAD);
    const { observationIdByPhotoId } = photoRowsToSelectionInput(rows);
    current = applyInspectorPhotoSelectionPayload(
      current,
      opts.inspectorPayload,
      observationIdByPhotoId,
    );
    await upsertReportPhotoSelectionDecisions(supabase, reportId, current);
  }

  if (opts.runAi) {
    await syncAiPhotoSelectionToDb(supabase, reportId, opts.entries);
  }
}

/** Utilitaire tests : clé stable photo → id DB */
export function selectionKeyForPhoto(p: PhotoForSelection): string {
  return photoRowKey(p);
}

export {
  computeAiPhotoSelectionDecisions,
  dedupePickedByDuplicateGroup,
} from "@/lib/reportPhotoSelection";

export type { ReportPhotoSelectionDecision };
