import type { OrganizationRole } from "@/lib/access_control/types";

export type InvitationMemberRole = Exclude<OrganizationRole, "owner">;

export type OrganizationInvitationStatus = "pending" | "accepted" | "expired" | "revoked";

export type OrganizationInvitation = {
  id: string;
  organization_id: string;
  email_hash: string;
  role: InvitationMemberRole;
  invited_by_user_id: string;
  token_hash: string;
  expires_at: string;
  accepted_at: string | null;
  status: OrganizationInvitationStatus;
  created_at: string;
};

export type CreateOrganizationInvitationInput = {
  organization_id: string;
  email: string;
  role: InvitationMemberRole;
  invited_by_user_id: string;
};

export type CreateOrganizationInvitationResult = {
  invitation: Omit<OrganizationInvitation, "token_hash">;
  invitation_token: string;
  invitation_link: string;
};

export type AcceptOrganizationInvitationResult =
  | { ok: true; organization_id: string; member_id: string; role: InvitationMemberRole }
  | { ok: false; reason: "invalid_token" | "expired" | "revoked" | "email_mismatch" | "already_accepted" };
