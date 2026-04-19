import { createServiceRoleClient } from "@/lib/supabaseServer";
import type { QcCopilotContext } from "@/lib/qcCopilotContext";
import { qcContextHashFields } from "@/lib/qcContextHash";
import type { QcAiSuggestionStatsRow, QcAiSuggestionStatsV3Row } from "@/lib/qcSuggestionScoring";

type Lookup = { key: string; context?: QcCopilotContext };

/**
 * POST `{ keys: string[] }` — stats V2 uniquement (legacy).
 * POST `{ lookups: { key, context }[] }` — stats V3 par (key, context_hash), résultats dans l’ordre.
 */
export async function POST(req: Request) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return Response.json({ ok: false, error: "Invalid JSON" }, { status: 400 });
  }

  const o = body as Record<string, unknown>;

  const lookups = Array.isArray(o.lookups) ? (o.lookups as Lookup[]) : null;
  if (lookups && lookups.length > 0) {
    const clean = lookups
      .filter((x) => x && typeof x.key === "string" && x.key.trim().length > 0)
      .slice(0, 200)
      .map((x) => ({
        key: x.key.trim(),
        context: x.context && typeof x.context === "object" ? x.context : {},
      }));

    if (clean.length === 0) {
      return Response.json({ ok: true, results: [] as (QcAiSuggestionStatsV3Row | null)[] });
    }

    try {
      const supabase = await createServiceRoleClient();
      const uniqKeys = [...new Set(clean.map((c) => c.key))];
      const { data: batch, error: batchErr } = await supabase
        .from("qc_ai_suggestion_stats_v3")
        .select(
          "key, context_hash, shown_count, applied_count, rejected_count, success_after_apply, disabled, last_applied_at, updated_at",
        )
        .in("key", uniqKeys);

      if (batchErr) {
        if (batchErr.code === "42P01" || batchErr.message?.includes("does not exist")) {
          return Response.json({
            ok: true,
            results: clean.map(() => null) as (QcAiSuggestionStatsV3Row | null)[],
          });
        }
        return Response.json({ ok: false, error: batchErr.message }, { status: 500 });
      }

      const pool = (batch ?? []) as Record<string, unknown>[];
      const results: (QcAiSuggestionStatsV3Row | null)[] = [];

      for (const L of clean) {
        const h = qcContextHashFields(L.context as QcCopilotContext);
        const raw = pool.find((r) => String(r.key) === L.key && String(r.context_hash) === h);
        if (!raw) {
          results.push(null);
          continue;
        }
        results.push({
          key: String(raw.key),
          context_hash: String(raw.context_hash),
          shown_count: typeof raw.shown_count === "number" ? raw.shown_count : 0,
          applied_count: typeof raw.applied_count === "number" ? raw.applied_count : 0,
          rejected_count: typeof raw.rejected_count === "number" ? raw.rejected_count : 0,
          success_after_apply:
            typeof raw.success_after_apply === "number" ? raw.success_after_apply : 0,
          disabled: raw.disabled === true,
          last_applied_at:
            typeof raw.last_applied_at === "string"
              ? raw.last_applied_at
              : (raw.last_applied_at as null) ?? null,
          updated_at: typeof raw.updated_at === "string" ? raw.updated_at : undefined,
        });
      }

      return Response.json({ ok: true, results });
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Server error";
      return Response.json({ ok: false, error: msg }, { status: 500 });
    }
  }

  const keys =
    typeof o === "object" &&
    o !== null &&
    "keys" in o &&
    Array.isArray((o as { keys: unknown }).keys)
      ? (o as { keys: unknown[] }).keys
      : [];

  const cleanKeys = keys
    .filter((k): k is string => typeof k === "string" && k.trim().length > 0)
    .map((k) => k.trim())
    .slice(0, 200);

  if (cleanKeys.length === 0) {
    return Response.json({ ok: true, stats: {} });
  }

  try {
    const supabase = await createServiceRoleClient();
    const { data, error } = await supabase
      .from("qc_ai_suggestion_stats")
      .select(
        "key, shown_count, applied_count, rejected_count, success_after_apply, disabled, last_applied_at, updated_at",
      )
      .in("key", cleanKeys);

    if (error) {
      if (error.code === "42P01" || error.message?.includes("does not exist")) {
        return Response.json({ ok: true, stats: {} });
      }
      return Response.json({ ok: false, error: error.message }, { status: 500 });
    }

    const stats: Record<string, QcAiSuggestionStatsRow> = {};
    for (const row of data ?? []) {
      const r = row as Record<string, unknown>;
      const key = typeof r.key === "string" ? r.key : "";
      if (!key) continue;
      stats[key] = {
        key,
        shown_count: typeof r.shown_count === "number" ? r.shown_count : 0,
        applied_count: typeof r.applied_count === "number" ? r.applied_count : 0,
        rejected_count: typeof r.rejected_count === "number" ? r.rejected_count : 0,
        success_after_apply:
          typeof r.success_after_apply === "number" ? r.success_after_apply : 0,
        disabled: r.disabled === true,
        last_applied_at:
          typeof r.last_applied_at === "string"
            ? r.last_applied_at
            : (r.last_applied_at as null) ?? null,
        updated_at: typeof r.updated_at === "string" ? r.updated_at : undefined,
      };
    }

    return Response.json({ ok: true, stats });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Server error";
    return Response.json({ ok: false, error: msg }, { status: 500 });
  }
}
