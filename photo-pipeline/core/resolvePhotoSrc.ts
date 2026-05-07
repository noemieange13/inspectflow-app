import type { SupabaseClient } from "@supabase/supabase-js";

import { finalizeResolvedDisplayUrl } from "./finalizeDisplayUrl";
import { getPhotosStorageBucketName } from "./bucket";
import type { PhotoUrlFields } from "./types";
import { getUserUploadPublicUrl } from "./getPublicUrl";
import { storageObjectKey } from "./storageObjectKey";
import { isTrustedDbPhotoUrl, trimStr } from "./strings";

export type { PhotoUrlFields } from "./types";
export { PLACEHOLDER_IMAGE_PATH } from "./placeholder";

/** Une promesse par clé storage : déduplique les `createSignedUrl` concurrents. */
const signedUrlPromiseByPath = new Map<string, Promise<string | null>>();

export function clearSignedUrlPromiseCache(): void {
  signedUrlPromiseByPath.clear();
}

/**
 * URL d’affichage (bucket public). Retour toujours une string non vide
 * (`PLACEHOLDER_IMAGE_PATH` si aucune source valide).
 */
export function resolvePhotoDisplayUrlSync(
  supabase: SupabaseClient,
  photo: PhotoUrlFields,
): string {
  const pu = trimStr(photo.photo_url);
  if (pu && isTrustedDbPhotoUrl(pu)) {
    return finalizeResolvedDisplayUrl(pu, photo, "trusted_photo_url");
  }

  const key = storageObjectKey(photo);
  if (key) {
    const u = getUserUploadPublicUrl(supabase, key);
    if (u) return finalizeResolvedDisplayUrl(u, photo, "storage_public_url");
  }

  return finalizeResolvedDisplayUrl(null, photo, "sync_no_storage_match");
}

export function resolveDirectPhotoUrlOnly(photo: PhotoUrlFields): string | null {
  const pu = trimStr(photo.photo_url);
  if (pu && isTrustedDbPhotoUrl(pu)) return pu;
  return null;
}

/** URL signée ou repli — retour toujours une string affichable. */
export async function resolvePhotoDisplayUrlAsync(
  supabase: SupabaseClient,
  photo: PhotoUrlFields,
): Promise<string> {
  const direct = resolveDirectPhotoUrlOnly(photo);
  if (direct) return finalizeResolvedDisplayUrl(direct, photo, "async_direct_url");

  const key = storageObjectKey(photo);
  if (!key) {
    return finalizeResolvedDisplayUrl(null, photo, "async_no_storage_key");
  }

  let p = signedUrlPromiseByPath.get(key);
  if (!p) {
    const bucket = getPhotosStorageBucketName();
    p = (async () => {
      const { data, error } = await supabase.storage
        .from(bucket)
        .createSignedUrl(key, 3600);
      if (error || !data?.signedUrl) return null;
      return data.signedUrl;
    })();
    signedUrlPromiseByPath.set(key, p);
  }
  const raw = await p;
  return finalizeResolvedDisplayUrl(raw, photo, "async_signed_url");
}

/**
 * Pré-remplit le cache d’URLs publiques avant peinture (grilles volumineuses).
 */
export function warmPhotoUrlCache(
  supabase: SupabaseClient,
  photos: readonly PhotoUrlFields[],
): void {
  for (const p of photos) {
    resolvePhotoDisplayUrlSync(supabase, p);
  }
}

export function shouldUseSignedPhotoUrls(): boolean {
  return (
    typeof process !== "undefined" &&
    process.env.NEXT_PUBLIC_USE_SIGNED_PHOTO_URLS === "true"
  );
}
