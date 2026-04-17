import Link from "next/link";

export default function HomePage() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-gradient-to-b from-slate-50 to-white px-6 py-16">
      <div className="mx-auto max-w-lg text-center">
        <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-4 py-1.5 text-xs font-medium text-slate-600 shadow-sm">
          Inspection de bâtiments — Canada
        </div>

        <h1 className="text-4xl font-bold tracking-tight text-slate-900 sm:text-5xl">
          Inspect<span className="text-blue-600">Flow</span>
        </h1>

        <p className="mt-4 text-base leading-relaxed text-slate-600">
          Rapports d&apos;inspection professionnels générés automatiquement.
          Bilingue FR/EN, conforme aux pratiques canadiennes, livré en PDF sécurisé.
        </p>

        <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:justify-center">
          <Link
            href="/dashboard"
            className="inline-flex items-center justify-center rounded-lg bg-slate-900 px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-slate-800"
          >
            Tableau de bord
          </Link>
          <Link
            href="/report"
            className="inline-flex items-center justify-center rounded-lg border border-slate-300 bg-white px-5 py-2.5 text-sm font-semibold text-slate-700 shadow-sm transition hover:bg-slate-50"
          >
            Accéder à un rapport
          </Link>
          <Link
            href="/rapport/couverture"
            className="inline-flex items-center justify-center rounded-lg border border-blue-200 bg-blue-50 px-5 py-2.5 text-sm font-semibold text-blue-900 shadow-sm transition hover:bg-blue-100"
          >
            Nouveau — formulaire couverture
          </Link>
        </div>

        <div className="mt-12 grid grid-cols-3 gap-6 text-center">
          <div>
            <p className="text-2xl font-bold text-slate-900">0 min</p>
            <p className="mt-1 text-xs text-slate-500">Rédaction manuelle</p>
          </div>
          <div>
            <p className="text-2xl font-bold text-slate-900">FR/EN</p>
            <p className="mt-1 text-xs text-slate-500">Bilingue natif</p>
          </div>
          <div>
            <p className="text-2xl font-bold text-slate-900">PDF</p>
            <p className="mt-1 text-xs text-slate-500">Sécurisé & signé</p>
          </div>
        </div>

        <p className="mt-12 text-xs text-slate-400">
          CNB · Codes provinciaux · CSA · Pratiques d&apos;inspection canadiennes
        </p>

        {process.env.NODE_ENV === "development" ? (
          <div className="mt-4 flex flex-col gap-1">
            <Link href="/dev/create-report" className="text-xs text-slate-400 underline">
              Dev — créer un rapport (flux complet)
            </Link>
            <Link href="/dev/reports-pdf" className="text-xs text-slate-400 underline">
              Dev — test PDF Edge
            </Link>
          </div>
        ) : null}
      </div>
    </main>
  );
}
