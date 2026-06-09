import { validateReportViewerAccessRecord } from "@/lib/reportViewerAccess";

function parseBasicAuth(req: Request): { user: string; pass: string } | null {
  const auth = req.headers.get("authorization") ?? req.headers.get("Authorization");
  if (!auth) return null;

  const [scheme, encoded] = auth.split(" ");
  if (!scheme || scheme.toLowerCase() !== "basic" || !encoded) return null;

  let decoded: string;
  try {
    decoded = Buffer.from(encoded, "base64").toString("utf8");
  } catch {
    return null;
  }

  const idx = decoded.indexOf(":");
  if (idx === -1) return null;

  return { user: decoded.slice(0, idx), pass: decoded.slice(idx + 1) };
}

function requireAdminAuth(req: Request, maxVersions: number): Response | null {
  const creds = parseBasicAuth(req);

  if (!creds) {
    return Response.json(
      { data: [], error: "ADMIN_AUTH_MISSING", meta: { max_versions: maxVersions } },
      { status: 401 },
    );
  }

  const expectedUser = process.env.DASHBOARD_USER;
  const expectedPass = process.env.DASHBOARD_PASS;

  // Config server manquante => 500 (car ce n'est pas un probleme auth client)
  if (!expectedUser || !expectedPass) {
    throw new Error("MISSING_DASHBOARD_AUTH_ENV");
  }

  const ok = creds.user === expectedUser && creds.pass === expectedPass;
  if (!ok) {
    return Response.json(
      { data: [], error: "ADMIN_AUTH_INVALID", meta: { max_versions: maxVersions } },
      { status: 403 },
    );
  }

  return null;
}

export type ReportVersionsAccessRow = {
  access_token?: unknown;
  token_expires_at?: unknown;
};

export function authorizeReportVersionsList(
  req: Request,
  accessTokenRaw: string,
  report: ReportVersionsAccessRow | null,
  maxVersions: number,
): Response | null {
  if (!report) {
    return Response.json(
      { data: [], error: "REPORT_NOT_FOUND", meta: { max_versions: maxVersions } },
      { status: 404 },
    );
  }

  const dbToken =
    typeof report.access_token === "string" ? report.access_token.trim() : "";

  if (accessTokenRaw && dbToken) {
    const gate = validateReportViewerAccessRecord(accessTokenRaw, report);
    if (!gate.ok) {
      return Response.json(
        {
          data: [],
          error: typeof gate.body.error === "string" ? gate.body.error : "ACCESS_DENIED",
          meta: { max_versions: maxVersions },
        },
        { status: gate.status },
      );
    }
    return null;
  }

  return requireAdminAuth(req, maxVersions);
}
