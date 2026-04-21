import type { SupabaseClient } from "@supabase/supabase-js";

import type { ConditionSynthResult } from "@/lib/conditionSynthResult";
import { averageConfidenceFromRows } from "@/lib/photoAnalysisConfidence";
import { snippetsFromPhotoAnalysis } from "@/lib/photoAnalysisSnippets";
import { loadPhotoRowsForReport, loadPhotoRowsSnapshotByIds } from "@/lib/reportPhotosForReport";
import {
  synthesizeConditionGeneraleFromImages,
  synthesizeConditionGeneraleFromSnippets,
} from "@/lib/synthesizeConditionGeneraleAi";

const USER_UPLOADS = "user-uploads";
const MAX_PHOTO_ROWS = 20;
const MAX_VISION_IMAGES = 8;

/** Longueur minimale (caractères) pour tenter le chemin texte avec score suffisant. */
export const MIN_ANALYSIS_TEXT_LENGTH = 200;
/** Longueur élevée : on accepte le chemin texte même si la confiance moyenne est basse. */
export const STRONG_CORPUS_LENGTH = 360;
export const MIN_AVG_CONFIDENCE = 0.65;

function shouldPreferSnippetPath(corpusLength: number, avgConfidence: number): boolean {
  if (corpusLength >= STRONG_CORPUS_LENGTH) return true;
  return corpusLength >= MIN_ANALYSIS_TEXT_LENGTH && avgConfidence >= MIN_AVG_CONFIDENCE;
}

async function downloadImageB64(
  supabase: SupabaseClient,
  storagePath: string,
): Promise<{ base64: string; mimeType: string } | null> {
  const { data, error } = await supabase.storage
    .from(USER_UPLOADS)
    .download(storagePath);
  if (error || !data) {
    return null;
  }
  const buf = Buffer.from(await data.arrayBuffer());
  if (buf.length > 9 * 1024 * 1024) {
    return null;
  }
  const mime = data.type?.trim() || "image/jpeg";
  return { base64: buf.toString("base64"), mimeType: mime };
}

/**
 * Synthétise le paragraphe « condition générale » à partir des photos liées au rapport.
 * Snapshot des `photo_id` au début, puis rechargement figé de ces lignes uniquement.
 */
export async function synthesizeConditionGeneraleForReport(input: {
  supabase: SupabaseClient;
  reportId: string;
  signal?: AbortSignal;
}): Promise<ConditionSynthResult> {
  const emptyIds: ConditionSynthResult = {
    ok: false,
    reason: "error",
    snapshot_photo_ids: [],
  };

  const { rows: initialRows } = await loadPhotoRowsForReport(
    input.supabase,
    input.reportId,
    MAX_PHOTO_ROWS,
  );

  if (initialRows.length === 0) {
    return emptyIds;
  }

  const snapshotIds = initialRows.map((r) => r.id);
  const rows = await loadPhotoRowsSnapshotByIds(input.supabase, snapshotIds);

  if (rows.length === 0) {
    return { ok: false, reason: "error", snapshot_photo_ids: snapshotIds };
  }

  const snippets: string[] = [];
  for (const row of rows) {
    snippets.push(...snippetsFromPhotoAnalysis(row.analysis));
  }

  const corpus = snippets.join("\n");
  const avgConf = averageConfidenceFromRows(rows);
  const preferSnippet = shouldPreferSnippetPath(corpus.length, avgConf);

  if (preferSnippet && corpus.length >= 40) {
    const r = await synthesizeConditionGeneraleFromSnippets({
      snippets,
      signal: input.signal,
    });
    if (r.ok) {
      return {
        ok: true,
        data: r.data,
        source: "analysis_text",
        snapshot_photo_ids: snapshotIds,
        avg_confidence: avgConf,
      };
    }
  }

  const images: Array<{ base64: string; mimeType: string }> = [];
  for (const row of rows) {
    if (!row.storage_path || images.length >= MAX_VISION_IMAGES) continue;
    const img = await downloadImageB64(input.supabase, row.storage_path);
    if (img) {
      images.push(img);
    }
  }

  if (images.length === 0) {
    if (snippets.length > 0 && corpus.length >= 40) {
      const r = await synthesizeConditionGeneraleFromSnippets({
        snippets,
        signal: input.signal,
      });
      if (r.ok) {
        return {
          ok: true,
          data: r.data,
          source: "analysis_text_fallback",
          snapshot_photo_ids: snapshotIds,
          avg_confidence: avgConf,
        };
      }
    }
    return { ok: false, reason: "error", snapshot_photo_ids: snapshotIds };
  }

  const vr = await synthesizeConditionGeneraleFromImages({
    images,
    signal: input.signal,
  });
  if (vr.ok) {
    return {
      ok: true,
      data: vr.data,
      source: "vision_images",
      snapshot_photo_ids: snapshotIds,
      avg_confidence: avgConf,
    };
  }

  if (snippets.length > 0 && corpus.length >= 40) {
    const r = await synthesizeConditionGeneraleFromSnippets({
      snippets,
      signal: input.signal,
    });
    if (r.ok) {
      return {
        ok: true,
        data: r.data,
        source: "analysis_text_fallback",
        snapshot_photo_ids: snapshotIds,
        avg_confidence: avgConf,
      };
    }
  }

  return { ok: false, reason: vr.reason, snapshot_photo_ids: snapshotIds };
}
