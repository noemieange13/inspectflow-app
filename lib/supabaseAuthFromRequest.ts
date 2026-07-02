import type { NextRequest } from "next/server";
import { createClient } from "@supabase/supabase-js";

import { isDevAuthBypass } from "@/lib/devInspectorMode";
import { resolveDevSupabaseUserId } from "@/lib/devInspectorUserId";
import { readBearerToken, resolveRequestAuth } from "@/lib/supabaseRequestAuth";

/**
 * Vérifie `Authorization: Bearer <jwt Supabase>` contre `reports.user_id`.
 * Permet d'unifier l'accès API : session connectée OU jeton rapport (lien partagé).
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

  const jwt = readBearerToken(req);
  if (!jwt) return false;

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

/** JWT Supabase — identifiant utilisateur sans exiger propriété du rapport (Phase 6C). */
export async function resolveBearerUserId(req: Request): Promise<string | null> {
  if ("cookies" in req && typeof (req as NextRequest).cookies?.getAll === "function") {
    const state = await resolveRequestAuth(req as NextRequest, "resolveBearerUserId");
    if (state.userId) return state.userId;
  } else {
    const jwt = readBearerToken(req);
    if (jwt) {
      const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
      const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
      if (url && key) {
        const supabase = createClient(url, key, {
          auth: { persistSession: false, autoRefreshToken: false },
        });
        const { data, error } = await supabase.auth.getUser(jwt);
        if (!error && data?.user?.id) return data.user.id;
      }
    }
  }

  if (isDevAuthBypass()) {
    return resolveDevSupabaseUserId();
  }

  return null;
}
