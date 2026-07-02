import { acceptOrganizationInvitation } from "@/lib/organization_invitations";
import { resolveBearerUserId } from "@/lib/supabaseAuthFromRequest";
import { createServiceRoleClient } from "@/lib/supabaseServer";
import { createClient } from "@supabase/supabase-js";

export const maxDuration = 30;

async function resolveUserEmail(req: Request, userId: string): Promise<string | null> {
  const auth = req.headers.get("authorization") ?? "";
  const m = /^Bearer\s+(\S+)/i.exec(auth.trim());
  if (!m) return null;
  const jwt = m[1];

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return null;

  const client = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data, error } = await client.auth.getUser(jwt);
  if (error || !data?.user?.id || data.user.id !== userId) return null;
  return data.user.email ?? null;
}

export async function POST(req: Request) {
  try {
    const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
    if (!body || typeof body !== "object") {
      return Response.json({ error: "Invalid JSON" }, { status: 400 });
    }

    const rawToken = typeof body.token === "string" ? body.token.trim() : "";
    if (!rawToken) {
      return Response.json({ error: "token required" }, { status: 400 });
    }

    const userId = await resolveBearerUserId(req);
    if (!userId) {
      return Response.json({ error: "access_denied" }, { status: 403 });
    }

    const userEmail = await resolveUserEmail(req, userId);
    if (!userEmail) {
      return Response.json({ error: "email_required" }, { status: 403 });
    }

    const supabase = await createServiceRoleClient();
    const result = await acceptOrganizationInvitation(supabase, {
      rawToken,
      userId,
      userEmail,
    });

    if (!result.ok) {
      const status =
        result.reason === "expired" || result.reason === "revoked" || result.reason === "invalid_token"
          ? 403
          : 400;
      return Response.json({ allowed: false, reason: result.reason }, { status });
    }

    return Response.json({
      success: true,
      organization_id: result.organization_id,
      member_id: result.member_id,
      role: result.role,
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return Response.json({ error: message }, { status: 500 });
  }
}
