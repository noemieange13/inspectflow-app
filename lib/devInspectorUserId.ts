import { createServiceRoleClient } from "@/lib/supabaseServer";

import { isDevAuthBypass } from "@/lib/devInspectorMode";

const NIL_UUID = "00000000-0000-0000-0000-000000000000";
const OFFLINE_DEV_USER_UUID = "00000000-0000-4000-8000-devsteve01";

let cachedDevUserId: string | null | undefined;

function validUuid(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const t = v.trim();
  if (!t || t === NIL_UUID) return null;
  return /^[0-9a-f]{8}-/i.test(t) ? t : null;
}

/** Supabase UUID utilisé pour les écritures DB en dev (distinct de `DEV_INSPECTOR.id`). */
export async function resolveDevSupabaseUserId(): Promise<string | null> {
  if (!isDevAuthBypass()) return null;
  if (cachedDevUserId !== undefined) return cachedDevUserId;

  const fromEnv = validUuid(process.env.DEV_INSPECTOR_USER_ID);
  if (fromEnv) {
    cachedDevUserId = fromEnv;
    return fromEnv;
  }

  try {
    const supabase = await createServiceRoleClient();

    const { data: reportRow } = await supabase
      .from("reports")
      .select("user_id")
      .not("user_id", "is", null)
      .limit(1)
      .maybeSingle();
    const fromReport = validUuid(reportRow?.user_id);
    if (fromReport) {
      cachedDevUserId = fromReport;
      return fromReport;
    }

    const { data: inspRow } = await supabase
      .from("inspections")
      .select("owner_id")
      .not("owner_id", "is", null)
      .limit(1)
      .maybeSingle();
    const fromInsp = validUuid(inspRow?.owner_id);
    if (fromInsp) {
      cachedDevUserId = fromInsp;
      return fromInsp;
    }

    const { data: authUsers } = await supabase.auth.admin.listUsers({ perPage: 1 });
    const fromAuth = validUuid(authUsers?.users?.[0]?.id);
    cachedDevUserId = fromAuth;
    return fromAuth;
  } catch {
    cachedDevUserId = fromEnv ?? OFFLINE_DEV_USER_UUID;
    return cachedDevUserId;
  }
}

export function resetDevSupabaseUserIdCache(): void {
  cachedDevUserId = undefined;
}
