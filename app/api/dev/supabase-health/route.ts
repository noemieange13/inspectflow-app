import { isDevAuthBypass } from "@/lib/devInspectorMode";
import { OFFLINE_DEV_USER_MESSAGE } from "@/lib/devOffline/errors";
import { isSupabaseReachable } from "@/lib/devOffline/probe";

export async function GET() {
  if (!isDevAuthBypass()) {
    return Response.json({ online: true, offline_dev: false });
  }
  const online = await isSupabaseReachable(true);
  return Response.json({
    online,
    offline_dev: !online,
    offline_message: online ? null : OFFLINE_DEV_USER_MESSAGE,
  });
}
