export function hasExactTriggerSecret(req: Request): boolean {
  const secret = process.env.TRIGGER_INSPECTION_SECRET?.trim();
  if (!secret) return false;
  return req.headers.get("x-trigger-secret") === secret;
}

export function requireExactTriggerSecret(req: Request): Response | null {
  const secret = process.env.TRIGGER_INSPECTION_SECRET?.trim();
  if (!secret) return null;
  if (req.headers.get("x-trigger-secret") === secret) return null;
  return Response.json({ success: false, error: "Unauthorized" }, { status: 401 });
}
