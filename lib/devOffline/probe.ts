import { isDevAuthBypass } from "@/lib/devInspectorMode";
import { isSupabaseNetworkError } from "@/lib/devOffline/errors";

let cachedOnline: boolean | null = null;
let cachedAt = 0;
const CACHE_MS = 15_000;
const PROBE_TIMEOUT_MS = 2_500;

export function resetSupabaseProbeCache(): void {
  cachedOnline = null;
  cachedAt = 0;
}

async function probeSupabaseRest(): Promise<boolean> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const key =
    process.env.SUPABASE_SERVICE_ROLE_KEY?.trim() ||
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim();
  if (!url || !key) return false;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), PROBE_TIMEOUT_MS);
  try {
    const res = await fetch(`${url.replace(/\/$/, "")}/rest/v1/reports?select=id&limit=1`, {
      headers: {
        apikey: key,
        Authorization: `Bearer ${key}`,
      },
      signal: controller.signal,
    });
    // Any HTTP response means DNS/TCP succeeded (401/403/404 still = reachable).
    return res.status > 0;
  } catch (e) {
    if (isSupabaseNetworkError(e)) return false;
    return false;
  } finally {
    clearTimeout(timer);
  }
}

export async function isSupabaseReachable(force = false): Promise<boolean> {
  if (!isDevAuthBypass()) return true;
  if (process.env.DEV_SUPABASE_FORCE_OFFLINE === "true") {
    cachedOnline = false;
    cachedAt = Date.now();
    return false;
  }
  const now = Date.now();
  if (!force && cachedOnline !== null && now - cachedAt < CACHE_MS) {
    return cachedOnline;
  }
  try {
    cachedOnline = await probeSupabaseRest();
    cachedAt = now;
    return cachedOnline;
  } catch (e) {
    cachedOnline = !isSupabaseNetworkError(e);
    if (isSupabaseNetworkError(e)) {
      cachedOnline = false;
    }
    cachedAt = now;
    return cachedOnline ?? false;
  }
}

export async function shouldUseOfflineDevStore(): Promise<boolean> {
  if (!isDevAuthBypass()) return false;
  return !(await isSupabaseReachable());
}
