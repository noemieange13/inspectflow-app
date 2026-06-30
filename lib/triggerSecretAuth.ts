export function hasExactTriggerSecret(req: Request): boolean {
  const secret = process.env.TRIGGER_INSPECTION_SECRET?.trim();
  if (!secret) return true;
  return req.headers.get("x-trigger-secret") === secret;
}

