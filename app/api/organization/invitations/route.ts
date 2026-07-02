import {
  buildManageInvitationsContext,
  createOrganizationInvitation,
  listOrganizationInvitations,
  revokeOrganizationInvitation,
} from "@/lib/organization_invitations";
import { canManageInvitations } from "@/lib/organization_invitations/permissions";
import type { InvitationMemberRole } from "@/lib/organization_invitations/types";
import { resolveBearerUserId } from "@/lib/supabaseAuthFromRequest";
import { createServiceRoleClient } from "@/lib/supabaseServer";

export const maxDuration = 30;

function parseInviteRole(raw: unknown): InvitationMemberRole | null {
  return raw === "admin" || raw === "inspector" || raw === "assistant" ? raw : null;
}

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const organizationId = url.searchParams.get("organization_id")?.trim() ?? "";
    if (!organizationId) {
      return Response.json({ error: "organization_id required" }, { status: 400 });
    }

    const userId = await resolveBearerUserId(req);
    if (!userId) {
      return Response.json({ error: "access_denied" }, { status: 403 });
    }

    const supabase = await createServiceRoleClient();
    const ctx = await buildManageInvitationsContext(supabase, userId, organizationId);
    if (!canManageInvitations(ctx)) {
      return Response.json({ error: "access_denied" }, { status: 403 });
    }

    const invitations = await listOrganizationInvitations(supabase, organizationId);
    return Response.json({ success: true, invitations });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return Response.json({ error: message }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
    if (!body || typeof body !== "object") {
      return Response.json({ error: "Invalid JSON" }, { status: 400 });
    }

    const organizationId =
      typeof body.organization_id === "string" ? body.organization_id.trim() : "";
    const action = body.action === "revoke" ? "revoke" : "create";

    if (!organizationId) {
      return Response.json({ error: "organization_id required" }, { status: 400 });
    }

    const userId = await resolveBearerUserId(req);
    if (!userId) {
      return Response.json({ error: "access_denied" }, { status: 403 });
    }

    const supabase = await createServiceRoleClient();
    const ctx = await buildManageInvitationsContext(supabase, userId, organizationId);
    if (!canManageInvitations(ctx)) {
      return Response.json({ error: "access_denied" }, { status: 403 });
    }

    if (action === "revoke") {
      const invitationId =
        typeof body.invitation_id === "string" ? body.invitation_id.trim() : "";
      if (!invitationId) {
        return Response.json({ error: "invitation_id required" }, { status: 400 });
      }
      const result = await revokeOrganizationInvitation(supabase, {
        organization_id: organizationId,
        invitation_id: invitationId,
      });
      if (!result.ok) {
        return Response.json({ error: result.error }, { status: 400 });
      }
      return Response.json({ success: true, action: "revoke" });
    }

    const email = typeof body.email === "string" ? body.email.trim() : "";
    const role = parseInviteRole(body.role) ?? "inspector";
    if (!email || !email.includes("@")) {
      return Response.json({ error: "valid email required" }, { status: 400 });
    }

    const created = await createOrganizationInvitation(supabase, {
      organization_id: organizationId,
      email,
      role,
      invited_by_user_id: userId,
    });
    if (!created.ok) {
      return Response.json({ error: created.error }, { status: 400 });
    }

    return Response.json({
      success: true,
      action: "create",
      invitation: created.result.invitation,
      invitation_link: created.result.invitation_link,
      invitation_token: created.result.invitation_token,
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return Response.json({ error: message }, { status: 500 });
  }
}
