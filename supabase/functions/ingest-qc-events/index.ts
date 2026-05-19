/**
 * Ingestion batch d’événements QC (Edge) — même schéma que POST /api/qc-events.
 * Secrets : SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
 * Header : x-ingest-secret doit égaler INGEST_QC_EVENTS_SECRET.
 */
import { createClient } from "npm:@supabase/supabase-js@2";

const JSON_HDR = {
  "Content-Type": "application/json; charset=utf-8",
} as const;

function json(body: Record<string, unknown>, status: number): Response {
  return new Response(JSON.stringify(body), { status, headers: JSON_HDR });
}

type Row = {
  report_id: string;
  event_name: string;
  ruleset_id?: string | null;
  suggestion_id?: string | null;
  payload?: Record<string, unknown>;
  before_state?: unknown;
  after_state?: unknown;
};

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") {
    return json({ ok: false, error: "Method not allowed" }, 405);
  }

  const secret = Deno.env.get("INGEST_QC_EVENTS_SECRET");
  const hdr = req.headers.get("x-ingest-secret") ?? "";
  if (!secret || hdr !== secret) {
    return json({ ok: false, error: "Unauthorized" }, 401);
  }

  const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
  const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!SUPABASE_URL || !SERVICE_ROLE) {
    return json({ ok: false, error: "Missing Supabase env" }, 500);
  }

  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return json({ ok: false, error: "Invalid JSON" }, 400);
  }

  const o = body as Record<string, unknown>;
  const events = Array.isArray(o.events) ? (o.events as Row[]) : null;
  if (!events || events.length === 0) {
    return json({ ok: false, error: "events[] required" }, 400);
  }
  if (events.length > 100) {
    return json({ ok: false, error: "Max 100 events" }, 400);
  }

  const rows = events.map((e) => ({
    report_id: e.report_id,
    event_name: e.event_name,
    ruleset_id: e.ruleset_id ?? null,
    suggestion_id: e.suggestion_id ?? null,
    payload: (e.payload ?? {}) as Record<string, unknown>,
    before_state: e.before_state ?? null,
    after_state: e.after_state ?? null,
  }));

  const { error } = await supabase.from("qc_events").insert(rows);
  if (error) {
    return json({ ok: false, error: error.message }, 500);
  }
  return json({ ok: true, inserted: rows.length }, 200);
});
