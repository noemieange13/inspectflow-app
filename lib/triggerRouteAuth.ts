export function configuredTriggerSecret(
  raw = process.env.TRIGGER_INSPECTION_SECRET,
): string {
  return typeof raw === "string" ? raw.trim() : "";
}

/**
 * Machine endpoints may accept x-trigger-secret, but never Origin/Referer:
 * those headers are client-controlled outside the browser.
 */
export function hasValidTriggerSecret(
  req: Request,
  rawSecret = process.env.TRIGGER_INSPECTION_SECRET,
): boolean {
  const secret = configuredTriggerSecret(rawSecret);
  if (!secret) return false;
  return (req.headers.get("x-trigger-secret") ?? "") === secret;
}
