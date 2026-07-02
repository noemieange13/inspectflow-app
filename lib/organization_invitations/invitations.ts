import type { SupabaseClient } from "@supabase/supabase-js";

import {
  buildAccessContext,
  buildAccessInspection,
  buildAccessUserForReport,
} from "@/lib/access_control/membership";
import { recordInspectionEventSafe } from "@/lib/inspection_audit_trail";

import { canAcceptInvitationAsUser } from "./permissions";
import {
  buildInvitationLink,
  defaultInvitationExpiresAt,
  generateInvitationToken,
  hashInvitationEmail,
  hashInvitationToken,
  invitationTokensMatch,
} from "./tokens";
import type {
  AcceptOrganizationInvitationResult,
  CreateOrganizationInvitationInput,
  CreateOrganizationInvitationResult,
  InvitationMemberRole,
  OrganizationInvitation,
  OrganizationInvitationStatus,
} from "./types";

function parseInvitationRow(row: Record<string, unknown>): OrganizationInvitation | null {
  const role = row.role;
  const status = row.status;
  if (role !== "admin" && role !== "inspector" && role !== "assistant") return null;
  if (
    status !== "pending" &&
    status !== "accepted" &&
    status !== "expired" &&
    status !== "revoked"
  ) {
    return null;
  }
  return {
    id: String(row.id),
    organization_id: String(row.organization_id),
    email_hash: String(row.email_hash),
    role: role as InvitationMemberRole,
    invited_by_user_id: String(row.invited_by_user_id),
    token_hash: String(row.token_hash),
    expires_at: String(row.expires_at),
    accepted_at:
      row.accepted_at != null && String(row.accepted_at) !== ""
        ? String(row.accepted_at)
        : null,
    status: status as OrganizationInvitationStatus,
    created_at: String(row.created_at),
  };
}

async function resolveOrgAuditReportId(
  supabase: SupabaseClient,
  organizationId: string,
): Promise<string | null> {
  const { data } = await supabase
    .from("reports")
    .select("id")
    .eq("organization_id", organizationId)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  return data && typeof (data as { id?: unknown }).id === "string"
    ? (data as { id: string }).id
    : null;
}

async function recordOrganizationAudit(
  supabase: SupabaseClient,
  organizationId: string,
  event_type: "organization_invitation_sent" | "organization_member_joined",
  metadata: Record<string, unknown>,
): Promise<void> {
  const reportId = await resolveOrgAuditReportId(supabase, organizationId);
  if (!reportId) return;
  void recordInspectionEventSafe(supabase, {
    report_id: reportId,
    event_type,
    actor_type: "inspector",
    metadata: {
      organization_id: organizationId,
      ...metadata,
    },
  });
}

export function sanitizeInvitationForList(
  invitation: OrganizationInvitation,
): Omit<OrganizationInvitation, "token_hash"> {
  const { token_hash: _tokenHash, ...rest } = invitation;
  return rest;
}

export async function listOrganizationInvitations(
  supabase: SupabaseClient,
  organizationId: string,
): Promise<Omit<OrganizationInvitation, "token_hash">[]> {
  const { data, error } = await supabase
    .from("organization_invitations")
    .select(
      "id, organization_id, email_hash, role, invited_by_user_id, token_hash, expires_at, accepted_at, status, created_at",
    )
    .eq("organization_id", organizationId)
    .order("created_at", { ascending: false });
  if (error?.code === "42P01") return [];
  if (error || !data) return [];
  return data
    .map((row) => parseInvitationRow(row as Record<string, unknown>))
    .filter((inv): inv is OrganizationInvitation => inv != null)
    .map(sanitizeInvitationForList);
}

export async function createOrganizationInvitation(
  supabase: SupabaseClient,
  input: CreateOrganizationInvitationInput,
): Promise<
  | { ok: true; result: CreateOrganizationInvitationResult }
  | { ok: false; error: string }
> {
  const emailHash = hashInvitationEmail(input.email);
  const rawToken = generateInvitationToken();
  const tokenHash = hashInvitationToken(rawToken);
  const expiresAt = defaultInvitationExpiresAt();

  const { data: pendingRevoked } = await supabase
    .from("organization_invitations")
    .select("id")
    .eq("organization_id", input.organization_id)
    .eq("email_hash", emailHash)
    .eq("status", "pending");

  if (Array.isArray(pendingRevoked) && pendingRevoked.length > 0) {
    await supabase
      .from("organization_invitations")
      .update({ status: "revoked" })
      .eq("organization_id", input.organization_id)
      .eq("email_hash", emailHash)
      .eq("status", "pending");
  }

  const { data, error } = await supabase
    .from("organization_invitations")
    .insert({
      organization_id: input.organization_id,
      email_hash: emailHash,
      role: input.role,
      invited_by_user_id: input.invited_by_user_id,
      token_hash: tokenHash,
      expires_at: expiresAt.toISOString(),
      status: "pending",
    })
    .select(
      "id, organization_id, email_hash, role, invited_by_user_id, token_hash, expires_at, accepted_at, status, created_at",
    )
    .single();

  if (error || !data) {
    return { ok: false, error: error?.message ?? "insert_failed" };
  }

  const invitation = parseInvitationRow(data as Record<string, unknown>);
  if (!invitation) {
    return { ok: false, error: "parse_failed" };
  }

  await recordOrganizationAudit(supabase, input.organization_id, "organization_invitation_sent", {
    invitation_id: invitation.id,
    invitation_role: input.role,
    invited_by_user_id: input.invited_by_user_id,
    email_hash: emailHash,
  });

  return {
    ok: true,
    result: {
      invitation: sanitizeInvitationForList(invitation),
      invitation_token: rawToken,
      invitation_link: buildInvitationLink(rawToken),
    },
  };
}

