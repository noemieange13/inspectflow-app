import type { SupabaseClient } from "@supabase/supabase-js";

import { resolveActiveOrganizationId } from "@/lib/currentOrganization";
import {
  buildDevInspectorProfileInput,
  isDevInspectorProfileConfigured,
} from "@/lib/devInspectorProfileStore";
import { isDevAuthBypass } from "@/lib/devInspectorMode";
import {
  applyProfessionalSnapshotToReportPayload,
  inspectorProfileRowToInput,
  isInspectorProfileConfigured,
  loadInspectorProfileByUserId,
} from "@/lib/inspectorProfile";

/**
 * Charge le profil DB de l'utilisateur et l'embarque dans le payload rapport
 * (snapshot 8J + inspection_defaults_v1 + legacy).
 * En dev bypass, repli sur le profil Steve local si DB absent.
 */
export async function embedInspectorProfileInReportPayload(
  supabase: SupabaseClient,
  userId: string,
  payload: Record<string, unknown>,
  preferredOrganizationId?: string | null,
): Promise<Record<string, unknown>> {
  try {
    const row = await loadInspectorProfileByUserId(supabase, userId);
    if (row) {
      const input = inspectorProfileRowToInput(row);
      if (isInspectorProfileConfigured(input)) {
        const organizationId = await resolveActiveOrganizationId(
          supabase,
          userId,
          preferredOrganizationId ?? input.organization_id,
        );
        return applyProfessionalSnapshotToReportPayload(
          payload,
          { ...input, organization_id: organizationId ?? input.organization_id },
          undefined,
          organizationId,
        );
      }
    }

    if (isDevAuthBypass() && isDevInspectorProfileConfigured()) {
      const devInput = buildDevInspectorProfileInput();
      return applyProfessionalSnapshotToReportPayload(payload, devInput, undefined, null);
    }

    return payload;
  } catch (e) {
    console.warn(
      "embedInspectorProfileInReportPayload:",
      e instanceof Error ? e.message : e,
    );
    if (isDevAuthBypass() && isDevInspectorProfileConfigured()) {
      try {
        const devInput = buildDevInspectorProfileInput();
        return applyProfessionalSnapshotToReportPayload(payload, devInput, undefined, null);
      } catch {
        /* ignore */
      }
    }
    return payload;
  }
}
