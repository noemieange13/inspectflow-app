import type { SupabaseClient } from "@supabase/supabase-js";

import { loadActiveInspectionAssignment } from "@/lib/team_collaboration/assignments";

import type {
  AccessContext,
  AccessInspection,
  AccessUser,
  OrganizationMember,
  OrganizationRole,
  MembershipStatus,
} from "./types";

export type ReportAccessRowLike = {
  id?: unknown;
  user_id?: unknown;
  inspection_id?: unknown;
  organization_id?: unknown;
  access_token?: unknown;
  token_expires_at?: unknown;
};

export type ReportAccessRow = ReportAccessRowLike & { id: string };

export function buildAccessInspection(row: ReportAccessRowLike): AccessInspection {
  const reportId = typeof row.id === "string" ? row.id.trim() : "";
  return {
    report_id: reportId,
    inspection_id:
      typeof row.inspection_id === "string" && row.inspection_id.trim()
        ? row.inspection_id.trim()
        : null,
    organization_id:
      typeof row.organization_id === "string" && row.organization_id.trim()
        ? row.organization_id.trim()
        : null,
    owner_user_id:
      typeof row.user_id === "string" && row.user_id.trim() ? row.user_id.trim() : "",
  };
}

export async function loadOrganizationMember(
  supabase: SupabaseClient,
  organizationId: string,
  userId: string,
): Promise<OrganizationMember | null> {
  try {
    const { data, error } = await supabase
      .from("organization_members")
      .select("id, organization_id, user_id, role, status, created_at")
      .eq("organization_id", organizationId)
      .eq("user_id", userId)
      .maybeSingle();
    if (error?.code === "42P01") return null;
    if (error || !data) return null;
    const row = data as Record<string, unknown>;
    const role = row.role;
    const status = row.status;
    if (
      role !== "owner" &&
      role !== "admin" &&
      role !== "inspector" &&
      role !== "assistant"
    ) {
      return null;
    }
    if (status !== "active" && status !== "invited" && status !== "disabled") {
      return null;
    }
    return {
      id: String(row.id),
      organization_id: String(row.organization_id),
      user_id: String(row.user_id),
      role: role as OrganizationRole,
      status: status as MembershipStatus,
      created_at: String(row.created_at),
    };
  } catch {
    return null;
  }
}

export async function buildAccessUserForReport(
  supabase: SupabaseClient,
  userId: string,
  inspection: AccessInspection,
): Promise<AccessUser> {
  if (!inspection.organization_id) {
    return { id: userId, membership: null };
  }
  const member = await loadOrganizationMember(
    supabase,
    inspection.organization_id,
    userId,
  );
  if (!member) {
    return { id: userId, membership: null };
  }
  return {
    id: userId,
    membership: {
      organization_id: member.organization_id,
      role: member.role,
      status: member.status,
    },
  };
}

export function buildAccessContext(
  user: AccessUser,
  inspection: AccessInspection,
  assignment?: AccessContext["assignment"],
): AccessContext {
  return { user, inspection, assignment: assignment ?? null };
}

export async function buildAccessContextForReport(
  supabase: SupabaseClient,
  userId: string,
  inspection: AccessInspection,
): Promise<AccessContext> {
  const user = await buildAccessUserForReport(supabase, userId, inspection);
  let assignment: AccessContext["assignment"] = null;
  if (inspection.organization_id && inspection.report_id) {
    const row = await loadActiveInspectionAssignment(
      supabase,
      inspection.report_id,
      userId,
    );
    if (row) {
      assignment = { role: row.role, status: row.status };
    }
  }
  return buildAccessContext(user, inspection, assignment);
}

export async function listOrganizationMembers(
  supabase: SupabaseClient,
  organizationId: string,
): Promise<OrganizationMember[]> {
  const { data, error } = await supabase
    .from("organization_members")
    .select("id, organization_id, user_id, role, status, created_at")
    .eq("organization_id", organizationId)
    .order("created_at", { ascending: true });
  if (error || !data) return [];
  return data
    .map((row) => {
      const r = row as Record<string, unknown>;
      const role = r.role;
      const status = r.status;
      if (
        role !== "owner" &&
        role !== "admin" &&
        role !== "inspector" &&
        role !== "assistant"
      ) {
        return null;
      }
      if (status !== "active" && status !== "invited" && status !== "disabled") {
        return null;
      }
      return {
        id: String(r.id),
        organization_id: String(r.organization_id),
        user_id: String(r.user_id),
        role: role as OrganizationRole,
        status: status as MembershipStatus,
        created_at: String(r.created_at),
      };
    })
    .filter((m): m is OrganizationMember => m != null);
}
