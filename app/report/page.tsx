"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export default function ReportIndexPage() {
  const router = useRouter();
  const [reportId, setReportId] = useState("");
  const [token, setToken] = useState("");
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const id = reportId.trim();
    if (!id) {
      setError("Veuillez entrer l'identifiant du rapport.");
      return;
    }
    const t = token.trim();
    const url = t
      ? `/report/${encodeURIComponent(id)}?token=${encodeURIComponent(t)}`
      : `/report/${encodeURIComponent(id)}`;
    router.push(url);
  };

  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-gradient-to-b from-slate-50 to-white px-6 py-16">
      <div className="mx-auto w-full max-w-md">
        <div className="text-center">
          <h1 className="text-3xl font-bold tracking-tight text-slate-900">
            Inspect<span className="text-blue-600">Flow</span>
          </h1>
          <p className="mt-2 text-sm text-slate-600">
            Accédez à votre rapport d&apos;inspection
          </p>
        </div>

        <form
          onSubmit={handleSubmit}
          className="mt-8 space-y-4 rounded-xl border border-slate-200 bg-white p-6 shadow-sm"
        >
          <label className="block text-sm font-medium text-slate-700">
            Identifiant du rapport
            <input
              type="text"
              value={reportId}
              onChange={(e) => {
                setReportId(e.target.value);
                setError(null);
              }}
              placeholder="ex. b7dc542f-6783-40e2-81d0-c194b2f4feb8"
              className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 font-mono text-sm text-slate-900 placeholder:text-slate-400 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
              autoComplete="off"
            />
          </label>

          <label className="block text-sm font-medium text-slate-700">
            Jeton d&apos;accès (token)
            <input
              type="text"
              value={token}
              onChange={(e) => {
                setToken(e.target.value);
                setError(null);
              }}
              placeholder="ex. a1b2c3d4-..."
              className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 font-mono text-sm text-slate-900 placeholder:text-slate-400 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
              autoComplete="off"
            />
          </label>

          {error ? (
            <p className="text-sm text-red-600">{error}</p>
          ) : null}

          <button
            type="submit"
            className="w-full rounded-lg bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-slate-800"
          >
            Ouvrir le rapport
          </button>

          <p className="text-center text-xs text-slate-500">
            Collez l&apos;URL complète reçue par courriel ou utilisez les champs ci-dessus.
            <br />
            Format attendu :{" "}
            <code className="font-mono text-slate-600">
              /report/&lt;id&gt;?token=&lt;jeton&gt;
            </code>
          </p>
          <p className="mt-4 rounded-lg border border-amber-100 bg-amber-50 px-3 py-2 text-left text-xs text-amber-900">
            <span className="font-semibold">Test terrain :</span> un rapport déjà finalisé en base ne
            pourra pas être régénéré ici — demandez un{" "}
            <strong>nouveau lien</strong> (nouvelle inspection) ou déverrouillez la ligne dans Supabase.
          </p>
        </form>
      </div>
    </main>
  );
}
