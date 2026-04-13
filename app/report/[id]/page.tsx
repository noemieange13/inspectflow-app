import ZeroDraftReportComposer from "@/components/ZeroDraftReportComposer";

export default function Page({ params }: { params: { id: string } }) {
  const id = params.id;

  return (
    <div className="p-6">
      <h1 className="mb-1 text-2xl font-bold text-slate-900">Rapport {id}</h1>
      <p className="mb-6 text-sm text-slate-600">
        Objectif: generer un rapport complet sans redaction manuelle longue.
      </p>
      <ZeroDraftReportComposer reportId={id} />
    </div>
  );
}