import type { AccessContext } from "@/lib/access_control/types";
import type { SupabaseClient } from "@supabase/supabase-js";

import {
  buildAccessContext,
  buildAccessInspection,
  buildAccessUserForReport,
} from "@/lib/access_control";

export type BillingAccessLevel = {
  canView: boolean;
  canManage: boolean;
};

export function resolveBillingAccessFromContext(ctx: AccessContext): BillingAccessLevel {
  const role = ctx.user.membership?.role;
  const status = ctx.user.membership?.status;
  if (status !== "active" || !role) {
    return { canView: false, canManage: false };
  }
  const canView = role === "owner" || role === "admin";
  const canManage = role === "owner";
  return { canView, canManage };
}

export async function getOrganizationBillingAccess(
  supabase: SupabaseClient,
  userId: string,
  organizationId: string,
): Promise<BillingAccessLevel> {
  const user = await buildAccessUserForReport(supabase, userId, {
    report_id: "",
    inspection_id: null,
    organization_id: organizationId,
    owner_user_id: userId,
  });
  const ctx = buildAccessContext(
    user,
    buildAccessInspection({
      id: "",
      organization_id: organizationId,
      user_id: userId,
    }),
  );
  return resolveBillingAccessFromContext(ctx);
}

/** Owner/admin — checkout & portal (7B). */
export async function assertBillingManagerAccess(
  supabase: SupabaseClient,
  userId: string,
  organizationId: string,
): Promise<boolean> {
  const access = await getOrganizationBillingAccess(supabase, userId, organizationId);
  return access.canManage;
}

/** Owner/admin — lecture page billing (7C). */
export async function assertBillingViewerAccess(
  supabase: SupabaseClient,
  userId: string,
  organizationId: string,
): Promise<boolean> {
  const access = await getOrganizationBillingAccess(supabase, userId, organizationId);
  return access.canView;
}
