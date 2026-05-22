import { loadPhotoRowsForReport } from "@/lib/reportPhotosForReport";
import { validateReportViewerAccessRecord } from "@/lib/reportViewerAccess";
import { createServiceRoleClient } from "@/lib/supabaseServer";

export type ReportServerData = {
  id: string;
  status: string | null;
  title: string | null;
  payload: Record<string, unknown> | null;
  hasPdf: boolean;
  pdfSignedUrl: string | null;
  /** Nombre de photos résolues comme pour le PDF — pour le readiness (few_photos, etc.). */
  photoCountForReadiness?: number;
  accessDenied?: boolean;
  notFound?: boolean;
  serverError?: string;
};

const REPORT_QUERY_MS = 20_000;

function delay<T>(ms: number, value: T): Promise<T> {
  return new Promise((resolve) => setTimeout(() => resolve(value), ms));
}

/**
 * Charge une ligne `reports` avec les mêmes règles que la page viewer `/report/[id]?token=`.
 */
export async function loadReportForViewer(
  reportId: string,
  viewerToken: string | undefined,
): Promise<ReportServerData> {
  try {
    const supabase = await createServiceRoleClient();

    const rowResult = await Promise.race([
      supabase
        .from("reports")
        .select("id, status, payload, access_token, token_expires_at, pdf_path, pdf_url, file_url")
        .eq("id", reportId)
        .maybeSingle()
        .then((r) => ({ kind: "row" as const, r })),
      delay(REPORT_QUERY_MS, { kind: "timeout" as const }),
    ]);

    if (rowResult.kind === "timeout") {
      return {
        id: reportId,
        status: null,
        title: null,
        payload: null,
        hasPdf: false,
        pdfSignedUrl: null,
        serverError:
          "Délai dépassé en joignant la base de données. Vérifiez le réseau ou réessayez.",
      };
    }

    const { data: report, error } = rowResult.r;

    if (error) {
      return {
        id: reportId,
        status: null,
        title: null,
        payload: null,
        hasPdf: false,
        pdfSignedUrl: null,
        serverError: error.message,
      };
    }
    if (!report) {
      return {
        id: reportId,
        status: null,
        title: null,
        payload: null,
        hasPdf: false,
        pdfSignedUrl: null,
        notFound: true,
      };
    }

    const rec = report as Record<string, unknown>;
    const accessGate = validateReportViewerAccessRecord(rec, viewerToken);
    if (!accessGate.ok) {
      return {
        id: reportId,
        status: null,
        title: null,
        payload: null,
        hasPdf: false,
        pdfSignedUrl: null,
        accessDenied: true,
      };
    }

    const payload =
      rec.payload && typeof rec.payload === "object"
        ? (rec.payload as Record<string, unknown>)
        : null;

    const title =
      payload && typeof payload.title === "string" ? payload.title : null;

    const pdfPath =
      typeof rec.pdf_path === "string" && rec.pdf_path.trim()
        ? rec.pdf_path.trim()
        : null;
    const pdfUrl =
      typeof rec.pdf_url === "string" && rec.pdf_url.trim() && rec.pdf_url !== "about:blank"
        ? rec.pdf_url.trim()
        : null;
    const hasPdf = !!(pdfPath || pdfUrl);

    let pdfSignedUrl: string | null = null;
    if (pdfUrl && pdfUrl.startsWith("http")) {
      pdfSignedUrl = pdfUrl;
    }

    const status = typeof rec.status === "string" ? rec.status : null;

    let photoCountForReadiness: number | undefined;
    try {
      const { rows } = await loadPhotoRowsForReport(supabase, reportId, 200);
      photoCountForReadiness = rows.length;
    } catch {
      photoCountForReadiness = undefined;
    }

    return {
      id: reportId,
      status,
      title,
      payload,
      hasPdf,
      pdfSignedUrl,
      photoCountForReadiness,
    };
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return {
      id: reportId,
      status: null,
      title: null,
      payload: null,
      hasPdf: false,
      pdfSignedUrl: null,
      serverError: message,
    };
  }
}
