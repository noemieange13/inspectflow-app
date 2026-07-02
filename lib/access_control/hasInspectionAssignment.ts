import type { AccessContext } from "./types";

/** Phase 6C — assignation active sur le rapport pour l'utilisateur courant. */
export function hasInspectionAssignment(ctx: AccessContext): boolean {
  return ctx.assignment?.status === "active";
}
