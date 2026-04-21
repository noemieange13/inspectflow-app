import type { SupabaseClient } from "@supabase/supabase-js";

const USER_UPLOADS_BUCKET = "user-uploads";

/** URL publique Storage (bucket aligné sur `upload-photo`). */
export function getUserUploadPublicUrl(
  supabase: SupabaseClient,
  storagePath: string | null | undefined,
): string | null {
  const p = typeof storagePath === "string" ? storagePath.trim() : "";
  if (!p) return null;
  const { data } = supabase.storage.from(USER_UPLOADS_BUCKET).getPublicUrl(p);
  return typeof data?.publicUrl === "string" && data.publicUrl ? data.publicUrl : null;
}
