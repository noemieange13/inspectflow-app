import { NextRequest, NextResponse } from "next/server";
import {
  defaultReportTokenExpiresAt,
  generateReportAccessToken,
} from "@/lib/reportAccessToken";
import { createServiceRoleClient } from "@/lib/supabaseServer";

export async function POST(request: NextRequest) {
  try {
    const { clientName, address, inspectionType, language } = await request.json();

    const supabase = await createServiceRoleClient();
    const accessToken = generateReportAccessToken();

    // Créer une nouvelle inspection avec les données de base
    const { data, error } = await supabase
      .from("reports")
      .insert({
        payload: {
          cover_v1: {
            client_name: clientName,
            address: address,
            inspection_type: inspectionType,
            language: language,
            created_at: new Date().toISOString(),
          },
        },
        created_at: new Date().toISOString(),
        access_token: accessToken,
        token_expires_at: defaultReportTokenExpiresAt().toISOString(),
        status: "draft",
      })
      .select()
      .single();

    if (error) {
      console.error("Erreur création inspection:", error);
      return NextResponse.json(
        { error: "Erreur lors de la création de l'inspection" },
        { status: 500 }
      );
    }

    return NextResponse.json({
      reportId: data.id,
      accessToken,
      reportUrl: `/report/${data.id}?token=${encodeURIComponent(accessToken)}`,
    });
  } catch (error) {
    console.error("Erreur API création inspection:", error);
    return NextResponse.json(
      { error: "Erreur serveur" },
      { status: 500 }
    );
  }
}
