/**
 * Pilot #0.28 — enhance rasterized page images for handwriting OCR.
 */
import { createCanvas, loadImage } from "@napi-rs/canvas";

let enhanceHandwritingImageOverride:
  | ((imageBuffer: Buffer) => Promise<Buffer>)
  | null = null;

export function setEnhanceHandwritingImageForTests(
  fn: ((imageBuffer: Buffer) => Promise<Buffer>) | null,
): void {
  enhanceHandwritingImageOverride = fn;
}

export async function enhanceHandwritingImage(imageBuffer: Buffer): Promise<Buffer> {
  if (enhanceHandwritingImageOverride) {
    return enhanceHandwritingImageOverride(imageBuffer);
  }

  try {
    const image = await loadImage(imageBuffer);
    const canvas = createCanvas(image.width, image.height);
    const context = canvas.getContext("2d");
    context.drawImage(image, 0, 0, image.width, image.height);

    const imageData = context.getImageData(0, 0, canvas.width, canvas.height);
    const { data } = imageData;
    const contrast = 1.35;
    const intercept = 128 * (1 - contrast);

    for (let index = 0; index < data.length; index += 4) {
      const red = data[index] ?? 0;
      const green = data[index + 1] ?? 0;
      const blue = data[index + 2] ?? 0;
      const gray = 0.299 * red + 0.587 * green + 0.114 * blue;
      const boosted = Math.max(0, Math.min(255, gray * contrast + intercept));
      data[index] = boosted;
      data[index + 1] = boosted;
      data[index + 2] = boosted;
    }

    context.putImageData(imageData, 0, 0);
    return canvas.toBuffer("image/png");
  } catch {
    return imageBuffer;
  }
}
