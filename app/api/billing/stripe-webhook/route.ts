import { handleStripeWebhookEvent, verifyStripeWebhookPayload } from "@/lib/stripe";
import { createServiceRoleClient } from "@/lib/supabaseServer";

export const runtime = "nodejs";
export const maxDuration = 30;

/** Stripe webhook — signature vérifiée, jamais faire confiance au frontend. */
export async function POST(req: Request) {
  try {
    const rawBody = await req.text();
    const signature = req.headers.get("stripe-signature");

    const verified = verifyStripeWebhookPayload(rawBody, signature);
    if ("error" in verified) {
      return Response.json({ error: verified.error }, { status: 400 });
    }

    const supabase = await createServiceRoleClient();
    const result = await handleStripeWebhookEvent(supabase, verified);

    if (!result.ok) {
      return Response.json({ error: result.error }, { status: 500 });
    }

    return Response.json({
      received: true,
      handled: result.handled,
      event_type: result.event_type,
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    console.error("[stripe-webhook]", message);
    return Response.json({ error: message }, { status: 500 });
  }
}
