import type { SupabaseClient } from "@supabase/supabase-js";

import {
  estimateQualitySignalsFromBuffer,
  isPerceptualHashSimilar,
  type PhotoQualitySignals,
} from "@/lib/photoPerceptualHash";

export type DuplicateResolveResult = {
  perceptual_hash: string;
  duplicate_group: string | null;
  duplicate_of_photo_id: string | null;
  quality_signals: PhotoQualitySignals;
  skipVision: boolean;
};

type ExistingRow = {
  id: string;
  perceptual_hash: string | null;
  duplicate_group: string | null;
  duplicate_of_photo_id: string | null;
};

function qualityScoreFromSignals(s: PhotoQualitySignals): number {
  const pixels = s.width * s.height;
  return Math.round(pixels * 0.0001 + s.sharpness * 0.01 + s.byteSize * 0.000001);
}

async function loadCandidates(
  supabase: SupabaseClient,
  inspectionId: string,
  perceptualHash: string,
): Promise<ExistingRow[]> {
  const { data, error } = await supabase
    .from("photos")
    .select("id, perceptual_hash, duplicate_group, duplicate_of_photo_id")
    .eq("inspection_id", inspectionId)
    .not("perceptual_hash", "is", null)
    .limit(500);

  if (error || !Array.isArray(data)) return [];
  return (data as ExistingRow[]).filter(
    (row) =>
      row.id &&
      typeof row.perceptual_hash === "string" &&
      isPerceptualHashSimilar(perceptualHash, row.perceptual_hash),
  );
}

function pickLeader(similar: ExistingRow[]): ExistingRow {
  for (const row of similar) {
    if (row.duplicate_of_photo_id == null) return row;
  }
  return similar[0]!;
}

/**
 * Regroupement visuel — toutes les photos restent archivées.
 */
export async function resolveVisualDuplicateOnUpload(
  supabase: SupabaseClient,
  opts: {
    inspectionId: string;
    photoId: string;
    perceptualHash: string;
    buffer: Buffer;
  },
): Promise<DuplicateResolveResult> {
  const quality_signals = estimateQualitySignalsFromBuffer(opts.buffer);
  const quality_score = qualityScoreFromSignals(quality_signals);

  const similar = await loadCandidates(supabase, opts.inspectionId, opts.perceptualHash).then(
    (rows) => rows.filter((r) => r.id !== opts.photoId),
  );

  if (similar.length === 0) {
    await supabase
      .from("photos")
      .update({
        perceptual_hash: opts.perceptualHash,
        duplicate_group: opts.photoId,
        duplicate_of_photo_id: null,
        quality_score,
      })
      .eq("id", opts.photoId);

    return {
      perceptual_hash: opts.perceptualHash,
      duplicate_group: opts.photoId,
      duplicate_of_photo_id: null,
      quality_signals,
      skipVision: false,
    };
  }

  const leader = pickLeader(similar);
  const groupId = leader.duplicate_group ?? leader.id;

  await supabase
    .from("photos")
    .update({
      perceptual_hash: opts.perceptualHash,
      duplicate_group: groupId,
      duplicate_of_photo_id: leader.id,
      quality_score,
      analysis_status: "skipped",
      analysis_error: null,
    })
    .eq("id", opts.photoId);

  return {
    perceptual_hash: opts.perceptualHash,
    duplicate_group: groupId,
    duplicate_of_photo_id: leader.id,
    quality_signals,
    skipVision: true,
  };
}

export { qualityScoreFromSignals };
