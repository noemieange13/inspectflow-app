import type { AccessContext } from "@/lib/access_control/types";
import type { InspectionAssignmentRole } from "./types";

/** Assignation active pour l'utilisateur courant sur le rapport du contexte. */
export function hasActiveAssignment(ctx: AccessContext): boolean {
  return ctx.assignment?.status === "active";
}

export function assignmentRole(ctx: AccessContext): InspectionAssignmentRole | null {
  if (!hasActiveAssignment(ctx)) return null;
  return ctx.assignment!.role;
}

/** Vue via assignation — tout assigné actif peut voir. */
export function canViewViaAssignment(ctx: AccessContext): boolean {
  return hasActiveAssignment(ctx);
}

/** Édition / upload via assignation — lead et assistant. */
export function canEditViaAssignment(ctx: AccessContext): boolean {
  const r = assignmentRole(ctx);
  return r === "lead_inspector" || r === "assistant";
}

/** PDF via assignation — lead_inspector seulement. */
export function canPdfViaAssignment(ctx: AccessContext): boolean {
  return assignmentRole(ctx) === "lead_inspector";
}
