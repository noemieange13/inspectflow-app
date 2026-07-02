export function parseBasicAdminAuth(req: Request): { user: string; pass: string } | null {
  const auth = req.headers.get("authorization") ?? req.headers.get("Authorization");
  if (!auth) return null;
  const [scheme, encoded] = auth.split(" ");
  if (!scheme || scheme.toLowerCase() !== "basic" || !encoded) return null;
  try {
    const decoded = Buffer.from(encoded, "base64").toString("utf8");
    const idx = decoded.indexOf(":");
    if (idx === -1) return null;
    return { user: decoded.slice(0, idx), pass: decoded.slice(idx + 1) };
  } catch {
    return null;
  }
}

export function assertAdminServiceAuth(req: Request): Response | null {
  const creds = parseBasicAdminAuth(req);
  if (!creds) {
    return Response.json({ error: "ADMIN_AUTH_MISSING" }, { status: 401 });
  }
  const expectedUser = process.env.DASHBOARD_USER;
  const expectedPass = process.env.DASHBOARD_PASS;
  if (!expectedUser || !expectedPass) {
    return Response.json({ error: "MISSING_DASHBOARD_AUTH_ENV" }, { status: 500 });
  }
  if (creds.user !== expectedUser || creds.pass !== expectedPass) {
    return Response.json({ error: "ADMIN_AUTH_INVALID" }, { status: 403 });
  }
  return null;
}
