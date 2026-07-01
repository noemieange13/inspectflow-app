/**
 * Shared guard for server-to-server trigger routes.
 *
 * Origin and Referer are client-controlled request headers, so they are never
 * accepted as credentials. When a trigger secret is configured, callers must
 * provide an exact `x-trigger-secret` match.
 */
export function hasExactTriggerSecret(req: Request): boolean {
  const secret = process.env.TRIGGER_INSPECTION_SECRET;
  if (!secret) return false;
  return req.headers.get("x-trigger-secret") === secret;
}

export function requireExactTriggerSecretIfConfigured(
  req: Request,
): { ok: true } | { ok: false; response: Response } {
  const secret = process.env.TRIGGER_INSPECTION_SECRET;
  if (!secret) return { ok: true };
  if (hasExactTriggerSecret(req)) return { ok: true };
  return {
    ok: false,
    response: Response.json(
      { success: false, error: "Unauthorized" },
      { status: 401 },
    ),
  };
}
