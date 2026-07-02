import { assertBillingManagerAccess } from "@/lib/billing/billingAccess";
import { createPortalSession, isStripeConfigured } from "@/lib/stripe";
import { resolveBearerUserId } from "@/lib/supabaseAuthFromRequest";
import { createServiceRoleClient } from "@/lib/supabaseServer";

export const maxDuration = 30;

export async function POST(req: Request) {
  try {
    if (!isStripeConfigured()) {
      return Response.json({ error: "stripe_not_configured" }, { status: 503 });
    }

    const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
    if (!body || typeof body !== "object") {
      return Response.json({ error: "Invalid JSON" }, { status: 400 });
    }

    const organizationId =
      typeof body.organization_id === "string" ? body.organization_id.trim() : "";
    if (!organizationId) {
      return Response.json({ error: "organization_id required" }, { status: 400 });
    }

    const userId = await resolveBearerUserId(req);
    if (!userId) {
      return Response.json({ error: "access_denied" }, { status: 403 });
    }

    const supabase = await createServiceRoleClient();
    const allowed = await assertBillingManagerAccess(supabase, userId, organizationId);
    if (!allowed) {
      return Response.json({ error: "access_denied" }, { status: 403 });
    }

    const result = await createPortalSession(supabase, organizationId);
    if (!result.ok) {
      return Response.json({ error: result.error }, { status: 400 });
    }

    return Response.json({ success: true, portal_url: result.portal_url });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return Response.json({ error: message }, { status: 500 });
  }
}
