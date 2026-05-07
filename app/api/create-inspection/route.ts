import { NextRequest, NextResponse } from "next/server";
import { createServiceRoleClient } from "@/lib/supabaseServer";

export async function POST(request: NextRequest) {
  try {
    const { clientName, address, inspectionType, language } = await request.json();

    const supabase = await createServiceRoleClient();

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

    return NextResponse.json({ reportId: data.id });
  } catch (error) {
    console.error("Erreur API création inspection:", error);
    return NextResponse.json(
      { error: "Erreur serveur" },
      { status: 500 }
    );
  }
}
