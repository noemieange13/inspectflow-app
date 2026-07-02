"use client";

import { useMemo, useState } from "react";

import type { SteveReportScore, ValidationStatus } from "@/lib/reportComparison";

type CompareResponse = {
  score: SteveReportScore;
  html_length: number;
  locale: string;
};

const STATUS_LABEL: Record<ValidationStatus, string> = {
  conforme: "🟢 Conforme",
  acceptable: "🟡 Différent mais acceptable",
  manquant: "🔴 Manquant",
};

const SAMPLE_LEGACY = `RAPPORT D'INSPECTION PRÉ-ACHAT
REQUÉRANT(S): Mme Aimée Ina Mahoro
ADRESSE: 49 De Castagne, Gatineau
DATE ET HEURE: 12 juin 2024, 09 h 00
TYPE DE PROPRIÉTÉ: jumelé
ANNÉE DE CONSTRUCTION: 1990
DESCRIPTION SOMMAIRE DU BÂTIMENT
TYPE DE MAISON: jumelé
CONSTRUIT EN: 1990
Photo panneau électrique — section Électricité
Photo plancher salon — section Intérieur`;

export function SteveValidationClient() {
  const [legacyText, setLegacyText] = useState(SAMPLE_LEGACY);
  const [payloadText, setPayloadText] = useState("");
  const [result, setResult] = useState<CompareResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const scoreColor = useMemo(() => {
    if (!result) return "text-foreground/70";
    if (result.score.ready_for_client) return "text-green-700";
    if (result.score.overall_score >= 85) return "text-amber-700";
    return "text-red-700";
  }, [result]);

  async function runComparison(useSamplePayload: boolean) {
    setLoading(true);
    setError(null);
    setResult(null);

    try {
      let payload: Record<string, unknown>;
      if (useSamplePayload) {
        const mod = await import("@/lib/reportComparison/sampleSteveValidationPayload");
        payload = mod.buildSampleSteveValidationPayload();
      } else {
        payload = JSON.parse(payloadText) as Record<string, unknown>;
      }

      const res = await fetch("/api/dev/steve-validation", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          payload,
          legacy: { text: legacyText },
          locale: "fr-CA",
        }),
      });

      const data = (await res.json()) as CompareResponse & { error?: string };
      if (!res.ok) {
        throw new Error(data.error ?? `HTTP ${res.status}`);
      }
      setResult(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-6">
      <section className="rounded-lg border border-border p-4">
        <h2 className="mb-2 text-sm font-semibold">Ancien rapport Steve (texte extrait)</h2>
        <textarea
          className="min-h-[160px] w-full rounded border border-border bg-background p-3 font-mono text-xs"
          value={legacyText}
          onChange={(e) => setLegacyText(e.target.value)}
        />
      </section>

      <section className="rounded-lg border border-border p-4">
        <h2 className="mb-2 text-sm font-semibold">Nouveau rapport InspectFlow (payload JSON)</h2>
        <p className="mb-2 text-xs text-foreground/60">
          Laissez vide et utilisez « Charger échantillon » pour un payload Steve complet.
        </p>
        <textarea
          className="min-h-[120px] w-full rounded border border-border bg-background p-3 font-mono text-xs"
          value={payloadText}
          onChange={(e) => setPayloadText(e.target.value)}
          placeholder='{"cover_v1": {...}, "sections": [...]}'
        />
        <div className="mt-3 flex flex-wrap gap-2">
          <button
            type="button"
            className="rounded bg-primary px-3 py-1.5 text-sm text-primary-foreground disabled:opacity-50"
            disabled={loading}
            onClick={() => runComparison(true)}
          >
            {loading ? "Comparaison…" : "Comparer (échantillon InspectFlow)"}
          </button>
          <button
            type="button"
            className="rounded border border-border px-3 py-1.5 text-sm disabled:opacity-50"
            disabled={loading || !payloadText.trim()}
            onClick={() => runComparison(false)}
          >
            Comparer payload collé
          </button>
        </div>
      </section>

      {error ? (
        <p className="rounded border border-red-300 bg-red-50 p-3 text-sm text-red-800">{error}</p>
      ) : null}

      {result ? (
        <section className="space-y-4 rounded-lg border border-border p-4">
          <div>
            <h2 className="text-sm font-semibold">Score Steve</h2>
            <p className={`text-2xl font-bold ${scoreColor}`}>
              {result.score.overall_score}% —{" "}
              {result.score.ready_for_client ? "Prêt client" : "Revue requise"}
            </p>
            <p className="text-xs text-foreground/60">
              Structure {result.score.structure_match}% · Contenu {result.score.content_match}% ·
              HTML {result.html_length.toLocaleString()} car.
            </p>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide">Structure</h3>
              <ul className="space-y-1 text-sm">
                {result.score.structure_checks.map((row) => (
                  <li key={row.code}>
                    {STATUS_LABEL[row.status]} — {row.label}
                  </li>
                ))}
              </ul>
            </div>
            <div>
              <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide">
                Clauses verrouillées
              </h3>
              <ul className="space-y-1 text-sm">
                {result.score.locked_clauses.map((row) => (
                  <li key={row.clause_id}>
                    {row.present ? "🟢" : "🔴"} {row.label}
                  </li>
                ))}
              </ul>
            </div>
          </div>

          {result.score.warnings.length > 0 ? (
            <div>
              <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide">Avertissements</h3>
              <ul className="list-disc space-y-1 pl-5 text-sm text-amber-900">
                {result.score.warnings.slice(0, 12).map((w) => (
                  <li key={w}>{w}</li>
                ))}
              </ul>
            </div>
          ) : null}

          <div>
            <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide">Photos legacy</h3>
            <ul className="space-y-1 text-sm">
              {result.score.photo_mapping_results.map((row) => (
                <li key={row.legacy_label}>
                  {STATUS_LABEL[row.status]} — {row.legacy_label}: {row.message}
                </li>
              ))}
            </ul>
          </div>
        </section>
      ) : null}
    </div>
  );
}
