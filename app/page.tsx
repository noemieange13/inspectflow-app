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
          Votre assistant terrain intelligent — photos, constats IA et rapport PDF en un flux
          simple.
        </p>

        <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:justify-center">
          <Link
            href="/dashboard/simple"
            className="inline-flex min-h-[44px] items-center justify-center rounded-lg bg-blue-600 px-6 py-2.5 text-base font-semibold text-white shadow-sm transition hover:bg-blue-700"
          >
            Mes inspections
          </Link>
        </div>

        <p className="mt-6 text-xs text-slate-400">
          <Link href="/dashboard" className="underline hover:text-slate-600">
            Espace administration
          </Link>
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
