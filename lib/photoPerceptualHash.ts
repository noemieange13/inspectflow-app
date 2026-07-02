/**
 * dHash 64-bit (hex 16 chars) — regroupement visuel léger sans dépendance native.
 * Décode JPEG/PNG via APIs navigateur ou échantillonnage buffer côté serveur.
 */
export const PERCEPTUAL_HASH_BITS = 64;
export const PERCEPTUAL_HASH_HEX_LEN = 16;
/** Distance de Hamming max pour considérer deux photos visuellement similaires. */
export const PERCEPTUAL_HASH_MAX_DISTANCE = 8;

export type PhotoQualitySignals = {
  width: number;
  height: number;
  byteSize: number;
  brightness: number;
  sharpness: number;
};

export function hammingDistanceHex(a: string, b: string): number {
  if (a.length !== b.length) return PERCEPTUAL_HASH_BITS + 1;
  let dist = 0;
  for (let i = 0; i < a.length; i += 1) {
    const na = Number.parseInt(a[i]!, 16);
    const nb = Number.parseInt(b[i]!, 16);
    if (Number.isNaN(na) || Number.isNaN(nb)) return PERCEPTUAL_HASH_BITS + 1;
    let x = na ^ nb;
    while (x > 0) {
      dist += x & 1;
      x >>= 1;
    }
  }
  return dist;
}

function readJpegDimensions(buffer: Buffer): { width: number; height: number } | null {
  let i = 2;
  while (i + 8 < buffer.length) {
    if (buffer[i] !== 0xff) {
      i += 1;
      continue;
    }
    const marker = buffer[i + 1];
    if (marker === 0xc0 || marker === 0xc2) {
      const height = buffer.readUInt16BE(i + 5);
      const width = buffer.readUInt16BE(i + 7);
      if (width > 0 && height > 0) return { width, height };
      return null;
    }
    const segLen = buffer.readUInt16BE(i + 2);
    i += 2 + segLen;
  }
  return null;
}

function readPngDimensions(buffer: Buffer): { width: number; height: number } | null {
  if (buffer.length < 24) return null;
  if (buffer.toString("ascii", 0, 4) !== "\x89PNG") return null;
  return {
    width: buffer.readUInt32BE(16),
    height: buffer.readUInt32BE(20),
  };
}

/** Estimation netteté / luminosité depuis l’entropie des octets (proxy serveur). */
export function estimateQualitySignalsFromBuffer(buffer: Buffer): PhotoQualitySignals {
  const dims = readJpegDimensions(buffer) ?? readPngDimensions(buffer);
  const width = dims?.width ?? 0;
  const height = dims?.height ?? 0;
  const sampleLen = Math.min(buffer.length, 8192);
  let sum = 0;
  let variance = 0;
  for (let i = 0; i < sampleLen; i++) {
    sum += buffer[i]!;
  }
  const mean = sampleLen > 0 ? sum / sampleLen : 0;
  for (let i = 0; i < sampleLen; i++) {
    const d = buffer[i]! - mean;
    variance += d * d;
  }
  const sharpness = sampleLen > 0 ? variance / sampleLen : 0;
  return {
    width,
    height,
    byteSize: buffer.length,
    brightness: mean,
    sharpness,
  };
}

function dHashFromGrayPixels(gray: Uint8ClampedArray, grid: number): string {
  const size = grid + 1;
  if (gray.length < size * size) return "";
  const hexChars: string[] = [];
  let nibble = 0;
  let nibbleBits = 0;
  for (let y = 0; y < grid; y += 1) {
    for (let x = 0; x < grid; x += 1) {
      const left = gray[y * size + x]!;
      const right = gray[y * size + x + 1]!;
      nibble = (nibble << 1) | (left > right ? 1 : 0);
      nibbleBits += 1;
      if (nibbleBits === 4) {
        hexChars.push(nibble.toString(16));
        nibble = 0;
        nibbleBits = 0;
      }
    }
  }
  return hexChars.join("").padStart(PERCEPTUAL_HASH_HEX_LEN, "0");
}

/** dHash côté navigateur (canvas). */
export async function computePerceptualHashFromBlob(blob: Blob): Promise<string | null> {
  if (typeof document === "undefined") return null;
  try {
    const bitmap =
      typeof createImageBitmap === "function"
        ? await createImageBitmap(blob)
        : await loadImageBitmapViaElement(blob);
    const grid = 8;
    const size = grid + 1;
    const canvas = document.createElement("canvas");
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    if (!ctx) return null;
    ctx.drawImage(bitmap, 0, 0, size, size);
    if ("close" in bitmap && typeof bitmap.close === "function") {
      bitmap.close();
    }
    const { data } = ctx.getImageData(0, 0, size, size);
    const gray = new Uint8ClampedArray(size * size);
    for (let i = 0; i < size * size; i++) {
      const o = i * 4;
      gray[i] = Math.round(
        0.299 * data[o]! + 0.587 * data[o + 1]! + 0.114 * data[o + 2]!,
      );
    }
    return dHashFromGrayPixels(gray, grid);
  } catch {
    return null;
  }
}

function loadImageBitmapViaElement(blob: Blob): Promise<ImageBitmap | HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(blob);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("image_load_failed"));
    };
    img.src = url;
  });
}

/** dHash côté serveur — échantillonnage déterministe si pas de canvas. */
export function computePerceptualHashFromBuffer(buffer: Buffer): string {
  const grid = 8;
  const size = grid + 1;
  const gray = new Uint8ClampedArray(size * size);
  const step = Math.max(1, Math.floor(buffer.length / gray.length));
  for (let i = 0; i < gray.length; i++) {
    gray[i] = buffer[i * step] ?? 0;
  }
  return dHashFromGrayPixels(gray, grid);
}

export function comparePhotoQualitySignals(a: PhotoQualitySignals, b: PhotoQualitySignals): number {
  const pixelsA = a.width * a.height;
  const pixelsB = b.width * b.height;
  const scoreA = pixelsA * 0.5 + a.sharpness * 0.35 + a.brightness * 0.05 + a.byteSize * 0.00001;
  const scoreB = pixelsB * 0.5 + b.sharpness * 0.35 + b.brightness * 0.05 + b.byteSize * 0.00001;
  return scoreA - scoreB;
}

export function isPerceptualHashSimilar(a: string, b: string): boolean {
  if (!a || !b) return false;
  return hammingDistanceHex(a, b) <= PERCEPTUAL_HASH_MAX_DISTANCE;
}
