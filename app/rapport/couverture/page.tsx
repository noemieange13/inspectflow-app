import type { Metadata } from "next";
import Link from "next/link";
import InspectionCoverFormHydrated from "@/components/InspectionCoverFormHydrated";
import {
  INSPECTOR_PROFILE_PAYLOAD_KEY,
  parseCoverV1FromUnknown,
  parseInspectorProfileFromUnknown,
} from "@/lib/inspectionCoverPayload";
import { loadReportForViewer } from "@/lib/reportViewerServer";

export const metadata: Metadata = {
  title: "Formulaire couverture — rapport d'inspection",
};

type Props = {
  searchParams: Promise<{ report?: string | string[]; token?: string | string[] }>;
};

function firstParam(value: string | string[] | undefined): string {
  return Array.isArray(value) ? value[0] ?? "" : value ?? "";
}

export default async function CouverturePage({ searchParams }: Props) {
  const sp = await searchParams;
  const reportId = firstParam(sp.report).trim();
  const viewerToken = firstParam(sp.token).trim();

  const reportData = reportId
    ? await loadReportForViewer(reportId, viewerToken || undefined)
    : null;
  const linkedReportOk =
    !!reportData && !reportData.notFound && !reportData.accessDenied && !reportData.serverError;
  const reportPayload =
    linkedReportOk && reportData.payload && typeof reportData.payload === "object"
      ? reportData.payload
      : null;

  return (
    <div className="mx-auto min-h-screen max-w-4xl px-4 py-10 sm:px-6">
      <nav className="mb-6 text-sm text-slate-500">
        <Link href="/" className="hover:text-slate-800">
          Accueil
        </Link>
        <span className="mx-2">/</span>
        <span className="text-slate-700">Couverture rapport</span>
      </nav>
      <header className="mb-8">
        <h1 className="text-2xl font-bold tracking-tight text-slate-900">
          Création du rapport —{" "}
          <span className="text-blue-600">couverture & en-tête</span>
        </h1>
        <p className="mt-2 text-sm text-slate-600">
          Champs alignés sur ton modèle Word (requérant, propriété, description sommaire, condition générale,
          orientation). Les champs auto (météo, date) restent modifiables.
        </p>
      </header>
      {reportData?.accessDenied ? (
        <div className="mb-6 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
          Jeton d&apos;accès invalide ou expiré. Utilisez le lien complet du rapport pour modifier la couverture.
        </div>
      ) : null}
      {reportData?.notFound ? (
        <div className="mb-6 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">
          Rapport introuvable. Vérifiez le lien reçu.
        </div>
      ) : null}
      {reportData?.serverError ? (
        <div className="mb-6 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">
          {reportData.serverError}
        </div>
      ) : null}
      <InspectionCoverFormHydrated
        reportId={linkedReportOk ? reportId : undefined}
        viewerToken={linkedReportOk ? viewerToken : undefined}
        reportHasPdf={linkedReportOk ? reportData.hasPdf : undefined}
        initialCoverFromReport={parseCoverV1FromUnknown(reportPayload?.cover_v1)}
        initialInspectorProfileFromReport={parseInspectorProfileFromUnknown(
          reportPayload?.[INSPECTOR_PROFILE_PAYLOAD_KEY],
        )}
      />
    </div>
  );
}
