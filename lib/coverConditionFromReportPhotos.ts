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

function synthesizeConditionLocally(snippets: string[], photoCount: number): string | null {
  const corpus = snippets.join(" ").toLowerCase();
  if (corpus.trim().length < 20) return null;
  const findings: string[] = [];
  if (/fuite|leak|infiltr|humid|moisiss|mold/.test(corpus)) {
    findings.push("des indices d’humidité ou d’infiltration sont visibles dans certaines zones");
  }
  if (/fissur|crack|structur|deform|movement/.test(corpus)) {
    findings.push("des signes de fissuration ou de mouvement structurel méritent une vérification ciblée");
  }
  if (/electri|panel|breaker|disjon|cabl|wire/.test(corpus)) {
    findings.push("des éléments électriques visibles demandent une validation de conformité et de sécurité");
  }
  if (/roof|toit|goutti|shingle|bardea/.test(corpus)) {
    findings.push("la toiture et les composantes extérieures semblent présenter des points d’usure localisés");
  }
  if (findings.length === 0) {
    findings.push("les observations photo montrent un état général variable selon les zones, sans anomalie majeure explicitement qualifiée");
  }
  return `Synthèse préliminaire basée sur ${photoCount} photo(s) du rapport : ${findings.join("; ")}. Une validation sur place demeure recommandée pour confirmer l’étendue, la cause et la priorité des correctifs.`;
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
  const hasApiKey = Boolean(process.env.OPENAI_API_KEY?.trim());

  if (hasApiKey && preferSnippet && corpus.length >= 40) {
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
  if (hasApiKey) {
    for (const row of rows) {
      if (!row.storage_path || images.length >= MAX_VISION_IMAGES) continue;
      const img = await downloadImageB64(input.supabase, row.storage_path);
      if (img) {
        images.push(img);
      }
    }
  }

  if (images.length === 0) {
    if (hasApiKey && snippets.length > 0 && corpus.length >= 40) {
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
    const local = synthesizeConditionLocally(snippets, snapshotIds.length);
    if (local) {
      return {
        ok: true,
        data: local,
        source: "local_fallback",
        snapshot_photo_ids: snapshotIds,
        avg_confidence: avgConf,
      };
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

  if (hasApiKey && snippets.length > 0 && corpus.length >= 40) {
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

  const local = synthesizeConditionLocally(snippets, snapshotIds.length);
  if (local) {
    return {
      ok: true,
      data: local,
      source: "local_fallback",
      snapshot_photo_ids: snapshotIds,
      avg_confidence: avgConf,
    };
  }

  return { ok: false, reason: vr.reason, snapshot_photo_ids: snapshotIds };
}
