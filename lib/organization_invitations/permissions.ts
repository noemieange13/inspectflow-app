import type { AccessContext } from "@/lib/access_control/types";
import { canManageOrganization } from "@/lib/access_control/permissions";

import { hashInvitationEmail } from "./tokens";

/** Owner / admin actif uniquement — ne modifie pas les permissions 6A. */
export function canManageInvitations(ctx: AccessContext): boolean {
  return canManageOrganization(ctx);
}

export function canAcceptInvitationAsUser(opts: {
  userEmail: string | null | undefined;
  invitationEmailHash: string;
}): boolean {
  if (!opts.userEmail?.trim()) return false;
  return hashInvitationEmail(opts.userEmail) === opts.invitationEmailHash;
}
