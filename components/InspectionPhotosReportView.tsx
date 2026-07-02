"use client";

import { useMemo } from "react";

import { useInspectionPhotos } from "@/hooks/useInspectionPhotos";
import { useResolvedPhotoUrls } from "@/hooks/useResolvedPhotoUrls";
import SectionRenderer from "@/components/SectionRenderer";
import { UnclassifiedPhotos } from "@/components/UnclassifiedPhotos";
import { useGroupedPhotos } from "@/utils/useGroupedPhotos";

type Props = {
  inspectionId: string;
  reportId?: string;
  className?: string;
};

/**
 * Production gallery: classified rows from `constat_photos` (+ nested `photos`),
 * unclassified from `photos` where `section` is null, excluding ids already linked
 * for this inspection/report (avoids duplicates).
 */
export default function InspectionPhotosReportView({
  inspectionId,
  reportId,
  className = "",
}: Props) {
  const { classified, unclassified, loading, error, supabase } =
    useInspectionPhotos(inspectionId, reportId);

  const grouped = useGroupedPhotos(classified);

  const photosForUrls = useMemo(() => {
    const byId = new Map<string, (typeof classified)[0]["photo"]>();
    for (const row of classified) {
      byId.set(row.photo.id, row.photo);
    }
    for (const p of unclassified) {
      byId.set(p.id, p);
    }
    return [...byId.values()];
  }, [classified, unclassified]);

  const resolvedUrls = useResolvedPhotoUrls(supabase, photosForUrls);

  if (!inspectionId) {
    return null;
  }

  if (loading) {
    return (
      <div className={`animate-pulse p-6 text-neutral-500 ${className}`}>
        Chargement des photos…
      </div>
    );
  }

  if (error) {
    return (
      <div className={`rounded border border-amber-200 bg-amber-50 p-4 text-amber-900 ${className}`}>
        {error}
      </div>
    );
  }

  return (
    <div className={`space-y-10 p-6 ${className}`}>
      <SectionRenderer grouped={grouped} resolvedUrls={resolvedUrls} />
      <UnclassifiedPhotos photos={unclassified} resolvedUrls={resolvedUrls} />
    </div>
  );
}
