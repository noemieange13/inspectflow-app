import { NextRequest, NextResponse } from "next/server";

import { stampDevInspectorAttribution } from "@/lib/devInspectorMode";
import { resolveDevSupabaseUserId } from "@/lib/devInspectorUserId";
import { embedInspectorProfileInReportPayload } from "@/lib/embedInspectorProfileInReportPayload";
import { inferJurisdictionFromAddress } from "@/lib/inspectorHomeList";
import {
  defaultReportTokenExpiresAt,
  generateReportAccessToken,
} from "@/lib/reportAccessToken";
import { createServiceRoleClient } from "@/lib/supabaseServer";

async function resolveDevUserId(): Promise<string | null> {
  return resolveDevSupabaseUserId();
}

export async function POST(req: NextRequest) {
  if (process.env.NODE_ENV !== "development") {
    return NextResponse.json({ success: false, error: "Dev only" }, { status: 403 });
  }

  let body: unknown = {};
  try {
    body = await req.json();
  } catch {
    /* defaults OK */
  }

  const payload = body && typeof body === "object" ? (body as Record<string, unknown>) : {};
  const clientName =
    typeof payload.clientName === "string" && payload.clientName.trim()
      ? payload.clientName.trim()
      : "Client test";
  const address =
    typeof payload.address === "string" && payload.address.trim()
      ? payload.address.trim()
      : "123 rue Test, Montréal";
  const inspectionType =
    typeof payload.inspectionType === "string" && payload.inspectionType.trim()
      ? payload.inspectionType.trim()
      : "residential";
  const documentIntake =
    payload.document_intake_v1 && typeof payload.document_intake_v1 === "object"
      ? payload.document_intake_v1
      : null;

  try {
    const userId = await resolveDevUserId();
    if (!userId) {
      return NextResponse.json(
        {
          success: false,
          error:
            "Aucun user_id dev disponible. Définissez DEV_INSPECTOR_USER_ID ou créez un utilisateur Supabase.",
        },
        { status: 503 },
      );
    }

    const supabase = await createServiceRoleClient();
    const accessToken = generateReportAccessToken();
    const tokenExpiresAt = defaultReportTokenExpiresAt().toISOString();
    const jurisdiction = inferJurisdictionFromAddress(address);

    let reportPayload: Record<string, unknown> = {
      cover_v1: {
        client_name: clientName,
        address,
        inspection_type: inspectionType,
        language: "fr",
        jurisdiction,
        created_at: new Date().toISOString(),
        dev_test: true,
      },
    };
    if (documentIntake) {
      reportPayload.document_intake_v1 = documentIntake;
    }

    reportPayload = await embedInspectorProfileInReportPayload(supabase, userId, reportPayload);
    reportPayload = stampDevInspectorAttribution(reportPayload);
    const { data, error } = await supabase
      .from("reports")
      .insert({
        user_id: userId,
        access_token: accessToken,
        token_expires_at: tokenExpiresAt,
        payload: reportPayload,
        created_at: new Date().toISOString(),
      })
      .select("id")
      .single();

    if (error || !data) {
      console.error("dev/create-test-inspection:", error);
      return NextResponse.json(
        { success: false, error: "Erreur lors de la création test" },
        { status: 500 },
      );
    }

    const reportId = String((data as { id: unknown }).id);
    const reportUrl = `/report/${encodeURIComponent(reportId)}?token=${encodeURIComponent(accessToken)}`;

    return NextResponse.json({
      success: true,
      reportId,
      inspection_id: reportId,
      token: accessToken,
      reportUrl,
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
