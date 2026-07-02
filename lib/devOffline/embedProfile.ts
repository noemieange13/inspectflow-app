import { applyProfessionalSnapshotToReportPayload } from "@/lib/inspectorProfile";

import { loadOfflineDevProfile } from "./profile";

export async function embedOfflineDevProfileInPayload(
  payload: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  const profile = await loadOfflineDevProfile();
  return applyProfessionalSnapshotToReportPayload(payload, profile, undefined, null);
}
