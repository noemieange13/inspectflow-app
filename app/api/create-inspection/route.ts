import { NextRequest, NextResponse } from "next/server";
import { createServiceRoleClient } from "@/lib/supabaseServer";
import { buildCreateInspectionInsert } from "@/lib/createInspectionReport";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const insertRow = buildCreateInspectionInsert(body);

    const supabase = await createServiceRoleClient();

    // Legacy quick-start writer: keep rows private by URL token even when no owner exists yet.
    const { data, error } = await supabase
      .from("reports")
      .insert(insertRow)
      .select("id")
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
      access_token: insertRow.access_token,
    });
  } catch (error) {
    console.error("Erreur API création inspection:", error);
    return NextResponse.json(
      { error: "Erreur serveur" },
      { status: 500 }
    );
  }
}
