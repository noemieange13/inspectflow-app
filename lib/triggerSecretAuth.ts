export function isExactTriggerSecret(req: Request): boolean {
  const secret = process.env.TRIGGER_INSPECTION_SECRET?.trim();
  if (!secret) return false;
  return (req.headers.get("x-trigger-secret") ?? "") === secret;
}

export function requireExactTriggerSecretIfConfigured(
  req: Request,
): { ok: true } | { ok: false; status: number; body: Record<string, unknown> } {
  const secret = process.env.TRIGGER_INSPECTION_SECRET?.trim();
  if (!secret || isExactTriggerSecret(req)) {
    return { ok: true };
  }
  return {
    ok: false,
    status: 401,
    body: { success: false, error: "Unauthorized" },
  };
}
