import type { SupabaseClient } from "@supabase/supabase-js";

export const RAPPORTS_PDF_BUCKET = "rapports-pdf";

/** Durée alignée avec la page viewer `/report/[id]` (secondes). */
export const DEFAULT_SIGNED_URL_TTL_SEC = 3600;

/** Clé objet seule : le bucket est déjà `rapports-pdf` — pas de préfixe `rapports-pdf/`. */
export function normalizeRapportsPdfObjectPath(raw: string): string {
  return raw.trim().replace(/^rapports-pdf\//i, "");
}

type ReportPdfFields = Record<string, unknown>;

/**
 * Construit une URL d’accès au PDF : `pdf_path` (Storage) prioritaire, sinon `pdf_url` / `file_url`
 * (URL complète ou clé Storage).
 */
export async function createSignedUrlForReportPdf(
  supabase: SupabaseClient,
  row: ReportPdfFields,
  expiresIn: number = DEFAULT_SIGNED_URL_TTL_SEC,
): Promise<
  | { signedUrl: string }
  | {
      error: "no_pdf" | "sign_failed";
      log?: Record<string, unknown>;
    }
> {
  const pdfPath =
    typeof row.pdf_path === "string" && row.pdf_path.trim()
      ? normalizeRapportsPdfObjectPath(row.pdf_path)
      : "";

  const pdfSourceRaw =
    (typeof row.pdf_url === "string" && row.pdf_url.trim()) ||
    (typeof row.file_url === "string" && row.file_url.trim()) ||
    "";

  if (!pdfPath && !pdfSourceRaw) {
    return { error: "no_pdf" };
  }

  if (pdfPath) {
    const { data: signed, error: signError } = await supabase.storage
      .from(RAPPORTS_PDF_BUCKET)
      .createSignedUrl(pdfPath, expiresIn);

    if (signError || !signed?.signedUrl) {
      return {
        error: "sign_failed",
        log: {
          bucket: RAPPORTS_PDF_BUCKET,
          objectPath: pdfPath,
          message: signError?.message,
        },
      };
    }
    return { signedUrl: signed.signedUrl };
  }

  const isFullUrl = pdfSourceRaw.startsWith("http");

  if (isFullUrl) {
    return { signedUrl: pdfSourceRaw };
  }

  const storageKey = normalizeRapportsPdfObjectPath(pdfSourceRaw);
  const { data: signed, error: signError } = await supabase.storage
    .from(RAPPORTS_PDF_BUCKET)
    .createSignedUrl(storageKey, expiresIn);

  if (signError || !signed?.signedUrl) {
    return {
      error: "sign_failed",
      log: {
        bucket: RAPPORTS_PDF_BUCKET,
        objectPath: storageKey,
        message: signError?.message,
      },
    };
  }
  return { signedUrl: signed.signedUrl };
}
