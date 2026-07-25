/**
 * Edge mutators (reports-pdf, process-notes, create-report) must only accept the
 * service-role key. Supabase JWT verification alone is insufficient: the public
 * anon key is a valid JWT and must not authorize payload/PDF writes.
 */
export function hasServiceRoleCredentials(
  req: Request,
  serviceRoleKey: string,
): boolean {
  if (!serviceRoleKey) return false;
  const auth = (req.headers.get("authorization") ?? "").trim();
  const match = /^Bearer\s+(.+)$/i.exec(auth);
  const bearer = match?.[1]?.trim() ?? "";
  const apikey = req.headers.get("apikey")?.trim() ?? "";
  return bearer === serviceRoleKey && apikey === serviceRoleKey;
}
