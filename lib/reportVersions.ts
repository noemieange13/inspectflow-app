import type { SupabaseClient } from "@supabase/supabase-js";

import { anchorReportVersionInLedger } from "@/lib/reportLedgerAnchor";
import { updateReportPayloadWithUnlock } from "@/lib/updateReportPayloadWithUnlock";

export const MAX_REPORT_VERSIONS = 50;

export type ReportVersionActor = "user" | "ai" | "system";

export type InsertReportVersionInput = {
  reportId: string;
  createdBy: ReportVersionActor;
  /** ex. manual_cover_save | photos_analysis | vision | notes_ocr | restore */
  source: string;
  payload: Record<string, unknown>;
  diffSummary: string | null;
  metadata?: Record<string, unknown>;
  isMajor?: boolean;
  confidenceScore?: number | null;
  editEventType?: string;
  fieldPath?: string | null;
  /** Par défaut true — faux pour un snapshot « undo » avant mutation sans pointer le rapport dessus. */
  bumpCurrentPointer?: boolean;
};

/**
 * Insère une version complète du payload + événement d’édition associé, puis taille l’historique.
 */
export async function insertReportVersion(
  supabase: SupabaseClient,
  input: InsertReportVersionInput,
): Promise<{ versionId: string; versionNumber: number } | { error: string }> {
  const { data: inserted, error: insErr } = await supabase
    .from("report_versions")
    .insert({
      report_id: input.reportId,
      created_by: input.createdBy,
      source: input.source,
      payload: input.payload,
      diff_summary: input.diffSummary,
      metadata: input.metadata ?? {},
      is_major: input.isMajor ?? false,
      confidence_score: input.confidenceScore ?? null,
      audit_status: "partial",
    })
    .select("id, version_number")
    .single();

  if (insErr || !inserted) {
    return { error: insErr?.message ?? "insert report_versions failed" };
  }

  const versionId = String((inserted as { id: string }).id);
  const nextNum = Number((inserted as { version_number: number }).version_number);

  const anchor = await anchorReportVersionInLedger(supabase, {
    reportId: input.reportId,
    versionId,
    versionNumber: nextNum,
    source: input.source,
    createdBy: input.createdBy,
    payload: input.payload,
  });

  if ("ledgerEventId" in anchor) {
    const { error: upLedErr } = await supabase
      .from("report_versions")
      .update({
        ledger_event_id: anchor.ledgerEventId,
        audit_status: "complete",
      })
      .eq("id", versionId);
    if (upLedErr) {
      console.error("[report_versions] ledger link update", upLedErr);
    }
  } else {
    console.warn("[report_versions] ledger anchor skipped:", anchor.error);
  }

  if (input.bumpCurrentPointer !== false) {
    const { error: ptrErr } = await supabase
      .from("reports")
      .update({ current_version_id: versionId })
      .eq("id", input.reportId);
    if (ptrErr) {
      console.error("[reports] current_version_id", ptrErr);
    }
  }

  await supabase.from("report_edit_events").insert({
    report_id: input.reportId,
    version_id: versionId,
    event_type: input.editEventType ?? input.source,
    field_path: input.fieldPath ?? null,
    actor: input.createdBy,
    context: {
      ...(input.metadata ?? {}),
      version_number: nextNum,
      ledger_ok: "ledgerEventId" in anchor,
    },
  });

  await trimReportVersions(supabase, input.reportId);

  return { versionId, versionNumber: nextNum };
}

async function trimReportVersions(supabase: SupabaseClient, reportId: string): Promise<void> {
  for (;;) {
    const { count, error: cErr } = await supabase
      .from("report_versions")
      .select("id", { count: "exact", head: true })
      .eq("report_id", reportId);
    if (cErr || (count ?? 0) <= MAX_REPORT_VERSIONS) {
      return;
    }
    const { data: oldest } = await supabase
      .from("report_versions")
      .select("id")
      .eq("report_id", reportId)
      .order("version_number", { ascending: true })
      .limit(1)
      .maybeSingle();
    if (!oldest) return;
    const oid = (oldest as { id: string }).id;
    const { data: rep } = await supabase
      .from("reports")
      .select("current_version_id")
      .eq("id", reportId)
      .maybeSingle();
    await supabase.from("report_versions").delete().eq("id", oid);
    if ((rep as { current_version_id?: string } | null)?.current_version_id === oid) {
      const { data: latest } = await supabase
        .from("report_versions")
        .select("id")
        .eq("report_id", reportId)
        .order("version_number", { ascending: false })
        .limit(1)
        .maybeSingle();
      const lid = (latest as { id: string } | null)?.id;
      if (lid) {
        await supabase.from("reports").update({ current_version_id: lid }).eq("id", reportId);
      }
    }
  }
}

export type ReportVersionListRow = {
  id: string;
  version_number: number;
  created_at: string;
  created_by: string;
  source: string;
  diff_summary: string | null;
  metadata: Record<string, unknown>;
  is_major: boolean;
  confidence_score: number | null;
  audit_status: "complete" | "partial";
  ledger_event_id: string | null;
};

export async function listReportVersions(
  supabase: SupabaseClient,
  reportId: string,
  limit = MAX_REPORT_VERSIONS,
): Promise<{ rows: ReportVersionListRow[] } | { error: string }> {
  const { data, error } = await supabase
    .from("report_versions")
    .select(
      "id, version_number, created_at, created_by, source, diff_summary, metadata, is_major, confidence_score, audit_status, ledger_event_id",
    )
    .eq("report_id", reportId)
    .order("version_number", { ascending: false })
    .limit(limit);

  if (error) {
    return { error: error.message };
  }
  return {
    rows: (data ?? []) as ReportVersionListRow[],
  };
}

/**
 * Applique le snapshot d’une version au rapport, puis enregistre une nouvelle entrée d’historique.
 */
export async function restoreReportToVersion(
  supabase: SupabaseClient,
  input: {
    reportId: string;
    versionId: string;
    allowUnlock: boolean;
  },
): Promise<{ newVersionNumber: number } | { error: string }> {
  const { data: ver, error: rErr } = await supabase
    .from("report_versions")
    .select("id, report_id, version_number, payload")
    .eq("id", input.versionId)
    .eq("report_id", input.reportId)
    .maybeSingle();

  if (rErr || !ver) {
    return { error: rErr?.message ?? "Version introuvable." };
  }

  const payload = ver.payload as Record<string, unknown>;
  const fromNum = (ver as { version_number: number }).version_number;

  const { error: upErr } = await updateReportPayloadWithUnlock(
    supabase,
    input.reportId,
    payload,
    input.allowUnlock,
    { clearStoredPdf: true },
  );
  if (upErr) {
    return { error: upErr.message };
  }

  const ins = await insertReportVersion(supabase, {
    reportId: input.reportId,
    createdBy: "user",
    source: "restore",
    payload,
    diffSummary: `Rapport restauré depuis la version n°${fromNum}`,
    metadata: {
      restored_from_version_id: input.versionId,
      restored_from_version_number: fromNum,
    },
    isMajor: true,
    editEventType: "RESTORE",
    fieldPath: "payload",
  });

  if ("error" in ins) {
    return { error: ins.error };
  }
  return { newVersionNumber: ins.versionNumber };
}
