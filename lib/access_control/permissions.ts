import type { AccessContext, OrganizationRole } from "./types";
import {
  canEditViaAssignment,
  canPdfViaAssignment,
  canViewViaAssignment,
} from "@/lib/team_collaboration/permissions";

function isActiveMember(ctx: AccessContext): boolean {
  return ctx.user.membership?.status === "active";
}

function sameOrganization(ctx: AccessContext): boolean {
  const orgId = ctx.inspection.organization_id;
  if (!orgId) return ctx.inspection.owner_user_id === ctx.user.id;
  return ctx.user.membership?.organization_id === orgId;
}

function role(ctx: AccessContext): OrganizationRole | null {
  if (!isActiveMember(ctx) || !sameOrganization(ctx)) return null;
  return ctx.user.membership!.role;
}

function isReportOwner(ctx: AccessContext): boolean {
  return ctx.inspection.owner_user_id === ctx.user.id;
}

/** Lecture seule — fonctions pures, sans accès DB. */
export function canViewInspection(ctx: AccessContext): boolean {
  if (ctx.user.membership?.status === "disabled") return false;
  if (isReportOwner(ctx)) return true;
  if (!isActiveMember(ctx)) return false;
  const r = role(ctx);
  if (!r || !sameOrganization(ctx)) return false;
  if (r === "owner" || r === "admin") return true;
  if (r === "inspector") return isReportOwner(ctx) || canViewViaAssignment(ctx);
  if (r === "assistant") return isReportOwner(ctx) || canViewViaAssignment(ctx);
  return false;
}

export function canEditInspection(ctx: AccessContext): boolean {
  if (!canViewInspection(ctx)) return false;
  const r = role(ctx);
  if (!r) return isReportOwner(ctx);
  if (r === "owner" || r === "admin") return true;
  if (r === "inspector") {
    return isReportOwner(ctx) || canEditViaAssignment(ctx);
  }
  if (r === "assistant") {
    return isReportOwner(ctx) || canEditViaAssignment(ctx);
  }
  return false;
}

export function canUploadPhotos(ctx: AccessContext): boolean {
  return canEditInspection(ctx);
}

export function canGeneratePdf(ctx: AccessContext): boolean {
  if (ctx.user.membership?.status === "disabled") return false;
  if (isReportOwner(ctx)) {
    const r = role(ctx);
    if (r === "assistant") return false;
    return true;
  }
  if (!isActiveMember(ctx)) return false;
  const r = role(ctx);
  if (!r || !sameOrganization(ctx)) return false;
  if (r === "assistant") return false;
  if (r === "owner" || r === "admin") return true;
  if (r === "inspector") {
    return isReportOwner(ctx) || canPdfViaAssignment(ctx);
  }
  return false;
}

export function canManageOrganization(ctx: AccessContext): boolean {
  if (!isActiveMember(ctx)) return false;
  const r = role(ctx);
  return r === "owner" || r === "admin";
}

export function canPerformAction(
  ctx: AccessContext,
  action: import("./types").ReportAccessAction,
): boolean {
  switch (action) {
    case "view":
      return canViewInspection(ctx);
    case "edit":
      return canEditInspection(ctx);
    case "upload":
      return canUploadPhotos(ctx);
    case "pdf":
      return canGeneratePdf(ctx);
    case "manage_organization":
      return canManageOrganization(ctx);
    default:
      return false;
  }
}
