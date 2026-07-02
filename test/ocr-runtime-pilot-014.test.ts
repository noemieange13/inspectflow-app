/**
 * Pilot #0.14 — Tesseract server OCR runtime safety
 * `npm run test:ocr-runtime-pilot-014`
 */
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, it } from "node:test";

import { OCR_MANUAL_FALLBACK_UI_MESSAGE } from "@/lib/documentIntakeErrors";
import {
  setRecognizeImageBufferForTests,
  setDocumentOcrProviderForTests,
} from "@/lib/documentOCR";
import {
  OCR_TIMEOUT_MS,
  resolveTesseractNodePaths,
  runServerTesseractOcr,
  setServerTesseractOcrRunnerForTests,
} from "@/lib/tesseractServerOcr";
import { extractDocumentTextWithFallback } from "@/lib/documentTextExtraction";
import { setPdfPageRasterizerForTests } from "@/lib/pdfPageRasterizer";

const ROOT = join(process.cwd());

function read(rel: string): string {
  return readFileSync(join(ROOT, rel), "utf8");
}

describe("Pilot #0.14 OCR runtime", () => {
  afterEach(() => {
    setServerTesseractOcrRunnerForTests(null);
    setRecognizeImageBufferForTests(null);
    setDocumentOcrProviderForTests(null);
    setPdfPageRasterizerForTests(null);
  });

  it("resolves Tesseract worker and core paths on disk", () => {
    const paths = resolveTesseractNodePaths();
    assert.match(paths.workerPath, /worker-script\/node\/index\.js$/);
    assert.ok(existsSync(paths.workerPath));
    assert.ok(existsSync(paths.corePath));
    assert.ok(existsSync(join(paths.corePath, "tesseract-core.wasm.js")));
    assert.doesNotMatch(paths.workerPath, /src\/worker-script$/);
  });

  it("returns ocr_timeout instead of hanging", async () => {
    setServerTesseractOcrRunnerForTests(async () => {
      await new Promise((resolve) => setTimeout(resolve, OCR_TIMEOUT_MS + 50));
      return {
        chunk: { text: "late", confidence: 1, layout_blocks: [] },
        engine: { success: true },
      };
    });

    const result = await runServerTesseractOcr(Buffer.from("png"));
    assert.equal(result.engine.success, false);
    assert.equal(result.engine.reason, "ocr_timeout");
    assert.equal(result.engine.fallback, "manual_confirmation");
  });

  it("maps missing worker load errors to manual fallback", async () => {
    setServerTesseractOcrRunnerForTests(async () => ({
      chunk: { text: "", confidence: 0, layout_blocks: [] },
      engine: {
        success: false,
        reason: "worker_load_failed",
        fallback: "manual_confirmation",
        error: "Cannot find module 'tesseract.js/src/worker-script'",
      },
    }));

    setPdfPageRasterizerForTests({
      async renderPdfPagesToImages() {
        return [
          {
            page: 1,
            width: 100,
            height: 100,
            imageBuffer: Buffer.from("page"),
          },
        ];
      },
    });

    const extraction = await extractDocumentTextWithFallback(
      Buffer.from("%PDF-1.4\n%%EOF\n", "latin1"),
      "scan.pdf",
      "application/pdf",
    );

    assert.equal(extraction.ocr?.ocr_engine?.success, false);
    assert.equal(extraction.ocr?.ocr_engine?.reason, "worker_load_failed");
    assert.equal(extraction.ocr?.ocr_engine?.fallback, "manual_confirmation");
  });

  it("exposes manual fallback copy and clears loading state in upload UI", () => {
    const upload = read("components/MultiDocumentIntakeUpload.tsx");
    assert.match(upload, /OCR_MANUAL_FALLBACK_UI_MESSAGE/);
    assert.match(upload, /finally\s*\{[\s\S]*setBusy\(false\)/);
    assert.match(upload, /ocr_manual_fallback/);
    assert.match(
      OCR_MANUAL_FALLBACK_UI_MESSAGE,
      /n'a pas pu être lu automatiquement/i,
    );
  });

  it("parse route returns JSON needs_review on OCR engine failure", () => {
    const route = read("app/api/inspection-document-intake/parse/route.ts");
    assert.match(route, /ocr_manual_fallback/);
    assert.match(route, /OCR_MANUAL_FALLBACK_UI_MESSAGE/);
    assert.match(route, /success:\s*true/);
    assert.match(route, /needs_review:\s*true/);
  });
});
