import { assertAdminServiceAuth, runSystemHealthCheck } from "@/lib/system_monitoring";
import { createServiceRoleClient } from "@/lib/supabaseServer";

export const dynamic = "force-dynamic";

/** GET — monitoring opérationnel (admin / service role via Basic auth). */
export async function GET(req: Request) {
  const authErr = assertAdminServiceAuth(req);
  if (authErr) return authErr;

  try {
    const supabase = await createServiceRoleClient();
    const { health, signals } = await runSystemHealthCheck(supabase, { persist: true });

    return Response.json({
      health,
      signals,
      generated_at: health.generated_at,
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    console.warn("[admin/system-health]", message);
    return Response.json({ error: message }, { status: 500 });
  }
}
