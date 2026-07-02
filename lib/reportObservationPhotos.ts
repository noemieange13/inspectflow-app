import type { SupabaseClient } from "@supabase/supabase-js";

import { isObservationId } from "@/lib/observationIds";
import { getUserUploadPublicUrl } from "@/lib/reportPhotoPublicUrl";
import { MAX_INSPECTION_PHOTOS_LOAD } from "@/lib/inspectionPhotoLimits";
import { loadPhotoRowsForReport } from "@/lib/reportPhotosForReport";

export type PhotoObservationLinkInput = {
  photo_id: string;
  observation_id: string | null;
};

export type ObservationPhotoIntegrity = {
  schema_version: 1;
  updated_at: string;
  /** Photos exclues du PDF (sans observation_id ou id de constat inconnu). */
  excluded_photo_ids: string[];
  /** Raison par photo_id. */
  exclusion_reasons: Record<string, "missing_observation_id" | "unknown_observation_id">;
  /** Photos incluses dans le PDF, groupées par observation.id. */
  included_by_observation_id: Record<string, string[]>;
};

export type ObservationPhotoRow = {
  id: string;
  observation_id: string | null;
  storage_path: string | null;
  url: string | null;
};

function normalizeLink(raw: unknown): PhotoObservationLinkInput | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  const photo_id = typeof o.photo_id === "string" ? o.photo_id.trim() : "";
  if (!photo_id) return null;
  const obsRaw = o.observation_id;
  if (obsRaw === null || obsRaw === undefined || obsRaw === "") {
    return { photo_id, observation_id: null };
  }
  const observation_id = typeof obsRaw === "string" ? obsRaw.trim() : "";
  if (!isObservationId(observation_id)) return null;
  return { photo_id, observation_id };
}

export function parsePhotoObservationLinks(raw: unknown): PhotoObservationLinkInput[] | null {
  if (!Array.isArray(raw)) return null;
  const out: PhotoObservationLinkInput[] = [];
  for (const row of raw) {
    const link = normalizeLink(row);
    if (link) out.push(link);
  }
  return out.length > 0 ? out : null;
}

/**
 * Met à jour `photos.observation_id` pour les liens fournis (constat connu uniquement).
 */
export async function persistPhotoObservationLinks(
  supabase: SupabaseClient,
  links: PhotoObservationLinkInput[],
  validObservationIds: Set<string>,
): Promise<void> {
  for (const link of links) {
    const { photo_id, observation_id } = link;
    if (observation_id != null && !validObservationIds.has(observation_id)) {
      continue;
    }
    const { error } = await supabase
      .from("photos")
      .update({ observation_id })
      .eq("id", photo_id);
    if (error && error.code !== "42703") {
      throw new Error(error.message);
    }
  }
}

export async function loadObservationPhotoRowsForReport(
  supabase: SupabaseClient,
  reportId: string,
  maxPhotos = MAX_INSPECTION_PHOTOS_LOAD,
): Promise<ObservationPhotoRow[]> {
  const { rows } = await loadPhotoRowsForReport(supabase, reportId, maxPhotos);
  return rows.map((r) => {
    const rec = r as { observation_id?: unknown; id: string; storage_path?: string | null };
    const obs =
      typeof rec.observation_id === "string" ? rec.observation_id.trim() : null;
    const storage_path =
      typeof rec.storage_path === "string" ? rec.storage_path : null;
    return {
      id: String(rec.id),
      observation_id: obs && isObservationId(obs) ? obs : null,
      storage_path,
      url: getUserUploadPublicUrl(supabase, storage_path),
    };
  });
}

export function auditObservationPhotoIntegrity(
  rows: ObservationPhotoRow[],
  validObservationIds: Set<string>,
): ObservationPhotoIntegrity {
  const excluded_photo_ids: string[] = [];
  const exclusion_reasons: ObservationPhotoIntegrity["exclusion_reasons"] = {};
  const included_by_observation_id: Record<string, string[]> = {};

  for (const row of rows) {
    const obs = row.observation_id;
    if (!obs) {
      excluded_photo_ids.push(row.id);
      exclusion_reasons[row.id] = "missing_observation_id";
      continue;
    }
    if (!validObservationIds.has(obs)) {
      excluded_photo_ids.push(row.id);
      exclusion_reasons[row.id] = "unknown_observation_id";
      continue;
    }
    if (!included_by_observation_id[obs]) included_by_observation_id[obs] = [];
    included_by_observation_id[obs].push(row.id);
  }

  return {
    schema_version: 1,
    updated_at: new Date().toISOString(),
    excluded_photo_ids,
    exclusion_reasons,
    included_by_observation_id,
  };
}

/** URLs publiques par observation.id — uniquement photos valides pour le PDF. */
export function buildObservationPhotoUrlsById(
  rows: ObservationPhotoRow[],
  validObservationIds: Set<string>,
): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  for (const row of rows) {
    const obs = row.observation_id;
    if (!obs || !validObservationIds.has(obs)) continue;
    const url = row.url?.trim();
    if (!url) continue;
    if (!out[obs]) out[obs] = [];
    if (!out[obs].includes(url)) out[obs].push(url);
  }
  return out;
}

export function parseObservationPhotoUrlsFromPayload(
  payload: Record<string, unknown>,
): Record<string, string[]> {
  const raw = payload.observation_photos_v1;
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  const urlsRaw = (raw as Record<string, unknown>).urls_by_observation_id;
  if (!urlsRaw || typeof urlsRaw !== "object" || Array.isArray(urlsRaw)) return {};
  const out: Record<string, string[]> = {};
  for (const [k, v] of Object.entries(urlsRaw as Record<string, unknown>)) {
    if (!isObservationId(k) || !Array.isArray(v)) continue;
    const urls = v
      .filter((x): x is string => typeof x === "string" && x.trim().length > 0)
      .map((x) => x.trim());
    if (urls.length > 0) out[k] = urls;
  }
  return out;
}

export function renderObservationPhotosHtml(urls: string[]): string {
  if (urls.length === 0) return "";
  const imgs = urls
    .map(
      (url) =>
        `<figure style="margin:0.5em 0.35em 0.5em 0;display:inline-block;vertical-align:top;max-width:48%"><img src="${url.replace(/"/g, "&quot;")}" alt="" style="max-width:100%;height:auto;border:1px solid #cbd5e1;border-radius:6px"/></figure>`,
    )
    .join("");
  return `<div class="inspectflow-observation-photos" style="margin-top:0.65em">${imgs}</div>`;
}
