import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Étape **après** `uploadReportPdfAndSetPath` : verrouiller le rapport.
 * Ne pas fusionner avec l’update de `pdf_path` si un trigger bloque quand `is_locked = true`.
 *
 * Adapte les colonnes si ton schéma diffère (`finalized_at` absent → retire-la du payload).
 */
export async function finalizeReportAfterPdfUpload(
  supabase: SupabaseClient,
  reportId: string,
  opts?: {
    finalizedAt?: Date;
  },
): Promise<void> {
  const finalizedAt = opts?.finalizedAt ?? new Date();

  const { error } = await supabase
    .from("reports")
    .update({
      is_locked: true,
      finalized_at: finalizedAt.toISOString(),
    })
    .eq("id", reportId);

  if (error) {
    console.error("DB UPDATE ERROR (reports lock / finalized_at):", error);
    throw error;
  }
}
