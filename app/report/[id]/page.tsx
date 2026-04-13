import type { Metadata } from "next";
import ZeroDraftReportComposer from "@/components/ZeroDraftReportComposer";

type Props = { params: Promise<{ id: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  return { title: `Rapport ${id.slice(0, 8)}…` };
}

export default async function Page({ params }: Props) {
  const { id } = await params;

  return (
    <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6 lg:px-8">
      <header className="mb-8">
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">
            Inspect<span className="text-blue-600">Flow</span>
          </h1>
          <span className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-0.5 text-xs font-medium text-slate-600">
            Rapport
          </span>
        </div>
        <p className="mt-2 text-sm text-slate-600">
          Générez un rapport complet, bilingue et traçable — sans rédaction manuelle.
        </p>
      </header>
      <ZeroDraftReportComposer reportId={id} />
    </div>
  );
}
