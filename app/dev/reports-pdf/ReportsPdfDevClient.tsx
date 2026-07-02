"use client";

import { createClient } from "@supabase/supabase-js";
import { useCallback, useState } from "react";

const DEFAULT_REPORT_ID = "b7dc542f-6783-40e2-81d0-c194b2f4feb8";

/**
 * Test `supabase.functions.invoke("reports-pdf")` avec la clé **anon** (comme demandé pour le debug).
 * Le résultat est affiché + loggé dans la console (F12).
 */
export function ReportsPdfDevClient() {
  const [reportId, setReportId] = useState(DEFAULT_REPORT_ID);
  const [out, setOut] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const run = useCallback(async () => {
    setLoading(true);
    setOut(null);
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    if (!url || !key) {
      setOut(
        JSON.stringify(
          {
            error:
              "NEXT_PUBLIC_SUPABASE_URL ou NEXT_PUBLIC_SUPABASE_ANON_KEY manquant dans .env.local",
          },
          null,
          2,
        ),
      );
      setLoading(false);
      return;
    }

    const supabase = createClient(url, key);
    const { data, error } = await supabase.functions.invoke("reports-pdf", {
      body: { report_id: reportId.trim() },
    });
    const payload = { data, error };
    console.log("RESULT:", payload);
    setOut(JSON.stringify(payload, null, 2));
    setLoading(false);
  }, [reportId]);

  return (
    <div className="space-y-4">
      <label className="block text-sm">
        <span className="text-foreground/80">report_id</span>
        <input
          className="mt-1 block w-full max-w-2xl rounded border border-foreground/20 bg-background px-2 py-1.5 font-mono text-sm"
          value={reportId}
          onChange={(e) => setReportId(e.target.value)}
          autoComplete="off"
        />
      </label>
      <button
        type="button"
        onClick={run}
        disabled={loading}
        className="rounded border border-foreground/20 bg-background px-4 py-2 text-sm hover:bg-foreground/5 disabled:opacity-50"
      >
        {loading ? "Appel…" : "Invoquer reports-pdf (anon) + afficher le résultat"}
      </button>
      {out ? (
        <pre className="max-h-[70vh] overflow-auto rounded border border-foreground/15 bg-foreground/[0.03] p-4 text-xs">
          {out}
        </pre>
      ) : null}
    </div>
  );
}
