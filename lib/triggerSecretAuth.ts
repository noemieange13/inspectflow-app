export type TriggerSecretAuthResult =
  | { ok: true }
  | { ok: false; status: 401; body: { success: false; error: "Unauthorized" } };

/**
 * When a trigger secret is configured, only the exact server-provided header is
 * credential material. Origin/Referer are caller-controlled and must not bypass it.
 */
export function requireTriggerSecret(req: Request): TriggerSecretAuthResult {
  const secret = process.env.TRIGGER_INSPECTION_SECRET?.trim() ?? "";
  if (!secret) return { ok: true };

  const provided = req.headers.get("x-trigger-secret") ?? "";
  if (provided === secret) return { ok: true };

  return {
    ok: false,
    status: 401,
    body: { success: false, error: "Unauthorized" },
  };
}
