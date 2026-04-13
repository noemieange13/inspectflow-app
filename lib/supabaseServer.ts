import { createClient } from "@supabase/supabase-js";

export async function createServerClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !key) {
    throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY");
  }

  return createClient(url, key, {
    auth: { persistSession: false },
  });
}

/**
 * Contourne le RLS — uniquement dans du code serveur (Server Components, Route Handlers).
 * Utilise `SUPABASE_SERVICE_ROLE_KEY` — jamais `NEXT_PUBLIC_*` pour cette clé.
 */
export async function createServiceRoleClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !key) {
    throw new Error(
      "Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY",
    );
  }
  if (anon && key === anon) {
    // #region agent log
    fetch("http://127.0.0.1:7625/ingest/93e0adad-2739-42ed-bed5-4fa06fb3b9b7", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Debug-Session-Id": "0c2b62",
      },
      body: JSON.stringify({
        sessionId: "0c2b62",
        runId: "ui-zero-draft-debug-4",
        hypothesisId: "H10",
        location: "lib/supabaseServer.ts:createServiceRoleClient",
        message: "service key equals anon key",
        data: { hasAnon: true, hasService: true, same: true },
        timestamp: Date.now(),
      }),
    }).catch(() => {});
    // #endregion
    throw new Error(
      "SUPABASE_SERVICE_ROLE_KEY is misconfigured: it matches NEXT_PUBLIC_SUPABASE_ANON_KEY",
    );
  }

  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
