import { listReportVersions } from "@/lib/reportVersions";
import { createServiceRoleClient } from "@/lib/supabaseServer";
import { assertReportViewerAccess } from "@/lib/reportViewerAccess";

class AdminAuthMissingError extends Error {
  constructor(message = "Admin authentication required.") {
    super(message);
    this.name = "AdminAuthMissingError";
  }
}

class AdminAuthInvalidError extends Error {
  constructor(message = "Invalid admin authentication.") {
    super(message);
    this.name = "AdminAuthInvalidError";
  }
}

function constantTimeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  const encoder = new TextEncoder();
  const ab = encoder.encode(a);
  const bb = encoder.encode(b);
  let diff = 0;
  for (let i = 0; i < ab.length; i++) {
    diff |= ab[i]! ^ bb[i]!;
  }
  return diff === 0;
}

function basicAuthExpectedHeader(user: string, pass: string): string {
  const raw = `${user}:${pass}`;
  const bytes = new TextEncoder().encode(raw);
  let binary = "";
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]!);
  }
  return `Basic ${btoa(binary)}`;
}

function assertLegacyReportAdminAccess(req: Request): void {
  const user = process.env.DASHBOARD_USER?.trim();
  const pass = process.env.DASHBOARD_PASS?.trim();
  if (!user || !pass) {
    throw new Error("Admin auth not configured (DASHBOARD_USER/DASHBOARD_PASS).");
  }

  const auth = req.headers.get("authorization") ?? "";
  if (!auth.trim()) {
    throw new AdminAuthMissingError();
  }

  const expected = basicAuthExpectedHeader(user, pass);
  if (!constantTimeEqual(auth, expected)) {
    throw new AdminAuthInvalidError();
  }
}

/**
 * POST JSON `{ report_id, access_token }` — liste des versions (timeline).
 */
export async function POST(req: Request) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return Response.json({ ok: false, error: "JSON invalide." }, { status: 400 });
  }

  const o = body as Record<string, unknown>;
  const reportId = typeof o.report_id === "string" ? o.report_id.trim() : "";
  const accessTokenRaw =
    typeof o.access_token === "string" ? o.access_token : "";

  if (!reportId) {
    return Response.json({ ok: false, error: "report_id requis." }, { status: 400 });
  }

  try {
    const supabase = await createServiceRoleClient();
    const gate = await assertReportViewerAccess(supabase, reportId, accessTokenRaw);
    if (!gate.ok) {
      return Response.json(gate.body, { status: gate.status >= 500 ? 500 : 400 });
    }

    // Durcissement : pour les rapports sans viewer token en base (legacy), exiger une auth admin.
    const { data: report, error: reportErr } = await supabase
      .from("reports")
      .select("access_token")
      .eq("id", reportId)
      .maybeSingle();

    if (reportErr) {
      return Response.json({ ok: false, error: reportErr.message }, { status: 500 });
    }

    const dbToken =
      typeof (report as { access_token?: unknown } | null)?.access_token === "string"
        ? String((report as { access_token: string }).access_token).trim()
        : "";
    if (!dbToken) {
      assertLegacyReportAdminAccess(req);
    }

    const list = await listReportVersions(supabase, reportId);
    if ("error" in list) {
      return Response.json({ ok: false, error: list.error }, { status: 500 });
    }

    return Response.json({
      ok: true,
      versions: list.rows,
      max_versions: 50,
    });
  } catch (e) {
    if (e instanceof AdminAuthMissingError) {
      return Response.json({ ok: false, error: e.message }, { status: 401 });
    }
    if (e instanceof AdminAuthInvalidError) {
      return Response.json({ ok: false, error: e.message }, { status: 403 });
    }
    const message = e instanceof Error ? e.message : String(e);
    return Response.json({ ok: false, error: message }, { status: 500 });
  }
}
