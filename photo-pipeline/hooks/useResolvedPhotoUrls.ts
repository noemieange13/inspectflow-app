"use client";

import { useEffect, useMemo, useState } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";

import type { DisplayPhoto } from "../core/types";
import {
  resolveDirectPhotoUrlOnly,
  resolvePhotoDisplayUrlAsync,
  resolvePhotoDisplayUrlSync,
  shouldUseSignedPhotoUrls,
} from "../core/resolvePhotoSrc";

function stablePhotosKey(photos: DisplayPhoto[]): string {
  return [...photos]
    .sort((a, b) => a.id.localeCompare(b.id))
    .map(
      (p) =>
        `${p.id}-${p.storage_path ?? ""}-${p.path ?? ""}-${p.photo_url ?? ""}`,
    )
    .join("|");
}

/**
 * Carte `photoId → URL` pour `<img src>`. Public : `getPublicUrl`.
 * `NEXT_PUBLIC_USE_SIGNED_PHOTO_URLS=true` : URLs signées (promesses dédupliquées côté core).
 */
export function useResolvedPhotoUrls(
  supabase: SupabaseClient,
  photos: DisplayPhoto[],
): Record<string, string> {
  const photosKey = stablePhotosKey(photos);
  const useSigned = shouldUseSignedPhotoUrls();

  const syncMap = useMemo(() => {
    const m: Record<string, string> = {};
    for (const p of photos) {
      const u = useSigned
        ? resolveDirectPhotoUrlOnly(p)
        : resolvePhotoDisplayUrlSync(supabase, p);
      if (u) m[p.id] = u;
    }
    return m;
  }, [supabase, photos, useSigned]);

  const [signedState, setSignedState] = useState<{
    photosKey: string;
    map: Record<string, string>;
  }>({ photosKey: "", map: {} });

  useEffect(() => {
    if (!useSigned || photos.length === 0) return;

    const effectKey = photosKey;
    let cancelled = false;
    void (async () => {
      const entries = await Promise.all(
        photos.map(async (p) => {
          const u = await resolvePhotoDisplayUrlAsync(supabase, p);
          return [p.id, u] as const;
        }),
      );
      if (cancelled) return;
      const m: Record<string, string> = Object.fromEntries(
        entries.filter(([, u]) => u),
      );
      setSignedState({ photosKey: effectKey, map: m });
    })();

    return () => {
      cancelled = true;
    };
  }, [supabase, useSigned, photosKey, photos]);

  return useMemo(() => {
    if (!useSigned) return syncMap;
    const signedMap =
      photos.length > 0 && signedState.photosKey === photosKey
        ? signedState.map
        : {};
    return { ...syncMap, ...signedMap };
  }, [syncMap, signedState, photosKey, photos.length, useSigned]);
}
