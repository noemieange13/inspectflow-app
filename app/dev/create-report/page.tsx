import { notFound } from "next/navigation";
import { CreateReportDevClient } from "./CreateReportDevClient";

export default function DevCreateReportPage() {
  if (process.env.NODE_ENV !== "development") {
    notFound();
  }

  return (
    <main className="mx-auto max-w-3xl p-8">
      <h1 className="mb-2 text-lg font-semibold">
        Dev — Créer un rapport (flux complet)
      </h1>
      <p className="mb-6 text-sm text-slate-600">
        Teste la chaîne complète : <strong>create-report</strong> → <strong>report-content</strong> → <strong>trigger-inspection (PDF)</strong>.
        Les IDs peuvent être auto-résolus depuis la base de données.
      </p>
      <CreateReportDevClient />
    </main>
  );
}
