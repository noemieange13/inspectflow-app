/**
 * Pilot #0.14 — server-side Tesseract.js paths and OCR runtime safety.
 */
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  traceOcrEngineFailed,
  traceOcrEngineReady,
  traceOcrEngineStart,
} from "@/lib/documentOcrEngineTrace";
import type { LayoutTextBlock } from "@/lib/document_parsers/steveFieldSheetParser";

export const OCR_TIMEOUT_MS = 30_000;

export type DocumentOcrEngineResult = {
  success: boolean;
  reason?: "ocr_timeout" | "worker_load_failed" | "recognition_failed";
  fallback?: "manual_confirmation";
  error?: string;
};

export type TesseractNodePaths = {
  workerPath: string;
  corePath: string;
};

export type ServerTesseractOcrChunk = {
  text: string;
  confidence: number;
  layout_blocks: LayoutTextBlock[];
};

export type ServerTesseractOcrResult = {
  chunk: ServerTesseractOcrChunk;
  engine: DocumentOcrEngineResult;
};

const moduleRequire = createRequire(fileURLToPath(import.meta.url));

let serverOcrRunnerOverride:
  | ((imageBuffer: Buffer, paths: TesseractNodePaths) => Promise<ServerTesseractOcrResult>)
  | null = null;

export function setServerTesseractOcrRunnerForTests(
  runner:
    | ((imageBuffer: Buffer, paths: TesseractNodePaths) => Promise<ServerTesseractOcrResult>)
    | null,
): void {
  serverOcrRunnerOverride = runner;
}

export function resolveTesseractNodePaths(): TesseractNodePaths {
  const tesseractRoot = path.dirname(moduleRequire.resolve("tesseract.js/package.json"));
  const coreRoot = path.dirname(moduleRequire.resolve("tesseract.js-core/package.json"));

  return {
    workerPath: path.join(tesseractRoot, "src/worker-script/node/index.js"),
    corePath: coreRoot,
  };
}

function wordsToLayoutBlocks(
  words: Array<{
    text?: string;
    confidence?: number;
    bbox: { x0: number; y0: number; x1: number; y1: number };
  }>,
): LayoutTextBlock[] {
  return words
    .filter((word) => (word.text ?? "").trim())
    .map((word) => ({
      text: word.text ?? "",
      x: word.bbox.x0,
      y: word.bbox.y0,
      width: Math.max(1, word.bbox.x1 - word.bbox.x0),
      height: Math.max(1, word.bbox.y1 - word.bbox.y0),
      confidence: Math.min(1, Math.max(0, (word.confidence ?? 0) / 100)),
    }));
}

function linesToLayoutBlocks(
  lines: Array<{
    text?: string;
    confidence?: number;
    bbox: { x0: number; y0: number; x1: number; y1: number };
  }>,
): LayoutTextBlock[] {
  return lines
    .filter((line) => (line.text ?? "").trim())
    .map((line) => ({
      text: line.text ?? "",
      x: line.bbox.x0,
      y: line.bbox.y0,
      width: Math.max(1, line.bbox.x1 - line.bbox.x0),
      height: Math.max(1, line.bbox.y1 - line.bbox.y0),
      confidence: Math.min(1, Math.max(0, (line.confidence ?? 0) / 100)),
    }));
}

function emptyChunk(): ServerTesseractOcrChunk {
  return { text: "", confidence: 0, layout_blocks: [] };
}

function failedEngine(
  reason: DocumentOcrEngineResult["reason"],
  error: string,
): ServerTesseractOcrResult {
  traceOcrEngineFailed(error, "manual_confirmation");
  return {
    chunk: emptyChunk(),
    engine: {
      success: false,
      reason,
      fallback: "manual_confirmation",
      error,
    },
  };
}

async function withOcrTimeout<T>(promise: Promise<T>, timeoutMs = OCR_TIMEOUT_MS): Promise<T> {
  let timeoutId: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<T>((_, reject) => {
        timeoutId = setTimeout(() => reject(new Error("ocr_timeout")), timeoutMs);
      }),
    ]);
  } finally {
    if (timeoutId) clearTimeout(timeoutId);
  }
}

async function runDefaultServerTesseractOcr(
  imageBuffer: Buffer,
  paths: TesseractNodePaths,
): Promise<ServerTesseractOcrResult> {
  traceOcrEngineStart();

  let worker: {
    recognize: (image: Buffer) => Promise<{ data: unknown }>;
    terminate: () => Promise<unknown>;
  } | null = null;

  try {
    const tesseract = await import("tesseract.js");
    worker = await withOcrTimeout(
      tesseract.createWorker("fra+eng", 1, {
        workerPath: paths.workerPath,
        corePath: paths.corePath,
        workerBlobURL: false,
      }),
    );

    const { data } = await withOcrTimeout(worker.recognize(imageBuffer));
    await worker.terminate();
    worker = null;

    const payload = data as {
      text?: string;
      confidence?: number;
      words?: Array<{
        text?: string;
        confidence?: number;
        bbox: { x0: number; y0: number; x1: number; y1: number };
      }>;
      lines?: Array<{
        text?: string;
        confidence?: number;
        bbox: { x0: number; y0: number; x1: number; y1: number };
      }>;
    };

    const wordBlocks = wordsToLayoutBlocks(payload.words ?? []);
    const layout_blocks =
      wordBlocks.length > 0 ? wordBlocks : linesToLayoutBlocks(payload.lines ?? []);

    traceOcrEngineReady();

    return {
      chunk: {
        text: payload.text ?? "",
        confidence: Math.min(1, Math.max(0, (payload.confidence ?? 0) / 100)),
        layout_blocks,
      },
      engine: { success: true },
    };
  } catch (error) {
    if (worker) {
      try {
        await worker.terminate();
      } catch {
        /* ignore terminate errors */
      }
    }

    const message = error instanceof Error ? error.message : String(error);
    if (message === "ocr_timeout") {
      return failedEngine("ocr_timeout", message);
    }
    if (/worker-script|Cannot find module|ENOENT/i.test(message)) {
      return failedEngine("worker_load_failed", message);
    }
    return failedEngine("recognition_failed", message);
  }
}

export async function runServerTesseractOcr(imageBuffer: Buffer): Promise<ServerTesseractOcrResult> {
  const paths = resolveTesseractNodePaths();
  const runner = serverOcrRunnerOverride
    ? (buffer: Buffer) => serverOcrRunnerOverride!(buffer, paths)
    : (buffer: Buffer) => runDefaultServerTesseractOcr(buffer, paths);

  try {
    return await withOcrTimeout(runner(imageBuffer));
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (message === "ocr_timeout") {
      return failedEngine("ocr_timeout", message);
    }
    throw error;
  }
}
