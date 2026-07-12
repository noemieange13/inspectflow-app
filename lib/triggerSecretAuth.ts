export function hasExactTriggerSecret(req: Request): boolean {
  const secret = process.env.TRIGGER_INSPECTION_SECRET;
  if (!secret) return false;
  return (req.headers.get("x-trigger-secret") ?? "") === secret;
}

export function requireExactTriggerSecret(req: Request): Response | null {
  const secret = process.env.TRIGGER_INSPECTION_SECRET;
  if (!secret) return null;
  return hasExactTriggerSecret(req)
    ? null
    : Response.json({ success: false, error: "Unauthorized" }, { status: 401 });
}
