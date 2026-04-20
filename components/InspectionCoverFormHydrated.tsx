"use client";

import dynamic from "next/dynamic";

import type { InspectionCoverFormProps } from "@/components/InspectionCoverForm";

const InspectionCoverFormNoSsr = dynamic(() => import("@/components/InspectionCoverForm"), {
  ssr: false,
  loading: () => (
    <div className="rounded-lg border border-slate-200 bg-white px-4 py-3 text-sm text-slate-600">
      Chargement du formulaire couverture…
    </div>
  ),
});

export default function InspectionCoverFormHydrated(props: InspectionCoverFormProps) {
  return <InspectionCoverFormNoSsr {...props} />;
}
