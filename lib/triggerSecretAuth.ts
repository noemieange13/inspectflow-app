export function isTriggerSecretAuthorized(
  req: Request,
  secret = process.env.TRIGGER_INSPECTION_SECRET,
): boolean {
  const expected = typeof secret === "string" ? secret.trim() : "";
  if (!expected) return true;
  return req.headers.get("x-trigger-secret") === expected;
}

export function triggerSecretUnauthorizedResponse(
  body: Record<string, unknown> = { success: false, error: "Unauthorized" },
): Response {
  return Response.json(body, { status: 401 });
}
