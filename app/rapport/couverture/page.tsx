import type { Metadata } from "next";
import Link from "next/link";
import type { ReactNode } from "react";
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

function firstQueryValue(value: string | string[] | undefined): string {
  return (Array.isArray(value) ? value[0] : value)?.trim() ?? "";
}

export default async function CouverturePage({ searchParams }: Props) {
  const query = await searchParams;
  const reportId = firstQueryValue(query.report);
  const viewerToken = firstQueryValue(query.token);

  if (reportId && viewerToken) {
    const reportData = await loadReportForViewer(reportId, viewerToken);

    if (reportData.notFound || reportData.accessDenied || reportData.serverError) {
      const accessDenied = reportData.accessDenied;
      const title = accessDenied
        ? "Accès refusé"
        : reportData.notFound
          ? "Rapport introuvable"
          : "Erreur serveur";
      const detail = accessDenied
        ? "Jeton invalide ou expiré. Utilisez le lien complet depuis la page rapport."
        : reportData.notFound
          ? "Vérifiez les paramètres report et token dans l’URL."
          : reportData.serverError;

      return (
        <div className="mx-auto min-h-screen max-w-4xl px-4 py-10 sm:px-6">
          <p className="text-lg font-semibold text-red-800">{title}</p>
          <p className="mt-2 text-sm text-red-700">{detail}</p>
          <Link href="/rapport/couverture" className="mt-4 inline-block text-sm text-blue-600 underline">
            Ouvrir le formulaire sans liaison
          </Link>
        </div>
      );
    }

    const payload = reportData.payload;
    const initialCover = payload ? parseCoverV1FromUnknown(payload.cover_v1) : null;
    const initialInspectorProfile = payload
      ? parseInspectorProfileFromUnknown(payload[INSPECTOR_PROFILE_PAYLOAD_KEY])
      : null;

    return (
      <CoverPageShell linked>
        <InspectionCoverFormHydrated
          reportId={reportId}
          viewerToken={viewerToken}
          reportHasPdf={reportData.hasPdf}
          initialCoverFromReport={initialCover}
          initialInspectorProfileFromReport={initialInspectorProfile}
        />
      </CoverPageShell>
    );
  }

  return (
    <CoverPageShell>
      <InspectionCoverFormHydrated />
    </CoverPageShell>
  );
}

function CoverPageShell({
  children,
  linked = false,
}: {
  children: ReactNode;
  linked?: boolean;
}) {
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
          {linked
            ? "Les modifications sont enregistrées dans le rapport lié et reprises à la prochaine génération PDF."
            : "Champs alignés sur ton modèle Word (requérant, propriété, description sommaire, condition générale, orientation)."}
        </p>
      </header>
      {children}
    </div>
  );
}
