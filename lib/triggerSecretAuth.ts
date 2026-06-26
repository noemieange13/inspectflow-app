export function validateTriggerSecretHeader(req: Request): boolean {
  const secret = process.env.TRIGGER_INSPECTION_SECRET?.trim();
  if (!secret) {
    return true;
  }

  return req.headers.get("x-trigger-secret") === secret;
}

export function triggerSecretUnauthorizedResponse(
  body: Record<string, unknown> = { success: false, error: "Unauthorized" },
): Response {
  return Response.json(body, { status: 401 });
}
