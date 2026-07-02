import {
  buildDevInspectorProfileInput,
  mergeDevInspectorProfilePatch,
} from "@/lib/devInspectorProfileStore";
import { isDevAuthBypass } from "@/lib/devInspectorMode";
import {
  isInspectorProfileConfigured,
  normalizeInspectorProfileInput,
  type InspectorProfileInput,
} from "@/lib/inspectorProfile";

import { readDevOfflineJson, writeDevOfflineJson } from "./serverStore";

const PROFILE_FILE = "profile.json";

export async function loadOfflineDevProfile(): Promise<InspectorProfileInput> {
  const stored = await readDevOfflineJson<InspectorProfileInput>(PROFILE_FILE);
  if (stored) {
    return normalizeInspectorProfileInput({
      ...buildDevInspectorProfileInput(),
      ...stored,
    });
  }
  return buildDevInspectorProfileInput();
}

export async function saveOfflineDevProfile(
  patch: InspectorProfileInput,
): Promise<InspectorProfileInput> {
  mergeDevInspectorProfilePatch(patch);
  const merged = buildDevInspectorProfileInput();
  await writeDevOfflineJson(PROFILE_FILE, merged);
  return merged;
}

export function offlineProfileResponse(profile: InspectorProfileInput) {
  if (!isDevAuthBypass()) {
    throw new Error("offline profile only in dev bypass");
  }
  return {
    success: true,
    profile,
    configured: isInspectorProfileConfigured(profile),
    dev_inspector: true,
    offline_dev: true,
    offline_message:
      "Supabase is unavailable. Running in Offline Development Mode.",
  };
}
