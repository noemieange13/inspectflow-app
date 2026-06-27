export function configuredTriggerSecret(): string {
  return process.env.TRIGGER_INSPECTION_SECRET?.trim() ?? "";
}

export function hasValidTriggerSecret(req: Request): boolean {
  const secret = configuredTriggerSecret();
  return !!secret && (req.headers.get("x-trigger-secret") ?? "") === secret;
}

export function requireExactTriggerSecret(req: Request): Response | null {
  const secret = configuredTriggerSecret();
  if (!secret || hasValidTriggerSecret(req)) return null;
  return Response.json(
    { success: false, error: "Unauthorized" },
    { status: 401 },
  );
}
