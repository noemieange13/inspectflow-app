import type { SupabaseClient } from "@supabase/supabase-js";

import type { BillingEventRow, BillingEventType } from "./types";

export async function recordBillingEvent(
  supabase: SupabaseClient,
  input: {
    organization_id: string;
    event_type: BillingEventType;
    metadata?: Record<string, unknown>;
  },
): Promise<BillingEventRow | null> {
  try {
    const { data, error } = await supabase
      .from("billing_events")
      .insert({
        organization_id: input.organization_id,
        event_type: input.event_type,
        metadata: input.metadata ?? {},
      })
      .select("id, organization_id, event_type, metadata, created_at")
      .single();

    if (error?.code === "42P01" || error || !data) return null;

    const row = data as Record<string, unknown>;
    return {
      id: String(row.id),
      organization_id: String(row.organization_id),
      event_type: row.event_type as BillingEventType,
      metadata:
        row.metadata && typeof row.metadata === "object"
          ? (row.metadata as Record<string, unknown>)
          : {},
      created_at: String(row.created_at),
    };
  } catch {
    return null;
  }
}

export async function listBillingEvents(
  supabase: SupabaseClient,
  organizationId: string,
  limit = 20,
): Promise<BillingEventRow[]> {
  const { data, error } = await supabase
    .from("billing_events")
    .select("id, organization_id, event_type, metadata, created_at")
    .eq("organization_id", organizationId)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error || !data) return [];

  return data.map((row) => {
    const r = row as Record<string, unknown>;
    return {
      id: String(r.id),
      organization_id: String(r.organization_id),
      event_type: r.event_type as BillingEventType,
      metadata:
        r.metadata && typeof r.metadata === "object"
          ? (r.metadata as Record<string, unknown>)
          : {},
      created_at: String(r.created_at),
    };
  });
}
