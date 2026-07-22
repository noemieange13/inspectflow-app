export function hasExactTriggerSecret(
  req: Request,
  configuredSecret: string | null | undefined = process.env.TRIGGER_INSPECTION_SECRET,
): boolean {
  const secret = configuredSecret?.trim();
  if (!secret) return false;
  return (req.headers.get("x-trigger-secret") ?? "") === secret;
}

export function rejectMissingExactTriggerSecret(
  req: Request,
  configuredSecret: string | null | undefined = process.env.TRIGGER_INSPECTION_SECRET,
): Response | null {
  const secret = configuredSecret?.trim();
  if (!secret || hasExactTriggerSecret(req, secret)) return null;
  return Response.json(
    { success: false, error: "Unauthorized" },
    { status: 401 },
  );
}
