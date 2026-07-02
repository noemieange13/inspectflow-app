/**
 * Pilot #0.10 — rasterize PDF pages to high-resolution images for scanned-page OCR.
 */
import { createCanvas } from "@napi-rs/canvas";

export type PdfPageRasterOptions = {
  dpi?: number;
  maxPages?: number;
};

export type RasterizedPdfPage = {
  page: number;
  imageBuffer: Buffer;
  width: number;
  height: number;
};

export interface PdfPageRasterizer {
  renderPdfPagesToImages(
    file: Buffer,
    options?: PdfPageRasterOptions,
  ): Promise<RasterizedPdfPage[]>;
}

const DEFAULT_DPI = 300;
const DEFAULT_MAX_PAGES = 6;

let activeRasterizer: PdfPageRasterizer | null = null;

function defaultRasterizer(): PdfPageRasterizer {
  if (!activeRasterizer) {
    activeRasterizer = createLocalPdfPageRasterizer();
  }
  return activeRasterizer;
}

export function setPdfPageRasterizerForTests(rasterizer: PdfPageRasterizer | null): void {
  activeRasterizer = rasterizer;
}

export async function renderPdfPagesToImages(
  file: Buffer,
  options?: PdfPageRasterOptions,
): Promise<RasterizedPdfPage[]> {
  return defaultRasterizer().renderPdfPagesToImages(file, options);
}

export function createLocalPdfPageRasterizer(): PdfPageRasterizer {
  return {
    async renderPdfPagesToImages(pdfBuffer, options = {}): Promise<RasterizedPdfPage[]> {
      const dpi = options.dpi ?? DEFAULT_DPI;
      const maxPages = options.maxPages ?? DEFAULT_MAX_PAGES;
      const scale = dpi / 72;

      try {
        const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
        if (pdfjs.GlobalWorkerOptions) {
          pdfjs.GlobalWorkerOptions.workerSrc = "";
        }

        const loadingTask = pdfjs.getDocument({
          data: new Uint8Array(pdfBuffer),
          useSystemFonts: true,
          disableFontFace: true,
          isEvalSupported: false,
        });
        const pdf = await loadingTask.promise;
        const pageCount = Math.min(pdf.numPages, maxPages);
        const rendered: RasterizedPdfPage[] = [];

        for (let pageNumber = 1; pageNumber <= pageCount; pageNumber += 1) {
          const page = await pdf.getPage(pageNumber);
          const viewport = page.getViewport({ scale });
          const canvas = createCanvas(Math.ceil(viewport.width), Math.ceil(viewport.height));
          const context = canvas.getContext("2d");
          context.fillStyle = "#ffffff";
          context.fillRect(0, 0, canvas.width, canvas.height);

          await page.render({
            canvasContext: context as unknown as CanvasRenderingContext2D,
            viewport,
            intent: "print",
          }).promise;

          rendered.push({
            page: pageNumber,
            width: canvas.width,
            height: canvas.height,
            imageBuffer: canvas.toBuffer("image/png"),
          });
        }

        return rendered;
      } catch (error) {
        if (process.env.NODE_ENV === "development") {
          console.debug("[PDF PAGE RASTERIZER] render failed", error);
        }
        return [];
      }
    },
  };
}
