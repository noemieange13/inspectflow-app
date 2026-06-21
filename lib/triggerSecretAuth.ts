export type TriggerSecretAuthResult =
  | { ok: true }
  | { ok: false; status: 401; body: { success: false; error: "Unauthorized" } };

/**
 * Shared guard for internal service routes. Origin/Referer are request metadata,
 * not credentials: when a trigger secret is configured, only the exact header
 * value authorizes the request.
 */
export function requireTriggerSecret(req: Request): TriggerSecretAuthResult {
  const secret = process.env.TRIGGER_INSPECTION_SECRET?.trim();
  if (!secret) return { ok: true };

  const provided = req.headers.get("x-trigger-secret") ?? "";
  if (provided === secret) return { ok: true };

  return {
    ok: false,
    status: 401,
    body: { success: false, error: "Unauthorized" },
  };
}
