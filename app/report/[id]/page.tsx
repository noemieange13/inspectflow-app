import type { Metadata } from "next";
<<<<<<< HEAD
import { createServiceRoleClient } from "@/lib/supabaseServer";
=======
import { Suspense } from "react";
import ReportPageReadiness from "@/components/ReportPageReadiness";
>>>>>>> b65d71e3f50a98d131b2aca2629e6513dcf8a05c
import ZeroDraftReportComposer from "@/components/ZeroDraftReportComposer";
import { loadReportForViewer } from "@/lib/reportViewerServer";

<<<<<<< HEAD
=======
export type { ReportServerData } from "@/lib/reportViewerServer";

>>>>>>> b65d71e3f50a98d131b2aca2629e6513dcf8a05c
type Props = {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ token?: string | string[] }>;
};

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  return { title: `Rapport ${id.slice(0, 8)}…` };
}

<<<<<<< HEAD
export type ReportServerData = {
  id: string;
  status: string | null;
  title: string | null;
  payload: Record<string, unknown> | null;
  hasPdf: boolean;
  pdfSignedUrl: string | null;
  accessDenied?: boolean;
  notFound?: boolean;
  serverError?: string;
};

const REPORT_QUERY_MS = 20_000;

function delay<T>(ms: number, value: T): Promise<T> {
  return new Promise((resolve) => setTimeout(() => resolve(value), ms));
}

async function loadReport(
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
      return { id: reportId, status: null, title: null, payload: null, hasPdf: false, pdfSignedUrl: null, serverError: error.message };
    }
    if (!report) {
      return { id: reportId, status: null, title: null, payload: null, hasPdf: false, pdfSignedUrl: null, notFound: true };
    }

    const rec = report as Record<string, unknown>;
    const dbToken = typeof rec.access_token === "string" ? rec.access_token.trim() : "";

    if (dbToken && viewerToken) {
      const normalizedViewer = decodeURIComponent(viewerToken).trim();
      if (dbToken !== normalizedViewer) {
        return { id: reportId, status: null, title: null, payload: null, hasPdf: false, pdfSignedUrl: null, accessDenied: true };
      }

      if (
        rec.token_expires_at != null &&
        String(rec.token_expires_at) !== "" &&
        new Date(String(rec.token_expires_at)) < new Date()
      ) {
        return { id: reportId, status: null, title: null, payload: null, hasPdf: false, pdfSignedUrl: null, accessDenied: true };
      }
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

    // Pas d'appel Storage ici : createSignedUrl bloque parfois le SSR indéfiniment.
    // L'URL signée est chargée côté client (ZeroDraftReportComposer → /api/regenerate-signed-url).
    let pdfSignedUrl: string | null = null;
    if (pdfUrl && pdfUrl.startsWith("http")) {
      pdfSignedUrl = pdfUrl;
    }

    const status = typeof rec.status === "string" ? rec.status : null;

    return { id: reportId, status, title, payload, hasPdf, pdfSignedUrl };
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return { id: reportId, status: null, title: null, payload: null, hasPdf: false, pdfSignedUrl: null, serverError: message };
  }
}

=======
>>>>>>> b65d71e3f50a98d131b2aca2629e6513dcf8a05c
export default async function Page({ params, searchParams }: Props) {
  const { id } = await params;
  const sp = await searchParams;
  const rawToken = sp.token;
  const viewerToken = Array.isArray(rawToken) ? rawToken[0] : rawToken;

<<<<<<< HEAD
  const reportData = await loadReport(id, viewerToken?.trim());
=======
  const reportData = await loadReportForViewer(id, viewerToken?.trim());
>>>>>>> b65d71e3f50a98d131b2aca2629e6513dcf8a05c

  if (reportData.notFound) {
    return (
      <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6 lg:px-8">
        <header className="mb-8">
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">
            Inspect<span className="text-blue-600">Flow</span>
          </h1>
        </header>
        <div className="rounded-xl border border-red-200 bg-red-50 p-6 text-center">
          <p className="text-lg font-semibold text-red-800">Rapport introuvable</p>
          <p className="mt-2 text-sm text-red-700">
            Aucun rapport ne correspond à l&apos;identifiant <code className="font-mono">{id.slice(0, 8)}…</code>.
            Vérifiez l&apos;URL reçue.
          </p>
        </div>
      </div>
    );
  }

  if (reportData.accessDenied) {
    return (
      <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6 lg:px-8">
        <header className="mb-8">
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">
            Inspect<span className="text-blue-600">Flow</span>
          </h1>
        </header>
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-6 text-center">
          <p className="text-lg font-semibold text-amber-800">Accès refusé</p>
          <p className="mt-2 text-sm text-amber-700">
            Le jeton d&apos;accès est invalide ou expiré. Utilisez le lien complet reçu par courriel.
          </p>
        </div>
      </div>
    );
  }

  if (reportData.serverError) {
    return (
      <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6 lg:px-8">
        <header className="mb-8">
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">
            Inspect<span className="text-blue-600">Flow</span>
          </h1>
        </header>
        <div className="rounded-xl border border-red-200 bg-red-50 p-6 text-center">
          <p className="text-lg font-semibold text-red-800">Erreur serveur</p>
          <p className="mt-2 text-sm text-red-700">{reportData.serverError}</p>
        </div>
      </div>
    );
  }
<<<<<<< HEAD
=======

  const tokenQ = viewerToken?.trim();
  const couvertureBaseHref = `/rapport/couverture?report=${encodeURIComponent(id)}${tokenQ ? `&token=${encodeURIComponent(tokenQ)}` : ""}`;
  const reportSelfHref = `/report/${encodeURIComponent(id)}${tokenQ ? `?token=${encodeURIComponent(tokenQ)}` : ""}`;
  const reportPayload =
    reportData.payload && typeof reportData.payload === "object"
      ? (reportData.payload as Record<string, unknown>)
      : null;
  const coverRaw = reportPayload?.cover_v1;
>>>>>>> b65d71e3f50a98d131b2aca2629e6513dcf8a05c

  return (
    <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6 lg:px-8">
      <header className="mb-8">
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">
            Inspect<span className="text-blue-600">Flow</span>
          </h1>
          <span className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-0.5 text-xs font-medium text-slate-600">
            Rapport
          </span>
        </div>
        <p className="mt-2 text-sm text-slate-600">
          Générez un rapport complet, bilingue et traçable — sans rédaction manuelle.
        </p>
      </header>
<<<<<<< HEAD
=======
      <Suspense
        fallback={
          <div className="mb-6 h-24 animate-pulse rounded-xl border border-slate-200 bg-slate-50" />
        }
      >
        <ReportPageReadiness
          reportId={id}
          coverRaw={coverRaw}
          reportPayload={reportPayload}
          photoCount={reportData.photoCountForReadiness}
          couvertureBaseHref={couvertureBaseHref}
          reportSelfHref={reportSelfHref}
          viewerAccessToken={viewerToken?.trim() || undefined}
          simpleMode
        />
      </Suspense>
>>>>>>> b65d71e3f50a98d131b2aca2629e6513dcf8a05c
      <ZeroDraftReportComposer
        reportId={id}
        viewerToken={viewerToken?.trim() || undefined}
        initialData={reportData}
      />
    </div>
  );
}
