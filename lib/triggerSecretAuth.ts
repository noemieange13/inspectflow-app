export function hasExactTriggerSecret(req: Request): boolean {
  const secret = process.env.TRIGGER_INSPECTION_SECRET?.trim() ?? "";
  if (!secret) return false;
  return (req.headers.get("x-trigger-secret") ?? "") === secret;
}

export function rejectMissingExactTriggerSecret(
  req: Request,
  body: Record<string, unknown> = { success: false, error: "Unauthorized" },
): Response | null {
  const secret = process.env.TRIGGER_INSPECTION_SECRET?.trim() ?? "";
  if (!secret) return null;
  return hasExactTriggerSecret(req) ? null : Response.json(body, { status: 401 });
}
