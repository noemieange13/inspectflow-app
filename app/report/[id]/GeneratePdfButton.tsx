"use client";

import { createClient } from "@supabase/supabase-js";
import { useCallback, useState } from "react";

function getBrowserSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return null;
  return createClient(url, key);
}

type Props = { reportId: string };

/**
 * En **dev**, le bouton appelle d’abord `POST /api/dev/invoke-reports-pdf` (service role côté serveur) :
 * c’est le même mécanisme que `lib/triggerInspectionUltimate.ts` et ça contourne les blocages JWT de l’Edge.
 *
 * Tu peux aussi forcer l’appel **direct** `functions.invoke` (anon) — souvent en erreur tant que
 * l’Edge a « Verify JWT » activé dans le dashboard Supabase.
 */
export default function GeneratePdfButton({ reportId }: Props) {
  const [log, setLog] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const runViaServer = useCallback(async () => {
    setLoading(true);
    setLog(null);
    try {
      const res = await fetch("/api/dev/invoke-reports-pdf", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reportId }),
      });
      const json = (await res.json()) as unknown;
      console.log("RESULT (serveur dev):", json);
      setLog(JSON.stringify(json, null, 2));
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setLog(msg);
    } finally {
      setLoading(false);
    }
  }, [reportId]);

  const runViaAnonInvoke = useCallback(async () => {
    setLoading(true);
    setLog(null);
    try {
      const supabase = getBrowserSupabase();
      if (!supabase) {
        setLog(
          "NEXT_PUBLIC_SUPABASE_URL ou NEXT_PUBLIC_SUPABASE_ANON_KEY manquant dans .env.local",
        );
        return;
      }
      const { data, error } = await supabase.functions.invoke("reports-pdf", {
        body: { report_id: reportId },
      });
      const payload = { data, error };
      console.log("RESULT (anon invoke):", payload);
      setLog(JSON.stringify(payload, null, 2));
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setLog(msg);
    } finally {
      setLoading(false);
    }
  }, [reportId]);

  const isDev = process.env.NODE_ENV === "development";

  return (
    <div className="space-y-3">
      {isDev ? (
        <button
          type="button"
          onClick={runViaServer}
          disabled={loading}
          className="rounded border border-foreground/20 px-3 py-2 text-sm disabled:opacity-50"
        >
          {loading ? "…" : "Générer PDF (via serveur — recommandé en dev)"}
        </button>
      ) : null}

      <button
        type="button"
        onClick={runViaAnonInvoke}
        disabled={loading}
        className="rounded border border-foreground/20 px-3 py-2 text-sm disabled:opacity-50"
      >
        {loading ? "…" : "Tester Edge (anon, functions.invoke)"}
      </button>

      <p className="max-w-xl text-xs text-foreground/60">
        Si « anon » échoue avec 401 : dans Supabase → Edge Functions →{" "}
        <code className="font-mono">reports-pdf</code> → désactiver temporairement la vérification
        JWT, ou n’utiliser que le bouton serveur en dev.
      </p>

      {log ? (
        <pre className="max-h-64 overflow-auto rounded border border-foreground/15 bg-foreground/[0.03] p-3 text-xs">
          {log}
        </pre>
      ) : null}
    </div>
  );
}
