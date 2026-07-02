import { NextRequest, NextResponse } from "next/server";

import { resolveActiveOrganizationId } from "@/lib/currentOrganization";
import {
  buildDevInspectorProfileInput,
  isDevInspectorProfileConfigured,
  mergeDevInspectorProfilePatch,
} from "@/lib/devInspectorProfileStore";
import { isDevAuthBypass } from "@/lib/devInspectorMode";
import { resolveDevSupabaseUserId } from "@/lib/devInspectorUserId";
import {
  formatApiErrorMessage,
  isSupabaseNetworkError,
  OFFLINE_DEV_USER_MESSAGE,
} from "@/lib/devOffline/errors";
import {
  loadOfflineDevProfile,
  offlineProfileResponse,
  saveOfflineDevProfile,
} from "@/lib/devOffline/profile";
import { shouldUseOfflineDevStore } from "@/lib/devOffline/probe";
import {
  inspectorProfileRowToInput,
  isInspectorProfileConfigured,
  loadInspectorProfileByUserId,
  normalizeInspectorProfileInput,
} from "@/lib/inspectorProfile";
import { createServiceRoleClient } from "@/lib/supabaseServer";
import { resolveBearerUserId } from "@/lib/supabaseAuthFromRequest";

async function resolveProfileUserId(req: NextRequest): Promise<string | null> {
  const fromAuth = await resolveBearerUserId(req);
  if (fromAuth) return fromAuth;
  if (isDevAuthBypass()) return resolveDevSupabaseUserId();
  return null;
}

export async function GET(req: NextRequest) {
  const userId = await resolveProfileUserId(req);
  if (!userId) {
    return NextResponse.json({ success: false, error: "access_denied" }, { status: 403 });
  }

  if (isDevAuthBypass() && (await shouldUseOfflineDevStore())) {
    const profile = await loadOfflineDevProfile();
    return NextResponse.json(offlineProfileResponse(profile));
  }

  try {
    if (isDevAuthBypass()) {
      const devProfile = buildDevInspectorProfileInput();
      try {
        const supabase = await createServiceRoleClient();
        const row = await loadInspectorProfileByUserId(supabase, userId);
        const merged = row
          ? normalizeInspectorProfileInput({
              ...devProfile,
              ...inspectorProfileRowToInput(row),
            })
          : devProfile;
        return NextResponse.json({
          success: true,
          profile: merged,
          configured: isInspectorProfileConfigured(merged) || isDevInspectorProfileConfigured(),
          dev_inspector: true,
        });
      } catch (e) {
        if (isSupabaseNetworkError(e)) {
          const profile = await loadOfflineDevProfile();
          return NextResponse.json(offlineProfileResponse(profile));
        }
        throw e;
      }
    }

    const supabase = await createServiceRoleClient();
    const row = await loadInspectorProfileByUserId(supabase, userId);
    return NextResponse.json({
      success: true,
      profile: row ? inspectorProfileRowToInput(row) : null,
      configured: row ? isInspectorProfileConfigured(inspectorProfileRowToInput(row)) : false,
    });
  } catch (e) {
    if (isDevAuthBypass()) {
      const profile = await loadOfflineDevProfile();
      return NextResponse.json(offlineProfileResponse(profile));
    }
    return NextResponse.json(
      { success: false, error: formatApiErrorMessage(e) },
      { status: 500 },
    );
  }
}

export async function PUT(req: NextRequest) {
  const userId = await resolveProfileUserId(req);
  if (!userId) {
    return NextResponse.json({ success: false, error: "access_denied" }, { status: 403 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ success: false, error: "Invalid JSON" }, { status: 400 });
  }

  const input = normalizeInspectorProfileInput(body);
  const now = new Date().toISOString();

  if (isDevAuthBypass() && (await shouldUseOfflineDevStore())) {
    const merged = await saveOfflineDevProfile(input);
    return NextResponse.json(offlineProfileResponse(merged));
  }

  try {
    if (isDevAuthBypass()) {
      const merged = mergeDevInspectorProfilePatch(input);
      try {
        const supabase = await createServiceRoleClient();
        const organizationId = await resolveActiveOrganizationId(
          supabase,
          userId,
          input.organization_id,
        );
        const { data: prior } = await supabase
          .from("inspector_profiles")
          .select("created_at")
          .eq("user_id", userId)
          .maybeSingle();

        await supabase.from("inspector_profiles").upsert(
          {
            user_id: userId,
            ...merged,
            organization_id: organizationId ?? merged.organization_id,
            updated_at: now,
            ...(prior?.created_at ? {} : { created_at: now }),
          },
          { onConflict: "user_id" },
        );
      } catch (e) {
        if (isSupabaseNetworkError(e)) {
          const saved = await saveOfflineDevProfile(input);
          return NextResponse.json(offlineProfileResponse(saved));
        }
        throw e;
      }

      await saveOfflineDevProfile(merged);
      return NextResponse.json({
        success: true,
        profile: merged,
        configured: isInspectorProfileConfigured(merged) || isDevInspectorProfileConfigured(),
        dev_inspector: true,
      });
    }

    const supabase = await createServiceRoleClient();
    const organizationId = await resolveActiveOrganizationId(
      supabase,
      userId,
      input.organization_id,
    );
    const { data: prior } = await supabase
      .from("inspector_profiles")
      .select("created_at")
      .eq("user_id", userId)
      .maybeSingle();

    const { data, error } = await supabase
      .from("inspector_profiles")
      .upsert(
        {
          user_id: userId,
          ...input,
          organization_id: organizationId ?? input.organization_id,
          updated_at: now,
          ...(prior?.created_at ? {} : { created_at: now }),
        },
        { onConflict: "user_id" },
      )
      .select("*")
      .single();

    if (error) {
      console.error("inspector-profile PUT:", error);
      return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }

    const rowInput = inspectorProfileRowToInput(
      (await loadInspectorProfileByUserId(supabase, userId)) ?? {
        user_id: userId,
        ...input,
        created_at: now,
        updated_at: now,
      },
    );

    return NextResponse.json({
      success: true,
      profile: data ? normalizeInspectorProfileInput(data) : input,
      configured: isInspectorProfileConfigured(rowInput),
    });
  } catch (e) {
    if (isDevAuthBypass()) {
      const saved = await saveOfflineDevProfile(input);
      return NextResponse.json({
        ...offlineProfileResponse(saved),
        offline_message: OFFLINE_DEV_USER_MESSAGE,
      });
    }
    return NextResponse.json(
      { success: false, error: formatApiErrorMessage(e) },
      { status: 500 },
    );
  }
}
