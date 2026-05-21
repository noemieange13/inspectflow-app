import { Buffer } from "node:buffer";

import { reportAccessTokensMatch } from "@/lib/reportAccessToken";

export type ReportVersionListAccessReport = {
  access_token?: string | null;
  token_expires_at?: string | null;
};

export type ReportVersionListAccessResult =
  | { ok: true; via: "admin" | "token" }
  | {
      ok: false;
      status: number;
      body: { data: []; error: string; meta: { max_versions: number } };
    };

type AuthEnv = {
  DASHBOARD_USER?: string;
  DASHBOARD_PASS?: string;
};

type BasicAuthCredentials = {
  user: string;
  pass: string;
};

export function parseBasicAuthHeader(auth: string | null): BasicAuthCredentials | null {
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

function deny(
  status: number,
  error: string,
  maxVersions: number,
): ReportVersionListAccessResult {
  return {
    ok: false,
    status,
    body: { data: [], error, meta: { max_versions: maxVersions } },
  };
}

function requireAdminAccess(
  authHeader: string | null,
  env: AuthEnv,
  maxVersions: number,
): ReportVersionListAccessResult {
  const creds = parseBasicAuthHeader(authHeader);

  if (!creds) {
    return deny(401, "ADMIN_AUTH_MISSING", maxVersions);
  }

  if (!env.DASHBOARD_USER || !env.DASHBOARD_PASS) {
    return deny(500, "MISSING_DASHBOARD_AUTH_ENV", maxVersions);
  }

  if (creds.user !== env.DASHBOARD_USER || creds.pass !== env.DASHBOARD_PASS) {
    return deny(403, "ADMIN_AUTH_INVALID", maxVersions);
  }

  return { ok: true, via: "admin" };
}

export function requireReportVersionListAccess(input: {
  report: ReportVersionListAccessReport;
  accessTokenRaw: string | null | undefined;
  authHeader: string | null;
  env?: AuthEnv;
  maxVersions: number;
}): ReportVersionListAccessResult {
  const env = input.env ?? process.env;
  const dbToken =
    typeof input.report.access_token === "string" ? input.report.access_token.trim() : "";
  const rawToken = typeof input.accessTokenRaw === "string" ? input.accessTokenRaw : "";

  if (!dbToken) {
    return requireAdminAccess(input.authHeader, env, input.maxVersions);
  }

  if (reportAccessTokensMatch(rawToken, dbToken)) {
    const expiresAt = input.report.token_expires_at;
    if (
      expiresAt != null &&
      String(expiresAt) !== "" &&
      new Date(String(expiresAt)) < new Date()
    ) {
      return deny(403, "ACCESS_TOKEN_EXPIRED", input.maxVersions);
    }

    return { ok: true, via: "token" };
  }

  const adminGate = requireAdminAccess(input.authHeader, env, input.maxVersions);
  if (adminGate.ok) {
    return adminGate;
  }

  return deny(403, "INVALID_ACCESS_TOKEN", input.maxVersions);
}
