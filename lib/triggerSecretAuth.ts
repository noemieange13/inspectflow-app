export type TriggerSecretAuthResult =
  | { ok: true; mode: "exact-secret" | "local-dev" }
  | {
      ok: false;
      status: number;
      body: { success: false; error: string; code?: string };
    };

function isLoopbackHostname(hostname: string): boolean {
  const h = hostname.trim().toLowerCase();
  return (
    h === "localhost" ||
    h === "127.0.0.1" ||
    h === "::1" ||
    h === "[::1]"
  );
}

function isLocalDevelopmentRequest(req: Request): boolean {
  if (process.env.NODE_ENV !== "development") return false;

  try {
    if (isLoopbackHostname(new URL(req.url).hostname)) return true;
  } catch {
    /* ignore malformed/nonstandard request URLs */
  }

  const host = (req.headers.get("host") ?? "").trim();
  const hostOnly = host.split(":")[0] ?? "";
  return hostOnly.length > 0 && isLoopbackHostname(hostOnly);
}

export function hasExactTriggerSecret(req: Request): boolean {
  const secret = process.env.TRIGGER_INSPECTION_SECRET?.trim() ?? "";
  if (!secret) return false;
  const provided = req.headers.get("x-trigger-secret")?.trim() ?? "";
  return provided === secret;
}

/**
 * Authenticates server-only automation endpoints.
 *
 * Origin/Referer are intentionally ignored: callers control them and they are
 * not credentials. In local development only, a missing secret is tolerated so
 * the dev helper pages keep working without production credentials.
 */
export function requireExactTriggerSecret(req: Request): TriggerSecretAuthResult {
  const secret = process.env.TRIGGER_INSPECTION_SECRET?.trim() ?? "";
  if (secret) {
    if (hasExactTriggerSecret(req)) {
      return { ok: true, mode: "exact-secret" };
    }
    return {
      ok: false,
      status: 401,
      body: {
        success: false,
        error: "Unauthorized",
        code: "trigger_secret_invalid",
      },
    };
  }

  if (isLocalDevelopmentRequest(req)) {
    return { ok: true, mode: "local-dev" };
  }

  return {
    ok: false,
    status: 500,
    body: {
      success: false,
      error: "TRIGGER_INSPECTION_SECRET is not configured",
      code: "trigger_secret_missing",
    },
  };
}
