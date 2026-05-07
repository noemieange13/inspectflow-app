"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import type { ClassifiedPhotoRow, DisplayPhoto } from "@/photo-pipeline";
import { createBrowserSupabaseClient } from "@/lib/supabaseBrowser";

export type { ClassifiedPhotoRow, DisplayPhoto };

function toDisplayPhoto(
  raw: Record<string, unknown> | null | undefined,
): DisplayPhoto | null {
  if (!raw || typeof raw.id !== "string") return null;
  return {
    id: raw.id,
    storage_path:
      typeof raw.storage_path === "string" ? raw.storage_path : null,
    path: typeof raw.path === "string" ? raw.path : null,
    photo_url: typeof raw.photo_url === "string" ? raw.photo_url : null,
    photo_number:
      typeof raw.photo_number === "number" ? raw.photo_number : null,
  };
}

export function useInspectionPhotos(inspectionId: string, reportId?: string) {
  const [classified, setClassified] = useState<ClassifiedPhotoRow[]>([]);
  const [unclassified, setUnclassified] = useState<DisplayPhoto[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const supabase = useMemo(() => createBrowserSupabaseClient(), []);

  const load = useCallback(async () => {
    if (!inspectionId) return;

    setLoading(true);
    setError(null);

    try {
      let classifiedQuery = supabase
        .from("constat_photos")
        .select(
          `
          section_name,
          constat_id,
          photo_id,
          photos (
            id,
            storage_path,
            photo_url,
            path,
            photo_number
          )
        `,
        )
        .eq("inspection_id", inspectionId);

      if (reportId) {
        classifiedQuery = classifiedQuery.eq("report_id", reportId);
      }

      const { data: classifiedData, error: cErr } = await classifiedQuery;

      if (cErr) {
        console.error("constat_photos fetch error:", cErr);
        setError(cErr.message);
      }

      const linkedIds = new Set<string>();
      const classifiedRows: ClassifiedPhotoRow[] = [];

      for (const row of classifiedData ?? []) {
        const r = row as Record<string, unknown>;
        const photo_id = typeof r.photo_id === "string" ? r.photo_id : "";
        const nested = r.photos as Record<string, unknown> | null | undefined;
        const photo = toDisplayPhoto(nested ?? null);
        if (!photo_id || !photo) continue;
        linkedIds.add(photo_id);
        classifiedRows.push({
          section_name:
            typeof r.section_name === "string" ? r.section_name : null,
          constat_id: typeof r.constat_id === "string" ? r.constat_id : null,
          photo_id,
          photo,
        });
      }

      const { data: rawUnclassified, error: uErr } = await supabase
        .from("photos")
        .select("id, storage_path, photo_url, path, photo_number, section")
        .eq("inspection_id", inspectionId)
        .is("section", null);

      if (uErr) {
        console.error("photos fetch error:", uErr);
        setError((prev) => prev ?? uErr.message);
      }

      const unclassifiedList: DisplayPhoto[] = [];
      for (const row of rawUnclassified ?? []) {
        const r = row as Record<string, unknown>;
        if (typeof r.id !== "string") continue;
        if (linkedIds.has(r.id)) continue;
        const p = toDisplayPhoto(r);
        if (p) unclassifiedList.push(p);
      }

      setClassified(classifiedRows);
      setUnclassified(unclassifiedList);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setError(msg);
      setClassified([]);
      setUnclassified([]);
    } finally {
      setLoading(false);
    }
  }, [inspectionId, reportId, supabase]);

  useEffect(() => {
    void load();
  }, [load]);

  return { classified, unclassified, loading, error, reload: load, supabase };
}
