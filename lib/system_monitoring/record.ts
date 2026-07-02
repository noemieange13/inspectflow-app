import type { SupabaseClient } from "@supabase/supabase-js";

import { SYSTEM_HEALTH_EVENTS_TABLE } from "./constants";
import type { RecordSystemHealthEventInput, RecordSystemHealthEventResult } from "./types";

const ALLOWED_METADATA_KEYS = new Set([
  "status",
  "checks",
  "issue_count",
  "pending_jobs",
  "total_cost_today",
  "pdf_failure_rate",
  "events_24h",
  "health_version",
]);

function sanitizeMetadata(raw: Record<string, unknown> | undefined): Record<string, unknown> {
  if (!raw) return {};
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(raw)) {
    if (!ALLOWED_METADATA_KEYS.has(key)) continue;
    if (typeof value === "string" && value.length > 256) continue;
    if (typeof value === "number" && Number.isFinite(value)) out[key] = value;
    else if (typeof value === "boolean") out[key] = value;
    else if (typeof value === "object" && value !== null && !Array.isArray(value)) {
      out[key] = value;
    }
  }
  return out;
}

/** Append-only — ne bloque jamais la production. */
export async function recordSystemHealthEvent(
  supabase: SupabaseClient,
  input: RecordSystemHealthEventInput,
): Promise<RecordSystemHealthEventResult> {
  try {
    const { data, error } = await supabase
      .from(SYSTEM_HEALTH_EVENTS_TABLE)
      .insert({
        event_type: input.event_type,
        severity: input.severity,
        source: input.source,
        status: input.status ?? "open",
        metadata: sanitizeMetadata(input.metadata),
      })
      .select("id")
      .single();

    if (error) {
      if (error.code === "42P01") {
        console.warn("[system_monitoring] system_health_events table missing");
        return { recorded: false, error: "table_missing" };
      }
      console.warn("[system_monitoring] record failed", error.message);
      return { recorded: false, error: error.message };
    }

    return { recorded: true, id: typeof data?.id === "string" ? data.id : undefined };
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    console.warn("[system_monitoring] record error", message);
    return { recorded: false, error: message };
  }
}
