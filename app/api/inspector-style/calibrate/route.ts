import { NextRequest, NextResponse } from "next/server";

import {
  buildStyleProfileFromAnalysis,
  parseStyleFromReportText,
} from "@/lib/inspector_style_calibration";
import { compareCalibratedStyle } from "@/lib/inspector_style_matcher";
import {
  inferReportStyleFromStyleProfile,
  normalizeInspectorReportStyleV1,
  normalizeInspectorStyleProfileV1,
} from "@/lib/inspectorReportStyle";
import {
  inspectorProfileRowToInput,
  loadInspectorProfileByUserId,
  normalizeInspectorProfileInput,
} from "@/lib/inspectorProfile";
import { extractPlainTextLocal } from "@/lib/pdfTextExtractLocal";
import { createServiceRoleClient } from "@/lib/supabaseServer";
import { resolveBearerUserId } from "@/lib/supabaseAuthFromRequest";

const MAX_BYTES = 12 * 1024 * 1024;

export async function POST(req: NextRequest) {
  const userId = await resolveBearerUserId(req);
  if (!userId) {
    return NextResponse.json({ success: false, error: "access_denied" }, { status: 403 });
  }

  let formData: FormData;
  try {
    formData = await req.formData();
  } catch {
    return NextResponse.json({ success: false, error: "Corps invalide" }, { status: 400 });
  }

  const file = formData.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ success: false, error: "Fichier manquant" }, { status: 400 });
  }

  const buf = Buffer.from(await file.arrayBuffer());
  if (buf.length > MAX_BYTES) {
    return NextResponse.json(
      { success: false, error: "Fichier trop volumineux (max 12 Mo)" },
      { status: 400 },
    );
  }

  const fileName = file.name || "report.pdf";
  let text = "";
  try {
    text = extractPlainTextLocal(buf, fileName);
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ success: false, error: message }, { status: 400 });
  }

  if (!text.trim() || text.trim().length < 80) {
    return NextResponse.json(
      { success: false, error: "Texte insuffisant pour calibrer le style." },
      { status: 400 },
    );
  }

  const analysis = parseStyleFromReportText(text);
  const style_profile = buildStyleProfileFromAnalysis(analysis);
  const inferred_style = inferReportStyleFromStyleProfile(style_profile);

  try {
    const supabase = await createServiceRoleClient();
    const row = await loadInspectorProfileByUserId(supabase, userId);
    const input = row
      ? inspectorProfileRowToInput(row)
      : normalizeInspectorProfileInput({});
    const now = new Date().toISOString();

    const { data, error } = await supabase
      .from("inspector_profiles")
      .upsert(
        {
          user_id: userId,
          ...input,
          inspector_report_style_v1: inferred_style,
          inspector_style_profile_v1: style_profile,
          updated_at: now,
          ...(row?.created_at ? {} : { created_at: now }),
        },
        { onConflict: "user_id" },
      )
      .select("*")
      .single();

    if (error) {
      console.error("inspector-style calibrate:", error);
      return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }

    const profile = normalizeInspectorProfileInput(data);
    const matchPreview = compareCalibratedStyle(style_profile, analysis.sanitized_text);

    return NextResponse.json({
      success: true,
      style_profile: normalizeInspectorStyleProfileV1(style_profile),
      inspector_report_style_v1: normalizeInspectorReportStyleV1(inferred_style),
      profile,
      match_preview: matchPreview,
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
