/**
 * Heuristiques client (V2) — pas d’appel réseau. Servent au tri / sélection locale.
 * Remplacez par analyse vision serveur pour la production « premium ».
 */

export type PhotoScoreBreakdown = {
  relevance: number;
  quality: number;
  uniqueness: number;
  /** 0–1 */
  final: number;
};

function clamp01(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return Math.min(1, Math.max(0, n));
}

/**
 * Score qualité grossier : résolution, poids fichier, luminosité (canvas).
 */
export async function scorePhotoHeuristic(
  file: File,
  opts?: { uniquenessHint?: number },
): Promise<PhotoScoreBreakdown> {
  const uniqueness = clamp01(opts?.uniquenessHint ?? 0.75);

  let quality = 0.55;
  let relevance = 0.6;

  const size = file.size;
  if (size >= 80_000 && size <= 9 * 1024 * 1024) quality += 0.15;
  if (size < 25_000) quality -= 0.2;

  try {
    const bmp = await createImageBitmap(file);
    const w = bmp.width;
    const h = bmp.height;

    const mp = (w * h) / 1_000_000;
    if (mp >= 1.5) quality += 0.12;
    else if (mp >= 0.5) quality += 0.06;
    if (w < 640 || h < 480) quality -= 0.15;

    const aspect = w / Math.max(1, h);
    if (aspect > 0.5 && aspect < 2.2) relevance += 0.1;

    const canvas = document.createElement("canvas");
    const cw = Math.min(96, w);
    const ch = Math.min(96, h);
    canvas.width = cw;
    canvas.height = ch;
    const ctx = canvas.getContext("2d");
    if (ctx) {
      ctx.drawImage(bmp, 0, 0, cw, ch);
      bmp.close?.();
      const data = ctx.getImageData(0, 0, cw, ch).data;
      let sum = 0;
      let sumSq = 0;
      const step = 16;
      let n = 0;
      for (let i = 0; i < data.length; i += 4 * step) {
        const y = 0.299 * data[i]! + 0.587 * data[i + 1]! + 0.114 * data[i + 2]!;
        sum += y;
        sumSq += y * y;
        n++;
      }
      if (n > 0) {
        const mean = sum / n;
        const variance = sumSq / n - mean * mean;
        const std = Math.sqrt(Math.max(0, variance));
        if (mean > 35 && mean < 220) quality += 0.06;
        if (std > 18) relevance += 0.08;
        if (std < 4) quality -= 0.1;
      }
    } else {
      bmp.close?.();
    }
  } catch {
    /* fallback scores */
  }

  quality = clamp01(quality);
  relevance = clamp01(relevance);
  const final = clamp01(0.4 * relevance + 0.3 * quality + 0.3 * uniqueness);

  return { relevance, quality, uniqueness, final };
}

/** Sélectionne les meilleures `maxPick` indices (scores déjà calculés). */
export function pickTopPhotoIndices(scores: number[], maxPick: number): Set<number> {
  const indexed = scores.map((s, i) => ({ i, s }));
  indexed.sort((a, b) => b.s - a.s);
  const out = new Set<number>();
  for (let k = 0; k < Math.min(maxPick, indexed.length); k++) {
    out.add(indexed[k]!.i);
  }
  return out;
}
