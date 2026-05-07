import type { SupabaseClient } from "@supabase/supabase-js";

import { getPhotosStorageBucketName } from "./bucket";
import { getCachedPublicUrl } from "./publicUrlCache";

/** Usage interne (API serveur, Edge). Pour le front, préférer `resolvePhotoDisplayUrlSync`. */
export { DEFAULT_PHOTOS_STORAGE_BUCKET, getPhotosStorageBucketName } from "./bucket";

/** URL publique Storage — cache intégré. */
export function getUserUploadPublicUrl(
  supabase: SupabaseClient,
  storagePath: string | null | undefined,
): string | null {
  const p = typeof storagePath === "string" ? storagePath.trim() : "";
  if (!p) return null;
  const bucket = getPhotosStorageBucketName();
  return getCachedPublicUrl(bucket, p, (objectPath) => {
    const { data } = supabase.storage.from(bucket).getPublicUrl(objectPath);
    return typeof data?.publicUrl === "string" && data.publicUrl
      ? data.publicUrl
      : null;
  });
}
