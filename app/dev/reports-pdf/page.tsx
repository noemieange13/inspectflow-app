import { notFound } from "next/navigation";

import { ReportsPdfDevClient } from "./ReportsPdfDevClient";

/**
 * Page **uniquement en développement** : test `functions.invoke("reports-pdf")` côté client (anon).
 * En prod : 404.
 */
export default function DevReportsPdfPage() {
  if (process.env.NODE_ENV !== "development") {
    notFound();
  }

  return (
    <main className="mx-auto max-w-4xl p-8">
      <h1 className="mb-2 text-lg font-semibold">Dev — test Edge `reports-pdf`</h1>
      <p className="mb-6 text-sm text-foreground/70">
        Utilise la clé <strong>anon</strong> du navigateur. Copie le bloc JSON ci-dessous pour le
        debug. Le même objet est aussi dans la console (<code className="font-mono">RESULT:</code>
        ).
      </p>
      <ReportsPdfDevClient />
    </main>
  );
}
