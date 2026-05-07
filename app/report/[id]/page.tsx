import type { Metadata } from "next";
import { Suspense } from "react";
import ReportPageReadiness from "@/components/ReportPageReadiness";
import ZeroDraftReportComposer from "@/components/ZeroDraftReportComposer";
import { loadReportForViewer } from "@/lib/reportViewerServer";

export type { ReportServerData } from "@/lib/reportViewerServer";
type Props = {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ token?: string | string[] }>;
};

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  return { title: `Rapport ${id.slice(0, 8)}…` };
}

export default async function Page({ params, searchParams }: Props) {
  const { id } = await params;
  const sp = await searchParams;
  const rawToken = sp.token;
  const viewerToken = Array.isArray(rawToken) ? rawToken[0] : rawToken;

  const reportData = await loadReportForViewer(id, viewerToken?.trim());

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

  const tokenQ = viewerToken?.trim();
  const couvertureBaseHref = `/rapport/couverture?report=${encodeURIComponent(id)}${tokenQ ? `&token=${encodeURIComponent(tokenQ)}` : ""}`;
  const reportSelfHref = `/report/${encodeURIComponent(id)}${tokenQ ? `?token=${encodeURIComponent(tokenQ)}` : ""}`;
  const reportPayload =
    reportData.payload && typeof reportData.payload === "object"
      ? (reportData.payload as Record<string, unknown>)
      : null;
  const coverRaw = reportPayload?.cover_v1;

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
      <ZeroDraftReportComposer
        reportId={id}
        viewerToken={viewerToken?.trim() || undefined}
        initialData={reportData}
      />
    </div>
  );
}
