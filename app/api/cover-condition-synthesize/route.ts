import { synthesizeConditionGeneraleForReport } from "@/lib/coverConditionFromReportPhotos";
import {
  defaultCoverPayloadV1,
  parseCoverV1FromUnknown,
} from "@/lib/inspectionCoverPayload";
import { allowReportPayloadUnlock } from "@/lib/reportPayloadUnlock";
import { buildConditionSynthSummary } from "@/lib/reportVersionDiff";
import { insertReportVersion } from "@/lib/reportVersions";
import { createServiceRoleClient } from "@/lib/supabaseServer";
import { updateReportPayloadWithUnlock } from "@/lib/updateReportPayloadWithUnlock";
import { assertReportViewerAccess } from "@/lib/reportViewerAccess";

export const maxDuration = 120;

/**
 * POST JSON `{ report_id, access_token }` — synthèse « condition générale » depuis les photos du rapport,
 * persistance du `cover_v1` côté serveur + entrée `report_versions`.
 */
export async function POST(req: Request) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return Response.json({ ok: false, error: "JSON invalide." }, { status: 400 });
  }

  const o = body as Record<string, unknown>;
  const reportId = typeof o.report_id === "string" ? o.report_id.trim() : "";
  const accessTokenRaw =
    typeof o.access_token === "string" ? o.access_token : "";

  if (!reportId) {
    return Response.json({ ok: false, error: "report_id requis." }, { status: 400 });
  }

  try {
    const supabase = await createServiceRoleClient();
    const gate = await assertReportViewerAccess(supabase, reportId, accessTokenRaw);
    if (!gate.ok) {
      const fr =
        gate.status === 403
          ? { error: "Jeton d’accès invalide ou expiré.", code: gate.body.code }
          : gate.status === 404
            ? { error: "Rapport introuvable." }
            : { error: String(gate.body.error ?? "Erreur") };
      return Response.json({ ok: false, ...fr }, { status: gate.status });
    }

    const result = await synthesizeConditionGeneraleForReport({
      supabase,
      reportId,
    });

    if (!result.ok) {
      const noPhotos = result.snapshot_photo_ids.length === 0;
      console.warn("[cover-condition-synthesize]", {
        report_id: reportId,
        ok: false,
        reason: result.reason,
        snapshot_count: result.snapshot_photo_ids.length,
      });
      return Response.json(
        {
          ok: false,
          error: noPhotos
            ? "Aucune photo liée à ce rapport pour l’instant. Ajoute des photos depuis la page rapport, puis réessaie."
            : result.reason === "timeout"
              ? "Délai dépassé."
              : "Synthèse impossible avec le jeu de photos figé. Réessaie ou rédige manuellement.",
          snapshot_photo_ids: result.snapshot_photo_ids,
        },
        { status: 502 },
      );
    }

    const { data: reportRow, error: readErr } = await supabase
      .from("reports")
      .select("payload, access_token")
      .eq("id", reportId)
      .maybeSingle();

    if (readErr || !reportRow) {
      return Response.json(
        { ok: false, error: "Impossible de lire le rapport pour enregistrer." },
        { status: 500 },
      );
    }

    const rec = reportRow as Record<string, unknown>;
    const dbToken = typeof rec.access_token === "string" ? rec.access_token.trim() : "";
    const allowUnlock = allowReportPayloadUnlock(req);

    const currentPayload =
      rec.payload && typeof rec.payload === "object"
        ? ({ ...(rec.payload as Record<string, unknown>) } as Record<string, unknown>)
        : {};

    const cover =
      parseCoverV1FromUnknown(currentPayload.cover_v1) ?? defaultCoverPayloadV1();
    cover.condition_generale = result.data;
    cover.ia_hints = {
      ...cover.ia_hints,
      photos_condition_imported: true,
    };

    const nextPayload: Record<string, unknown> = {
      ...currentPayload,
      cover_v1: cover,
      cover_condition_ai_at: new Date().toISOString(),
    };

    const { error: upErr } = await updateReportPayloadWithUnlock(
      supabase,
      reportId,
      nextPayload,
      allowUnlock,
      { clearStoredPdf: true },
    );

    if (upErr) {
      console.error("[cover-condition-synthesize] payload update", upErr.message);
      return Response.json(
        {
          ok: true,
          condition_generale: result.data,
          synth_source: result.source,
          snapshot_photo_count: result.snapshot_photo_ids.length,
          avg_confidence: result.avg_confidence,
          persisted: false,
          persist_error: upErr.message,
        },
        { status: 200 },
      );
    }

    const diffSummary = buildConditionSynthSummary({
      source: result.source,
      snapshotCount: result.snapshot_photo_ids.length,
      avgConfidence: result.avg_confidence,
    });

    const ver = await insertReportVersion(supabase, {
      reportId,
      createdBy: "ai",
      source:
        result.source === "vision_images"
          ? "photos_vision"
          : "photos_analysis",
      payload: nextPayload,
      diffSummary,
      metadata: {
        photo_ids: result.snapshot_photo_ids,
        synth_source: result.source,
      },
      confidenceScore: result.avg_confidence,
      isMajor: false,
      editEventType: "AI_GENERATED",
      fieldPath: "cover_v1.condition_generale",
    });
    if ("error" in ver) {
      console.error("[cover-condition-synthesize] report_versions", ver.error);
    }

    console.log("[cover-condition-synthesize]", {
      report_id: reportId,
      ok: true,
      source: result.source,
      snapshot_count: result.snapshot_photo_ids.length,
      persisted: true,
    });

    return Response.json({
      ok: true,
      condition_generale: result.data,
      synth_source: result.source,
      snapshot_photo_count: result.snapshot_photo_ids.length,
      avg_confidence: result.avg_confidence,
      persisted: true,
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return Response.json({ ok: false, error: message }, { status: 500 });
  }
}
