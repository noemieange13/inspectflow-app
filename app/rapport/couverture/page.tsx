import type { Metadata } from "next";
import Link from "next/link";

import InspectionCoverForm from "@/components/InspectionCoverForm";
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

export default async function CouverturePage({ searchParams }: Props) {
  const sp = await searchParams;
  const rawReport = sp.report;
  const reportId = (Array.isArray(rawReport) ? rawReport[0] : rawReport)?.trim() ?? "";
  const rawToken = sp.token;
  const token = Array.isArray(rawToken) ? rawToken[0] : rawToken;
  const viewerToken = token?.trim() ?? "";

  if (reportId && viewerToken) {
    const reportData = await loadReportForViewer(reportId, viewerToken);

    if (reportData.notFound) {
      return (
        <div className="mx-auto min-h-screen max-w-4xl px-4 py-10 sm:px-6">
          <p className="text-lg font-semibold text-red-800">Rapport introuvable</p>
          <p className="mt-2 text-sm text-red-700">
            Vérifiez les paramètres <code className="font-mono">report</code> et{" "}
            <code className="font-mono">token</code> dans l&apos;URL.
          </p>
          <Link href="/rapport/couverture" className="mt-4 inline-block text-sm text-blue-600 underline">
            Ouvrir le formulaire sans liaison
          </Link>
        </div>
      );
    }

    if (reportData.accessDenied) {
      return (
        <div className="mx-auto min-h-screen max-w-4xl px-4 py-10 sm:px-6">
          <p className="text-lg font-semibold text-amber-800">Accès refusé</p>
          <p className="mt-2 text-sm text-amber-800">
            Jeton invalide ou expiré. Utilisez le lien complet depuis la page rapport (bouton copier le lien).
          </p>
          <Link href="/rapport/couverture" className="mt-4 inline-block text-sm text-blue-600 underline">
            Ouvrir le formulaire sans liaison
          </Link>
        </div>
      );
    }

    if (reportData.serverError) {
      return (
        <div className="mx-auto min-h-screen max-w-4xl px-4 py-10 sm:px-6">
          <p className="text-lg font-semibold text-red-800">Erreur</p>
          <p className="mt-2 text-sm text-red-700">{reportData.serverError}</p>
        </div>
      );
    }

    const payload = reportData.payload;
    const initialCover = payload ? parseCoverV1FromUnknown(payload.cover_v1) : null;
    const initialProf = payload
      ? parseInspectorProfileFromUnknown(payload[INSPECTOR_PROFILE_PAYLOAD_KEY])
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
            Création du rapport — <span className="text-blue-600">couverture & en-tête</span>
          </h1>
          <p className="mt-2 text-sm text-slate-600">
            Champs alignés sur ton modèle Word. Enregistrement possible sur le rapport lié ; le PDF reprendra cette
            section à la prochaine génération.
          </p>
        </header>
        <InspectionCoverForm
          reportId={reportId}
          viewerToken={viewerToken}
          initialCoverFromReport={initialCover ?? undefined}
          initialInspectorProfileFromReport={initialProf ?? undefined}
        />
      </div>
    );
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
          Création du rapport — <span className="text-blue-600">couverture & en-tête</span>
        </h1>
        <p className="mt-2 text-sm text-slate-600">
          Champs alignés sur ton modèle Word (requérant, propriété, description sommaire, condition générale,
          orientation). Les champs auto (météo, date) restent modifiables.
        </p>
        <p className="mt-3 text-sm text-slate-500">
          Pour lier ce formulaire à un rapport existant, ouvrez-le depuis la page rapport avec{" "}
          <code className="rounded bg-slate-100 px-1 font-mono text-xs">
            /rapport/couverture?report=RAPPORT_ID&token=JETON
          </code>{" "}
          (même jeton que le viewer).
        </p>
      </header>
      <InspectionCoverForm />
    </div>
  );
}
