export function assertTriggerSecret(req: Request): Response | null {
  const secret = process.env.TRIGGER_INSPECTION_SECRET;
  if (!secret) return null;

  const provided = req.headers.get("x-trigger-secret") ?? "";
  if (provided === secret) return null;

  return Response.json(
    { success: false, error: "Unauthorized" },
    { status: 401 },
  );
}
