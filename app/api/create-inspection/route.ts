import { NextRequest, NextResponse } from "next/server";
import { generateReportAccessToken } from "@/lib/reportAccessToken";
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
        access_token: accessToken,
        status: "draft",
        created_at: new Date().toISOString(),
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

    const reportUrl = `/report/${encodeURIComponent(data.id)}?token=${encodeURIComponent(accessToken)}`;
    return NextResponse.json({ reportId: data.id, access_token: accessToken, reportUrl });
  } catch (error) {
    console.error("Erreur API création inspection:", error);
    return NextResponse.json(
      { error: "Erreur serveur" },
      { status: 500 }
    );
  }
}
