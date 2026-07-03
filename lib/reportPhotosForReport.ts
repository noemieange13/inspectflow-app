import type { SupabaseClient } from "@supabase/supabase-js";

import { photoMatchesInspection } from "@/lib/reportInspectionGuard";

export type ReportPhotoRow = {
  id: string;
  analysis?: unknown;
  inspection_id?: string | null;
  photo_number?: number | null;
  storage_path?: string | null;
};

type ReportLinks = {
  photo_id?: string | null;
  job_id?: string | null;
  inspection_id?: string | null;
};

/**
 * Reproduit la résolution d’inspection / photos utilisée par `reports-pdf` (Edge).
 */
export async function loadPhotoRowsForReport(
  supabase: SupabaseClient,
  reportId: string,
  maxPhotos: number,
): Promise<{ rows: ReportPhotoRow[]; inspectionId: string | null; source: string }> {
  const { data: reportLinks, error: linkErr } = await supabase
    .from("reports")
    .select("photo_id, job_id, inspection_id")
    .eq("id", reportId)
    .maybeSingle();

  if (linkErr || !reportLinks) {
    return { rows: [], inspectionId: null, source: "none" };
  }

  const links = reportLinks as ReportLinks;
  let inspectionId =
    links.inspection_id != null && links.inspection_id !== ""
      ? String(links.inspection_id)
      : null;

  /**
   * On ne déduit plus `inspection_id` depuis `reports.photo_id` : une photo directe
   * stale/étrangère ne doit jamais choisir le lot PDF. `jobs.inspection_id` reste une
   * source métier acceptable quand la ligne `reports` n’est pas encore renseignée.
   */
  if (!inspectionId && links.job_id) {
    const { data: job, error: jobErr } = await supabase
      .from("jobs")
      .select("photo_id, inspection_id")
      .eq("id", links.job_id)
      .maybeSingle();

    if (!jobErr && job) {
      if (job.inspection_id != null && String(job.inspection_id) !== "") {
        inspectionId = String(job.inspection_id);
      }
      if (
        !inspectionId &&
        job.photo_id != null &&
        String(job.photo_id) !== ""
      ) {
        const { data: row, error } = await supabase
          .from("photos")
          .select("inspection_id")
          .eq("id", String(job.photo_id))
          .maybeSingle();
        if (!error && row?.inspection_id != null && String(row.inspection_id) !== "") {
          inspectionId = String(row.inspection_id);
        }
      }
    }
  }

  if (inspectionId) {
    const { data, error } = await supabase
      .from("photos")
      .select("id, analysis, inspection_id, photo_number, storage_path")
      .eq("inspection_id", inspectionId)
      .order("photo_number", { ascending: true })
      .limit(maxPhotos);

    if (!error && Array.isArray(data) && data.length > 0) {
      return {
        rows: data as ReportPhotoRow[],
        inspectionId,
        source: "photos.by_inspection_id",
      };
    }
  }

  /* Dernier recours : une seule photo liée au rapport, sans inspection résolvable */
  if (inspectionId && links.photo_id) {
    const { data: row, error } = await supabase
      .from("photos")
      .select("id, analysis, inspection_id, photo_number, storage_path")
      .eq("id", links.photo_id)
      .maybeSingle();
    if (!error && row) {
      const r = row as ReportPhotoRow;
      if (!photoMatchesInspection(r.inspection_id, inspectionId)) {
        return { rows: [], inspectionId, source: "none" };
      }
      return {
        rows: [r],
        inspectionId: r.inspection_id != null ? String(r.inspection_id) : null,
        source: "reports.photo_id_only",
      };
    }
  }

  if (inspectionId && links.job_id) {
    const { data: job, error: jobErr } = await supabase
      .from("jobs")
      .select("photo_id")
      .eq("id", links.job_id)
      .maybeSingle();
    if (!jobErr && job?.photo_id != null && String(job.photo_id) !== "") {
      const { data: row, error } = await supabase
        .from("photos")
        .select("id, analysis, inspection_id, photo_number, storage_path")
        .eq("id", String(job.photo_id))
        .maybeSingle();
      if (!error && row) {
        const r = row as ReportPhotoRow;
        if (!photoMatchesInspection(r.inspection_id, inspectionId)) {
          return { rows: [], inspectionId, source: "none" };
        }
        return {
          rows: [r],
          inspectionId: r.inspection_id != null ? String(r.inspection_id) : null,
          source: "jobs.photo_id_only",
        };
      }
    }
  }

  return { rows: [], inspectionId, source: "none" };
}

/**
 * Figée au temps T : même ensemble d’IDs pour toute la chaîne (évite les courses avec nouvelles photos).
 */
export async function loadPhotoRowsSnapshotByIds(
  supabase: SupabaseClient,
  ids: string[],
): Promise<ReportPhotoRow[]> {
  if (ids.length === 0) return [];
  const { data, error } = await supabase
    .from("photos")
    .select("id, analysis, inspection_id, photo_number, storage_path")
    .in("id", ids)
    .order("photo_number", { ascending: true });
  if (error || !Array.isArray(data)) {
    return [];
  }
  return data as ReportPhotoRow[];
}
