/**
 * Pilot #0.4 / #0.13 — assess embedded PDF text before OCR fallback.
 */
import { parseInspectionReportText } from "@/lib/document_parsers/inspectionReportParser";

export type ExtractedTextQualityLevel = "good" | "weak" | "image_only";

export type ExtractedTextQuality = {
  quality: ExtractedTextQualityLevel;
  reasons: string[];
};

export const CORRUPTED_PDF_TEXT_STREAM_REASON = "corrupted_pdf_text_stream";

const MIN_GOOD_LENGTH = 500;
const MIN_EXTRACTABLE_LENGTH = 20;

const REQUERANT_LABEL = /\b(requ[eé]rant|requerant|client|acheteur)\b/i;
const ADRESSE_LABEL = /\b(adresse|propri[eé]t[eé]\s+inspect)/i;

const PDF_ARTIFACT_PATTERNS = [
  /\bstream\b/i,
  /\bxref\b/i,
  /\bendobj\b/i,
  /\bFlateDecode\b/i,
  /\bobj\b/i,
];

function blankLineRatio(text: string): number {
  const lines = text.replace(/\r\n/g, "\n").split("\n");
  if (lines.length === 0) return 0;
  const blank = lines.filter((line) => !line.trim()).length;
  return blank / lines.length;
}

function isPrintableChar(code: number): boolean {
  return (
    code === 9 ||
    code === 10 ||
    code === 13 ||
    (code >= 32 && code <= 126) ||
    (code >= 0xc0 && code <= 0x24f)
  );
}

function nonPrintableRatio(text: string): number {
  if (!text.length) return 0;
  let bad = 0;
  for (const ch of text) {
    const code = ch.charCodeAt(0);
    if (!isPrintableChar(code) && code !== 0xa0) bad += 1;
  }
  return bad / text.length;
}

function wordCharRatio(text: string): number {
  const words = text.match(/[A-Za-zÀ-ÿ]{3,}/g) ?? [];
  const wordChars = words.join("").length;
  const nonWhitespace = text.replace(/\s/g, "").length;
  if (nonWhitespace === 0) return 0;
  return wordChars / nonWhitespace;
}

function countPdfArtifacts(text: string): number {
  return PDF_ARTIFACT_PATTERNS.filter((pattern) => pattern.test(text)).length;
}

export function isCorruptedPdfTextStream(text: string): boolean {
  const trimmed = text.trim();
  if (trimmed.length < MIN_EXTRACTABLE_LENGTH) return false;

  if (/\x00/.test(trimmed)) return true;
  if ((trimmed.match(/\uFFFD/g) ?? []).length >= 2) return true;
  if (/\\x[0-9A-Fa-f]{2}/.test(trimmed)) return true;

  const artifactCount = countPdfArtifacts(trimmed);
  if (artifactCount >= 2) return true;
  if (/\bstream\b/i.test(trimmed) && /\b(endobj|FlateDecode)\b/i.test(trimmed)) return true;

  if (nonPrintableRatio(trimmed) > 0.06) return true;

  if (wordCharRatio(trimmed) < 0.12) return true;

  const whitespaceRatio = (trimmed.match(/\s/g) ?? []).length / trimmed.length;
  if (trimmed.length > 80 && whitespaceRatio < 0.02) return true;

  return false;
}

export function pdfBufferHasCompressedTextStream(buffer: Buffer): boolean {
  const raw = buffer.toString("latin1", 0, 16000);
  return (
    /\/Filter\s*\/FlateDecode/i.test(raw) ||
    (/\bstream\b/i.test(raw) && /\bendstream\b/i.test(raw) && /\bFlateDecode\b/i.test(raw))
  );
}

export function detectCorruptedPdfExtraction(
  text: string,
  buffer: Buffer,
  isPdf: boolean,
): boolean {
  if (isCorruptedPdfTextStream(text)) return true;
  if (!isPdf) return false;
  if (!pdfBufferHasCompressedTextStream(buffer)) return false;
  return text.trim().length < MIN_EXTRACTABLE_LENGTH || isCorruptedPdfTextStream(text);
}

function labelPresentWithoutValue(text: string): string[] {
  const reasons: string[] = [];
  const normalized = text.replace(/\r\n/g, "\n");
  const lines = normalized.split("\n").map((line) => line.trim());

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i] ?? "";
    if (REQUERANT_LABEL.test(line) && /:\s*$/.test(line)) {
      const next = lines[i + 1]?.trim() ?? "";
      if (!next || REQUERANT_LABEL.test(next) || ADRESSE_LABEL.test(next)) {
        reasons.push("REQUÉRANT label found but following value is missing");
      }
    }
    if (/^REQU[ÉE]?RANT/i.test(line) && !line.includes(":")) {
      const next = lines[i + 1]?.trim() ?? "";
      if (!next || /^REQU|^ADRESSE|^TYPE|^DATE/i.test(next)) {
        reasons.push("REQUÉRANT found but no following value");
      }
    }
    if (/^ADRESSE\s*:?\s*$/i.test(line)) {
      const next = lines[i + 1]?.trim() ?? "";
      if (!next || /^\d/.test(next) === false) {
        reasons.push("ADRESSE found but empty");
      }
    }
  }

  const parsed = parseInspectionReportText(text);
  if (REQUERANT_LABEL.test(text) && !parsed.client.name) {
    reasons.push("REQUÉRANT label detected but client name not parsed");
  }
  if (ADRESSE_LABEL.test(text) && !parsed.property.address) {
    reasons.push("ADRESSE label detected but address not parsed");
  }

  return [...new Set(reasons)];
}

export function analyzeExtractedTextQuality(text: string): ExtractedTextQuality {
  const trimmed = text.trim();
  const reasons: string[] = [];

  if (trimmed.length < MIN_EXTRACTABLE_LENGTH) {
    return {
      quality: "image_only",
      reasons: ["fewer than 20 characters extracted"],
    };
  }

  if (isCorruptedPdfTextStream(trimmed)) {
    return {
      quality: "image_only",
      reasons: [CORRUPTED_PDF_TEXT_STREAM_REASON],
    };
  }

  if (trimmed.length < MIN_GOOD_LENGTH) {
    reasons.push(`fewer than ${MIN_GOOD_LENGTH} characters`);
  }

  const blankRatio = blankLineRatio(trimmed);
  if (blankRatio > 0.35) {
    reasons.push("many blank lines");
  }

  reasons.push(...labelPresentWithoutValue(trimmed));

  const parsed = parseInspectionReportText(trimmed);
  const steveLabels =
    /\b(requ[eé]rant|adresse|type de propri|ann[eé]e de construction)\b/i.test(trimmed);
  if (steveLabels && !parsed.client.name && !parsed.property.address) {
    reasons.push("labels detected but values missing");
  }

  if (reasons.length === 0) {
    return { quality: "good", reasons: [] };
  }

  return { quality: "weak", reasons: [...new Set(reasons)] };
}
