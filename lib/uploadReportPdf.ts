import type { SupabaseClient } from "@supabase/supabase-js";

import {
  rapportGeneratedFileName,
  rapportsPdfObjectPath,
} from "@/lib/rapportsPdfPath";

type UploadBody = Blob | ArrayBuffer | Buffer;

/**
 * Upload vers `rapports-pdf` puis `reports.pdf_path = filePath` (même chaîne que Storage).
 * À appeler côté serveur avec un client service role (ou policy adaptée).
 *
 * Si `reports` est verrouillé (trigger / RLS), l’update peut échouer — gérer côté DB ou bypass.
 */
export async function uploadReportPdfAndSetPath(
  supabase: SupabaseClient,
  opts: {
    userId: string;
    reportId: string;
    data: UploadBody;
    /** défaut : `rapport-${Date.now()}.pdf` */
    fileName?: string;
    upsert?: boolean;
  },
): Promise<{ filePath: string }> {
  const fileName = opts.fileName ?? rapportGeneratedFileName();
  const filePath = rapportsPdfObjectPath(opts.userId, fileName);

  const { error: uploadError } = await supabase.storage
    .from("rapports-pdf")
    .upload(filePath, opts.data, {
      contentType: "application/pdf",
      upsert: opts.upsert ?? false,
    });

  if (uploadError) {
    console.error("UPLOAD ERROR (rapports-pdf):", uploadError);
    throw uploadError;
  }

  const { error: updateError } = await supabase
    .from("reports")
    .update({ pdf_path: filePath })
    .eq("id", opts.reportId);

  if (updateError) {
    console.error("DB UPDATE ERROR (reports.pdf_path):", updateError);
    throw updateError;
  }

  return { filePath };
}
