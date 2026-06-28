/**
 * Machine-to-machine trigger auth. Browser-controlled Origin/Referer headers are
 * intentionally ignored; only the configured shared secret is a credential.
 */
export function hasExactTriggerSecret(req: Request): boolean {
  const secret = process.env.TRIGGER_INSPECTION_SECRET;
  if (!secret) return false;
  return req.headers.get("x-trigger-secret") === secret;
}
