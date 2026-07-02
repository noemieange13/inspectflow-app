import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Insert direct côté client (ex. `inspectflow-ui` / upload manuel).
 * Pour l’app principale, `uploadPhotoViaApi` crée déjà la ligne via `/api/upload-photo`.
 */
export type CreatePhotoRecordInput = {
  inspection_id: string;
  owner_id: string;
  storage_path: string;
  file_hash: string;
  photo_number: number;
};

export async function createPhotoRecord(
  supabase: SupabaseClient,
  row: CreatePhotoRecordInput,
) {
  return supabase.from("photos").insert(row).select("id").single();
}
