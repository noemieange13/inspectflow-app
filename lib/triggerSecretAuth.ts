/**
 * Shared guard for server-side automation routes.
 *
 * Origin and Referer are request metadata, not credentials: non-browser callers
 * can forge them, so a configured trigger secret must be presented explicitly.
 */
export function hasValidTriggerSecret(req: Request): boolean {
  const secret = process.env.TRIGGER_INSPECTION_SECRET;
  if (!secret) return true;

  return req.headers.get("x-trigger-secret") === secret;
}
