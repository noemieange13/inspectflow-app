import type { Metadata } from "next";
import DevelopmentDraftBanner from "@/components/DevelopmentDraftBanner";
import ReportFieldPageClient from "@/components/ReportFieldPageClient";
import { resolveReportForViewer } from "@/lib/reportViewerServer";

export type { ReportServerData } from "@/lib/reportViewerServer";
type Props = {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ token?: string | string[]; offline?: string | string[] }>;
};

function parseOfflineFlag(raw: string | string[] | undefined): boolean {
  const value = Array.isArray(raw) ? raw[0] : raw;
  return value === "1" || value === "true";
}

export async function generateMetadata({ params, searchParams }: Props): Promise<Metadata> {
  const { id } = await params;
  const sp = await searchParams;
  if (parseOfflineFlag(sp.offline)) {
    return { title: `Development Draft — ${id.slice(0, 8)}…` };
  }
  return { title: `Inspection — ${id.slice(0, 8)}…` };
}

export default async function Page({ params, searchParams }: Props) {
  const { id } = await params;
  const sp = await searchParams;
  const rawToken = sp.token;
  const viewerToken = Array.isArray(rawToken) ? rawToken[0] : rawToken;
  const offlineQuery = parseOfflineFlag(sp.offline);

  const reportData = await resolveReportForViewer(id, viewerToken?.trim(), {
    offlineQuery,
  });

  if (reportData.notFound) {
    return (
      <div className="mx-auto max-w-lg px-4 py-8">
        <div className="rounded-xl border border-red-200 bg-red-50 p-6 text-center">
          <p className="text-lg font-semibold text-red-800">Inspection introuvable</p>
          <p className="mt-2 text-sm text-red-700">Vérifiez l&apos;URL reçue.</p>
        </div>
      </div>
    );
  }

  if (reportData.accessDenied) {
    return (
      <div className="mx-auto max-w-lg px-4 py-8">
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-6 text-center">
          <p className="text-lg font-semibold text-amber-800">Accès refusé</p>
          <p className="mt-2 text-sm text-amber-700">
            Utilisez le lien complet reçu par courriel.
          </p>
        </div>
      </div>
    );
  }

  if (reportData.serverError) {
    return (
      <div className="mx-auto max-w-lg px-4 py-8">
        <div className="rounded-xl border border-red-200 bg-red-50 p-6 text-center">
          <p className="text-lg font-semibold text-red-800">Erreur serveur</p>
          <p className="mt-2 text-sm text-red-700">{reportData.serverError}</p>
        </div>
      </div>
    );
  }

  const tokenQ = viewerToken?.trim();
  const offlineQ = reportData.offlineDev ? "&offline=1" : "";
  const couvertureBaseHref = `/rapport/couverture?report=${encodeURIComponent(id)}${tokenQ ? `&token=${encodeURIComponent(tokenQ)}` : ""}${offlineQ}`;
  const reportSelfHref = `/report/${encodeURIComponent(id)}${tokenQ ? `?token=${encodeURIComponent(tokenQ)}${offlineQ}` : offlineQ ? `?offline=1` : ""}`;
  const coverRaw =
    reportData.payload && typeof reportData.payload === "object"
      ? (reportData.payload as Record<string, unknown>).cover_v1
      : null;

  return (
    <>
      {reportData.offlineDev ? <DevelopmentDraftBanner /> : null}
      <ReportFieldPageClient
        reportId={id}
        viewerToken={tokenQ}
        reportData={reportData}
        coverRaw={coverRaw}
        couvertureBaseHref={couvertureBaseHref}
        reportSelfHref={reportSelfHref}
        photoCount={reportData.photoCountForReadiness}
      />
    </>
  );
}
