import { notFound } from "next/navigation";

import { SteveValidationClient } from "./SteveValidationClient";

/** Dev only — validation clone rapport Steve vs InspectFlow (Phase 8W). */
export default function SteveValidationDevPage() {
  if (process.env.NODE_ENV !== "development") {
    notFound();
  }

  return (
    <main className="mx-auto max-w-5xl p-8">
      <h1 className="mb-2 text-lg font-semibold">Dev — validation clone Steve (8W)</h1>
      <p className="mb-6 text-sm text-foreground/70">
        Compare un ancien rapport Steve (texte) avec un rapport InspectFlow généré. Read-only —
        aucune écriture production.
      </p>
      <SteveValidationClient />
    </main>
  );
}
