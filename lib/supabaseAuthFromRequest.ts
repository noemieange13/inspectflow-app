import { createClient } from "@supabase/supabase-js";

/**
 * Vérifie `Authorization: Bearer <jwt Supabase>` contre `reports.user_id`.
 * Permet d’unifier l’accès API : session connectée OU jeton rapport (lien partagé).
 */
export async function verifyBearerMatchesReportOwner(
  req: Request,
  reportOwnerUserId: unknown,
): Promise<boolean> {
  const owner =
    typeof reportOwnerUserId === "string" && reportOwnerUserId.length > 0
      ? reportOwnerUserId
      : null;
  if (!owner) return false;

  const auth = req.headers.get("authorization") ?? "";
  const m = /^Bearer\s+(\S+)/i.exec(auth.trim());
  if (!m) return false;
  const jwt = m[1];

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return false;

  const supabase = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data, error } = await supabase.auth.getUser(jwt);
  if (error || !data?.user?.id) return false;
  return data.user.id === owner;
}
