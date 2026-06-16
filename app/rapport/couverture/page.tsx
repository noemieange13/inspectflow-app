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
  return Array.isArray(value) ? (value[0] ?? "") : (value ?? "");
}

export default async function CouverturePage({ searchParams }: Props) {
  const sp = await searchParams;
  const reportId = firstParam(sp.report).trim();
  const viewerToken = firstParam(sp.token).trim();

  let form = <InspectionCoverFormHydrated />;

  if (reportId) {
    const report = await loadReportForViewer(reportId, viewerToken || undefined);

    if (report.notFound || report.accessDenied || report.serverError) {
      const message = report.notFound
        ? "Rapport introuvable."
        : report.accessDenied
          ? "Jeton d'accès invalide ou manquant. Ouvrez la couverture depuis le lien complet du rapport."
          : report.serverError ?? "Erreur serveur.";

      form = (
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-6 text-sm font-medium text-amber-900">
          {message}
        </div>
      );
    } else {
      const payload =
        report.payload && typeof report.payload === "object"
          ? (report.payload as Record<string, unknown>)
          : {};
      form = (
        <InspectionCoverFormHydrated
          reportId={reportId}
          viewerToken={viewerToken || undefined}
          reportHasPdf={report.hasPdf}
          initialCoverFromReport={parseCoverV1FromUnknown(payload.cover_v1)}
          initialInspectorProfileFromReport={parseInspectorProfileFromUnknown(
            payload[INSPECTOR_PROFILE_PAYLOAD_KEY],
          )}
        />
      );
    }
  }

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
      {form}
    </div>
  );
}