export async function revokeOrganizationInvitation(
  supabase: SupabaseClient,
  opts: { organization_id: string; invitation_id: string },
): Promise<{ ok: true } | { ok: false; error: string }> {
  const { data, error } = await supabase
    .from("organization_invitations")
    .update({ status: "revoked" })
    .eq("id", opts.invitation_id)
    .eq("organization_id", opts.organization_id)
    .eq("status", "pending")
    .select("id")
    .maybeSingle();

  if (error) return { ok: false, error: error.message };
  if (!data) return { ok: false, error: "invitation_not_found" };
  return { ok: true };
}

async function loadInvitationByTokenHash(
  supabase: SupabaseClient,
  tokenHash: string,
): Promise<OrganizationInvitation | null> {
  const { data, error } = await supabase
    .from("organization_invitations")
    .select(
      "id, organization_id, email_hash, role, invited_by_user_id, token_hash, expires_at, accepted_at, status, created_at",
    )
    .eq("token_hash", tokenHash)
    .maybeSingle();
  if (error || !data) return null;
  return parseInvitationRow(data as Record<string, unknown>);
}

function isInvitationExpired(invitation: OrganizationInvitation): boolean {
  return new Date(invitation.expires_at).getTime() < Date.now();
}

export async function acceptOrganizationInvitation(
  supabase: SupabaseClient,
  opts: { rawToken: string; userId: string; userEmail: string },
): Promise<AcceptOrganizationInvitationResult> {
  const tokenHash = hashInvitationToken(opts.rawToken);
  const invitation = await loadInvitationByTokenHash(supabase, tokenHash);

  if (!invitation || !invitationTokensMatch(opts.rawToken, invitation.token_hash)) {
    return { ok: false, reason: "invalid_token" };
  }

  if (invitation.status === "accepted") {
    return { ok: false, reason: "already_accepted" };
  }
  if (invitation.status === "revoked") {
    return { ok: false, reason: "revoked" };
  }
  if (invitation.status === "expired" || isInvitationExpired(invitation)) {
    if (invitation.status === "pending") {
      await supabase
        .from("organization_invitations")
        .update({ status: "expired" })
        .eq("id", invitation.id);
    }
    return { ok: false, reason: "expired" };
  }

  if (
    !canAcceptInvitationAsUser({
      userEmail: opts.userEmail,
      invitationEmailHash: invitation.email_hash,
    })
  ) {
    return { ok: false, reason: "email_mismatch" };
  }

  const { data: existingMember } = await supabase
    .from("organization_members")
    .select("id, status, role")
    .eq("organization_id", invitation.organization_id)
    .eq("user_id", opts.userId)
    .maybeSingle();

  let memberId: string;

  if (existingMember && typeof (existingMember as { id?: unknown }).id === "string") {
    const rec = existingMember as { id: string; status?: string };
    memberId = rec.id;
    const { error: updErr } = await supabase
      .from("organization_members")
      .update({ status: "active", role: invitation.role })
      .eq("id", memberId);
    if (updErr) {
      return { ok: false, reason: "invalid_token" };
    }
  } else {
    const { data: inserted, error: insErr } = await supabase
      .from("organization_members")
      .insert({
        organization_id: invitation.organization_id,
        user_id: opts.userId,
        role: invitation.role,
        status: "active",
      })
      .select("id")
      .single();
    if (insErr || !inserted) {
      return { ok: false, reason: "invalid_token" };
    }
    memberId = String((inserted as { id: unknown }).id);
  }

  const acceptedAt = new Date().toISOString();
  await supabase
    .from("organization_invitations")
    .update({ status: "accepted", accepted_at: acceptedAt })
    .eq("id", invitation.id);

  await recordOrganizationAudit(
    supabase,
    invitation.organization_id,
    "organization_member_joined",
    {
      invitation_id: invitation.id,
      member_id: memberId,
      user_id: opts.userId,
      member_role: invitation.role,
    },
  );

  return {
    ok: true,
    organization_id: invitation.organization_id,
    member_id: memberId,
    role: invitation.role,
  };
}

export async function buildManageInvitationsContext(
  supabase: SupabaseClient,
  userId: string,
  organizationId: string,
) {
  const user = await buildAccessUserForReport(supabase, userId, {
    report_id: "",
    inspection_id: null,
    organization_id: organizationId,
    owner_user_id: userId,
  });
  return buildAccessContext(
    user,
    buildAccessInspection({
      id: "",
      organization_id: organizationId,
      user_id: userId,
    }),
  );
}
