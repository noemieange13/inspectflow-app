import { supabase } from "./supabase";

/** PDF final : clé Storage dans le bucket `rapports-pdf` (prioritaire sur pdf_url côté app). */
export function getPublicPdfUrl(pdfPath?: string | null) {
  if (!pdfPath) return null;
  const { data } = supabase.storage.from("rapports-pdf").getPublicUrl(pdfPath);
  return data.publicUrl;
}

export function formatDate(value?: string | null) {
  if (!value) return "—";
  try {
    return new Date(value).toLocaleString("fr-CA");
  } catch {
    return value;
  }
}
