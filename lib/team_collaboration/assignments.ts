import type { SupabaseClient } from "@supabase/supabase-js";

import { recordInspectionEventSafe } from "@/lib/inspection_audit_trail";

import type {
  AssignInspectionInput,
  InspectionAssignment,
  InspectionAssignmentRole,
  InspectionAssignmentStatus,
} from "./types";

function parseAssignmentRow(row: Record<string, unknown>): InspectionAssignment | null {
  const role = row.role;
  const status = row.status;
  if (role !== "lead_inspector" && role !== "assistant") return null;
  if (status !== "active" && status !== "removed") return null;
  return {
    id: String(row.id),
    report_id: String(row.report_id),
    organization_id: String(row.organization_id),
    assigned_to_user_id: String(row.assigned_to_user_id),
    assigned_by_user_id: String(row.assigned_by_user_id),
    role: role as InspectionAssignmentRole,
    status: status as InspectionAssignmentStatus,
    created_at: String(row.created_at),
  };
}

export async function loadActiveInspectionAssignment(
  supabase: SupabaseClient,
  reportId: string,
  userId: string,
): Promise<InspectionAssignment | null> {
  try {
    const { data, error } = await supabase
      .from("inspection_assignments")
      .select(
        "id, report_id, organization_id, assigned_to_user_id, assigned_by_user_id, role, status, created_at",
      )
      .eq("report_id", reportId)
      .eq("assigned_to_user_id", userId)
      .eq("status", "active")
      .maybeSingle();
    if (error?.code === "42P01") return null;
    if (error || !data) return null;
    return parseAssignmentRow(data as Record<string, unknown>);
  } catch {
    return null;
  }
}

export async function listInspectionAssignmentsForReport(
  supabase: SupabaseClient,
  reportId: string,
  opts?: { activeOnly?: boolean },
): Promise<InspectionAssignment[]> {
  let q = supabase
    .from("inspection_assignments")
    .select(
      "id, report_id, organization_id, assigned_to_user_id, assigned_by_user_id, role, status, created_at",
    )
    .eq("report_id", reportId)
    .order("created_at", { ascending: true });
  if (opts?.activeOnly !== false) {
    q = q.eq("status", "active");
  }
  const { data, error } = await q;
  if (error || !data) return [];
  return data
    .map((row) => parseAssignmentRow(row as Record<string, unknown>))
    .filter((a): a is InspectionAssignment => a != null);
}

export async function isActiveOrganizationMember(
  supabase: SupabaseClient,
  organizationId: string,
  userId: string,
): Promise<boolean> {
  const { data, error } = await supabase
    .from("organization_members")
    .select("id")
    .eq("organization_id", organizationId)
    .eq("user_id", userId)
    .eq("status", "active")
    .maybeSingle();
  return !error && !!data;
}

export async function assignInspectionMember(
  supabase: SupabaseClient,
  input: AssignInspectionInput,
  inspectionId: string | null,
): Promise<{ ok: true; assignment: InspectionAssignment } | { ok: false; error: string }> {
  const memberOk = await isActiveOrganizationMember(
    supabase,
    input.organization_id,
    input.assigned_to_user_id,
  );
  if (!memberOk) {
    return { ok: false, error: "assignee_not_active_member" };
  }

  const existing = await loadActiveInspectionAssignment(
    supabase,
    input.report_id,
    input.assigned_to_user_id,
  );
  if (existing) {
    if (existing.role === input.role) {
      return { ok: true, assignment: existing };
    }
    const { data: updated, error: updErr } = await supabase
      .from("inspection_assignments")
      .update({ role: input.role, assigned_by_user_id: input.assigned_by_user_id })
      .eq("id", existing.id)
      .select(
        "id, report_id, organization_id, assigned_to_user_id, assigned_by_user_id, role, status, created_at",
      )
      .single();
    if (updErr || !updated) {
      return { ok: false, error: updErr?.message ?? "update_failed" };
    }
    const assignment = parseAssignmentRow(updated as Record<string, unknown>);
    if (!assignment) return { ok: false, error: "parse_failed" };
    void recordInspectionEventSafe(supabase, {
      report_id: input.report_id,
      inspection_id: inspectionId,
      event_type: "inspection_assigned",
      actor_type: "inspector",
      metadata: {
        assignment_id: assignment.id,
        assigned_to_user_id: input.assigned_to_user_id,
        assigned_by_user_id: input.assigned_by_user_id,
        assignment_role: input.role,
        organization_id: input.organization_id,
      },
    });
    return { ok: true, assignment };
  }

  const { data: inserted, error: insErr } = await supabase
    .from("inspection_assignments")
    .insert({
      report_id: input.report_id,
      organization_id: input.organization_id,
      assigned_to_user_id: input.assigned_to_user_id,
      assigned_by_user_id: input.assigned_by_user_id,
      role: input.role,
      status: "active",
    })
    .select(
      "id, report_id, organization_id, assigned_to_user_id, assigned_by_user_id, role, status, created_at",
    )
    .single();

  if (insErr || !inserted) {
    return { ok: false, error: insErr?.message ?? "insert_failed" };
  }
  const assignment = parseAssignmentRow(inserted as Record<string, unknown>);
  if (!assignment) return { ok: false, error: "parse_failed" };

  void recordInspectionEventSafe(supabase, {
    report_id: input.report_id,
    inspection_id: inspectionId,
    event_type: "inspection_assigned",
    actor_type: "inspector",
    metadata: {
      assignment_id: assignment.id,
      assigned_to_user_id: input.assigned_to_user_id,
      assigned_by_user_id: input.assigned_by_user_id,
      assignment_role: input.role,
      organization_id: input.organization_id,
    },
  });

  return { ok: true, assignment };
}

export async function unassignInspectionMember(
  supabase: SupabaseClient,
  opts: {
    report_id: string;
    organization_id: string;
    assigned_to_user_id: string;
    removed_by_user_id: string;
    inspection_id: string | null;
  },
): Promise<{ ok: true } | { ok: false; error: string }> {
  const active = await loadActiveInspectionAssignment(
    supabase,
    opts.report_id,
    opts.assigned_to_user_id,
  );
  if (!active) {
    return { ok: false, error: "assignment_not_found" };
  }

  const { error } = await supabase
    .from("inspection_assignments")
    .update({ status: "removed" })
    .eq("id", active.id);

  if (error) {
    return { ok: false, error: error.message };
  }

  void recordInspectionEventSafe(supabase, {
    report_id: opts.report_id,
    inspection_id: opts.inspection_id,
    event_type: "inspection_unassigned",
    actor_type: "inspector",
    metadata: {
      assignment_id: active.id,
      assigned_to_user_id: opts.assigned_to_user_id,
      assigned_by_user_id: opts.removed_by_user_id,
      organization_id: opts.organization_id,
    },
  });

  return { ok: true };
}
