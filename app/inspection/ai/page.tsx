import { Suspense } from "react";

import AIInspectionPageClient from "@/components/AIInspectionPageClient";
import { loadReportForViewer } from "@/lib/reportViewerServer";

export const dynamic = "force-dynamic";

type Props = {
  searchParams: Promise<{
    reportId?: string | string[];
    inspection_id?: string | string[];
    token?: string | string[];
  }>;
};

function pickParam(value: string | string[] | undefined): string | undefined {
  if (Array.isArray(value)) return value[0];
  return value;
}

export default async function AIInspectionPage({ searchParams }: Props) {
  const sp = await searchParams;
  const reportId =
    pickParam(sp.reportId)?.trim() ??
    pickParam(sp.inspection_id)?.trim() ??
    "";
  const viewerToken = pickParam(sp.token)?.trim();

  if (!reportId) {
    return (
      <div className="mx-auto max-w-lg px-4 py-8">
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-6 text-center">
          <p className="text-lg font-semibold text-amber-900">Inspection requise</p>
          <p className="mt-2 text-sm text-amber-800">
            Créez une inspection depuis le tableau de bord (« Nouvelle inspection IA »).
          </p>
          <a
            href="/dashboard/simple"
            className="mt-4 inline-flex min-h-[44px] items-center justify-center rounded-xl bg-blue-600 px-4 text-sm font-semibold text-white"
          >
            Retour au tableau de bord
          </a>
        </div>
      </div>
    );
  }

  const reportData = await loadReportForViewer(reportId, viewerToken);

  if (reportData.notFound) {
    return (
      <div className="mx-auto max-w-lg px-4 py-8">
        <div className="rounded-xl border border-red-200 bg-red-50 p-6 text-center">
          <p className="text-lg font-semibold text-red-800">Inspection introuvable</p>
        </div>
      </div>
    );
  }

  if (reportData.accessDenied) {
    return (
      <div className="mx-auto max-w-lg px-4 py-8">
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-6 text-center">
          <p className="text-lg font-semibold text-amber-800">Accès refusé</p>
          <p className="mt-2 text-sm text-amber-700">Utilisez le lien complet avec jeton.</p>
        </div>
      </div>
    );
  }

  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center bg-slate-50 text-sm text-slate-500">
          Chargement…
        </div>
      }
    >
      <AIInspectionPageClient
        reportId={reportId}
        viewerToken={viewerToken}
        reportData={reportData}
      />
    </Suspense>
  );
}
