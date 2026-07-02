import { NextRequest, NextResponse } from "next/server";

import { embedInspectorProfileInReportPayload } from "@/lib/embedInspectorProfileInReportPayload";
import { createServiceRoleClient } from "@/lib/supabaseServer";
import { resolveBearerUserId } from "@/lib/supabaseAuthFromRequest";

export async function POST(request: NextRequest) {
  try {
    const { clientName, address, inspectionType, language } = await request.json();

    const supabase = await createServiceRoleClient();
    const userId = await resolveBearerUserId(request);

    let payload: Record<string, unknown> = {
      cover_v1: {
        client_name: clientName,
        address: address,
        inspection_type: inspectionType,
        language: language,
        created_at: new Date().toISOString(),
      },
    };

    if (userId) {
      payload = await embedInspectorProfileInReportPayload(supabase, userId, payload);
    }

    const insertRow: Record<string, unknown> = {
      payload,
      created_at: new Date().toISOString(),
    };
    if (userId) {
      insertRow.user_id = userId;
    }

    const { data, error } = await supabase.from("reports").insert(insertRow).select().single();

    if (error) {
      console.error("Erreur création inspection:", error);
      return NextResponse.json(
        { error: "Erreur lors de la création de l'inspection" },
        { status: 500 }
      );
    }

    return NextResponse.json({ reportId: data.id });
  } catch (error) {
    console.error("Erreur API création inspection:", error);
    return NextResponse.json(
      { error: "Erreur serveur" },
      { status: 500 }
    );
  }
}
