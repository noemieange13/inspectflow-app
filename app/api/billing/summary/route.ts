import { loadBillingPageViewModel } from "@/lib/billing/billingPageData";
import { assertBillingViewerAccess } from "@/lib/billing/billingAccess";
import { resolveBearerUserId } from "@/lib/supabaseAuthFromRequest";
import { createServiceRoleClient } from "@/lib/supabaseServer";

export const maxDuration = 30;

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
    const canView = await assertBillingViewerAccess(supabase, userId, organizationId);
    if (!canView) {
      return Response.json({ error: "access_denied" }, { status: 403 });
    }

    const result = await loadBillingPageViewModel(supabase, organizationId, userId);
    if (!result.ok) {
      return Response.json({ error: result.error }, { status: 403 });
    }

    return Response.json({ success: true, ...result.data, monitor_only: true });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return Response.json({ error: message }, { status: 500 });
  }
}
