import { assertAdminServiceAuth } from "@/lib/system_monitoring";
import { listOrganizationsBillingSnapshots } from "@/lib/billing";
import { createServiceRoleClient } from "@/lib/supabaseServer";

export const dynamic = "force-dynamic";

/** GET — plans, usage & billing readiness (Basic auth). */
export async function GET(req: Request) {
  const authErr = assertAdminServiceAuth(req);
  if (authErr) return authErr;

  try {
    const supabase = await createServiceRoleClient();
    const organizations = await listOrganizationsBillingSnapshots(supabase, 100);

    return Response.json({
      organizations,
      generated_at: new Date().toISOString(),
      monitor_only: true,
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    console.warn("[admin/organization-usage]", message);
    return Response.json({ error: message }, { status: 500 });
  }
}
