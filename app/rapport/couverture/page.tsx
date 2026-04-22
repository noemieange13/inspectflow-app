import type { Metadata } from "next";
import Link from "next/link";

import InspectionCoverForm from "@/components/InspectionCoverForm";

export const metadata: Metadata = {
  title: "Formulaire couverture — rapport d'inspection",
};

export default function CouverturePage() {
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
      <InspectionCoverForm />
    </div>
  );
}
