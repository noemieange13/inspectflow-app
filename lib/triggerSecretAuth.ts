export type TriggerSecretAuthResult =
  | { ok: true }
  | { ok: false; status: number; body: Record<string, unknown> };

function configuredTriggerSecret(): string {
  return process.env.TRIGGER_INSPECTION_SECRET?.trim() ?? "";
}

export function hasExactTriggerSecret(req: Request): boolean {
  const secret = configuredTriggerSecret();
  if (!secret) return false;
  return (req.headers.get("x-trigger-secret") ?? "") === secret;
}

export function assertExactTriggerSecret(req: Request): TriggerSecretAuthResult {
  const secret = configuredTriggerSecret();
  if (!secret) {
    return {
      ok: false,
      status: 500,
      body: { success: false, error: "TRIGGER_INSPECTION_SECRET is not configured" },
    };
  }
  if (!hasExactTriggerSecret(req)) {
    return {
      ok: false,
      status: 401,
      body: { success: false, error: "Unauthorized" },
    };
  }
  return { ok: true };
}
