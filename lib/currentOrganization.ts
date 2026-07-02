import type { SupabaseClient } from "@supabase/supabase-js";

import type { Organization, OrganizationMember } from "@/lib/access_control/types";

/**
 * Résout l'organisation active : préférence explicite, sinon org personal.
 */
export async function resolveActiveOrganizationId(
  supabase: SupabaseClient,
  userId: string,
  preferredOrganizationId?: string | null,
): Promise<string | null> {
  if (preferredOrganizationId?.trim()) {
    const member = await loadMemberForUser(supabase, preferredOrganizationId.trim(), userId);
    if (member?.status === "active") {
      return member.organization_id;
    }
  }
  return resolvePersonalOrganizationId(supabase, userId);
}

export async function resolvePersonalOrganizationId(
  supabase: SupabaseClient,
  userId: string,
): Promise<string | null> {
  try {
    const { data, error } = await supabase
      .from("organizations")
      .select("id")
      .eq("type", "personal")
      .eq("created_by", userId)
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle();
    if (error?.code === "42P01") return null;
    if (error || !data) return null;
    return String((data as { id: unknown }).id);
  } catch {
    return null;
  }
}

export async function loadOrganizationById(
  supabase: SupabaseClient,
  organizationId: string,
): Promise<Organization | null> {
  const { data, error } = await supabase
    .from("organizations")
    .select("id, name, type, created_by, created_at")
    .eq("id", organizationId)
    .maybeSingle();
  if (error || !data) return null;
  const row = data as Record<string, unknown>;
  const type = row.type;
  if (type !== "personal" && type !== "company") return null;
  return {
    id: String(row.id),
    name: String(row.name),
    type,
    created_by: String(row.created_by),
    created_at: String(row.created_at),
  };
}

async function loadMemberForUser(
  supabase: SupabaseClient,
  organizationId: string,
  userId: string,
): Promise<OrganizationMember | null> {
  const { data, error } = await supabase
    .from("organization_members")
    .select("id, organization_id, user_id, role, status, created_at")
    .eq("organization_id", organizationId)
    .eq("user_id", userId)
    .maybeSingle();
  if (error || !data) return null;
  const row = data as Record<string, unknown>;
  return {
    id: String(row.id),
    organization_id: String(row.organization_id),
    user_id: String(row.user_id),
    role: row.role as OrganizationMember["role"],
    status: row.status as OrganizationMember["status"],
    created_at: String(row.created_at),
  };
}

export async function listUserOrganizations(
  supabase: SupabaseClient,
  userId: string,
): Promise<Array<{ organization: Organization; membership: OrganizationMember }>> {
  const { data, error } = await supabase
    .from("organization_members")
    .select(
      "id, organization_id, user_id, role, status, created_at, organizations(id, name, type, created_by, created_at)",
    )
    .eq("user_id", userId)
    .eq("status", "active");
  if (error || !data) return [];

  const out: Array<{ organization: Organization; membership: OrganizationMember }> = [];
  for (const row of data) {
    const r = row as Record<string, unknown>;
    const orgRaw = r.organizations;
    if (!orgRaw || typeof orgRaw !== "object") continue;
    const org = orgRaw as Record<string, unknown>;
    const type = org.type;
    if (type !== "personal" && type !== "company") continue;
    out.push({
      organization: {
        id: String(org.id),
        name: String(org.name),
        type,
        created_by: String(org.created_by),
        created_at: String(org.created_at),
      },
      membership: {
        id: String(r.id),
        organization_id: String(r.organization_id),
        user_id: String(r.user_id),
        role: r.role as OrganizationMember["role"],
        status: r.status as OrganizationMember["status"],
        created_at: String(r.created_at),
      },
    });
  }
  return out;
}
