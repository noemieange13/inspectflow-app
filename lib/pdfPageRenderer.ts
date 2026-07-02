/**
 * Pilot #0.7 — backward-compatible wrapper around pdfPageRasterizer.
 */
import {
  createLocalPdfPageRasterizer,
  renderPdfPagesToImages as rasterizePdfPages,
  setPdfPageRasterizerForTests,
  type PdfPageRasterOptions,
  type RasterizedPdfPage,
} from "@/lib/pdfPageRasterizer";

export type PdfPageRenderOptions = PdfPageRasterOptions;

export type PdfPageRenderResult = {
  pageNumber: number;
  width: number;
  height: number;
  imageBuffer: Buffer;
};

export interface PdfPageRenderer {
  renderPdfPages(buffer: Buffer, options?: PdfPageRenderOptions): Promise<PdfPageRenderResult[]>;
}

let activeRenderer: PdfPageRenderer | null = null;

function defaultRenderer(): PdfPageRenderer {
  if (!activeRenderer) {
    activeRenderer = createLocalPdfPageRenderer();
  }
  return activeRenderer;
}

export function setPdfPageRendererForTests(renderer: PdfPageRenderer | null): void {
  activeRenderer = renderer;
  if (renderer) {
    setPdfPageRasterizerForTests({
      async renderPdfPagesToImages(buffer, options) {
        const pages = await renderer.renderPdfPages(buffer, options);
        return pages.map((page) => ({
          page: page.pageNumber,
          imageBuffer: page.imageBuffer,
          width: page.width,
          height: page.height,
        }));
      },
    });
  } else {
    setPdfPageRasterizerForTests(null);
  }
}

export async function renderPdfPagesToImages(
  buffer: Buffer,
  options?: PdfPageRenderOptions,
): Promise<Buffer[]> {
  const pages = await defaultRenderer().renderPdfPages(buffer, options);
  return pages.map((page) => page.imageBuffer);
}

export function createLocalPdfPageRenderer(): PdfPageRenderer {
  const rasterizer = createLocalPdfPageRasterizer();
  return {
    async renderPdfPages(pdfBuffer, options = {}) {
      const pages = await rasterizer.renderPdfPagesToImages(pdfBuffer, options);
      return pages.map(toRenderResult);
    },
  };
}

function toRenderResult(page: RasterizedPdfPage): PdfPageRenderResult {
  return {
    pageNumber: page.page,
    width: page.width,
    height: page.height,
    imageBuffer: page.imageBuffer,
  };
}
