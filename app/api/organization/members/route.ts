import {
  buildAccessContext,
  buildAccessInspection,
  buildAccessUserForReport,
  canManageOrganization,
  listOrganizationMembers,
  type OrganizationMember,
} from "@/lib/access_control";
import { createServiceRoleClient } from "@/lib/supabaseServer";

export const maxDuration = 30;

async function resolveUserId(req: Request): Promise<string | null> {
  const auth = req.headers.get("authorization") ?? "";
  const m = /^Bearer\s+(\S+)/i.exec(auth.trim());
  if (!m) return null;
  const jwt = m[1];
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return null;
  const { createClient } = await import("@supabase/supabase-js");
  const client = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data, error } = await client.auth.getUser(jwt);
  if (error || !data?.user?.id) return null;
  return data.user.id;
}

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const organizationId = url.searchParams.get("organization_id")?.trim() ?? "";
    if (!organizationId) {
      return Response.json({ error: "organization_id required" }, { status: 400 });
    }

    const userId = await resolveUserId(req);
    if (!userId) {
      return Response.json({ error: "access_denied" }, { status: 403 });
    }

    const supabase = await createServiceRoleClient();
    const user = await buildAccessUserForReport(supabase, userId, {
      report_id: "",
      inspection_id: null,
      organization_id: organizationId,
      owner_user_id: userId,
    });
    const ctx = buildAccessContext(user, buildAccessInspection({
      id: "",
      organization_id: organizationId,
      user_id: userId,
    }));
    if (!canManageOrganization(ctx)) {
      return Response.json({ error: "access_denied" }, { status: 403 });
    }

    const members: OrganizationMember[] = await listOrganizationMembers(
      supabase,
      organizationId,
    );
    return Response.json({ success: true, members });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return Response.json({ error: message }, { status: 500 });
  }
}
