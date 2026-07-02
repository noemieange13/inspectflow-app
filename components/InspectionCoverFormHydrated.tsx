"use client";

import dynamic from "next/dynamic";

import type { InspectionCoverFormProps } from "@/components/InspectionCoverForm";

const InspectionCoverFormNoSSR = dynamic(() => import("@/components/InspectionCoverForm"), {
  ssr: false,
  loading: () => (
    <div className="rounded-lg border border-slate-200 bg-slate-50 p-4 text-sm text-slate-600" role="status">
      Chargement du formulaire couverture…
    </div>
  ),
});

export default function InspectionCoverFormHydrated(props: InspectionCoverFormProps) {
  return <InspectionCoverFormNoSSR {...props} />;
}
