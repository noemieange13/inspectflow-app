import { notFound } from "next/navigation";

import { isPilotObservabilityDashboardEnabled } from "@/lib/pilotObservabilityAccess";

import StevePilotSummaryClient from "./StevePilotSummaryClient";

/** Dev / flag only — résumé observabilité pilote Steve (Phase 9A). */
export default function StevePilotSummaryPage() {
  if (!isPilotObservabilityDashboardEnabled()) {
    notFound();
  }

  return (
    <main className="mx-auto max-w-4xl p-8">
      <h1 className="mb-2 text-lg font-semibold">Dev — observabilité pilote Steve (9A)</h1>
      <p className="mb-6 text-sm text-foreground/70">
        Résumé agrégé depuis le localStorage du navigateur. Données anonymes — voir aussi{" "}
        <code className="text-xs">docs/steve-pilot-feedback.md</code>.
      </p>
      <StevePilotSummaryClient />
    </main>
  );
}
