/**
 * Phase 8C-FIX — validation fichiers intake documentaire (PDF terrain).
 */
import {
  extractEmailTextLocal,
  extractPdfTextLocal,
  extractPlainTextLocal,
} from "@/lib/pdfTextExtractLocal";
import type { DocumentIntakeKind } from "@/lib/document-intelligence";
import {
  classifyClientEmailFromBuffer,
  detectSteveFieldNotesFromBuffer,
  hasClientEmailDocumentIndicators,
} from "@/lib/documentTypeClassifier";

export type DocumentIntakeDocumentType =
  | "seller_disclosure"
  | "broker_email"
  | "client_email"
  | "previous_inspection_report"
  | "steve_field_notes"
  | "attachment"
  | "other";

/** Valeur `accept` pour input file (Mac + Windows). */
export const DOCUMENT_INTAKE_FILE_ACCEPT =
  ".pdf,.eml,.txt,application/pdf,message/rfc822,text/plain";

export const DOCUMENT_INTAKE_DV_ACCEPT =
  ".pdf,.eml,.txt,application/pdf,message/rfc822,text/plain,image/jpeg,image/png,image/webp";

const BLOCKED_EXTENSIONS = new Set([
  "exe",
  "bat",
  "cmd",
  "com",
  "sh",
  "dll",
  "msi",
  "app",
  "dmg",
  "pkg",
  "scr",
  "vbs",
  "js",
]);

export function fileExtension(fileName: string): string {
  const parts = fileName.toLowerCase().split(".");
  return parts.length > 1 ? (parts.pop() ?? "") : "";
}

export function isLikelyPdfBuffer(buf: Buffer, fileName: string, mime: string): boolean {
  if (mime === "application/pdf") return true;
  if (buf.subarray(0, 4).toString("latin1") === "%PDF") return true;
  return fileName.toLowerCase().endsWith(".pdf");
}

export function isBlockedIntakeExtension(fileName: string): boolean {
  return BLOCKED_EXTENSIONS.has(fileExtension(fileName));
}

export type IntakeFileValidation = { ok: true } | { ok: false; error: string };

export function validateIntakeFile(
  fileName: string,
  mime: string,
  buf: Buffer,
): IntakeFileValidation {
  const name = fileName.trim() || "document";
  const mimeLower = (mime || "").toLowerCase();

  if (isBlockedIntakeExtension(name)) {
    return { ok: false, error: "Format non autorisé." };
  }

  if (isLikelyPdfBuffer(buf, name, mimeLower)) return { ok: true };
  if (name.toLowerCase().endsWith(".eml") || mimeLower.includes("rfc822")) return { ok: true };
  if (name.toLowerCase().endsWith(".txt") || mimeLower.startsWith("text/")) return { ok: true };
  if (mimeLower.startsWith("image/")) return { ok: true };

  return {
    ok: false,
    error: "Format non pris en charge. Utilisez PDF, courriel (.eml) ou texte.",
  };
}

/** Validation côté navigateur (sans Buffer). */
export function validateIntakeFileClient(fileName: string, mime: string): IntakeFileValidation {
  const name = fileName.trim() || "document";
  const mimeLower = (mime || "").toLowerCase();

  if (isBlockedIntakeExtension(name)) {
    return { ok: false, error: "Format non autorisé." };
  }

  if (name.toLowerCase().endsWith(".pdf") || mimeLower === "application/pdf") return { ok: true };
  if (name.toLowerCase().endsWith(".eml") || mimeLower.includes("rfc822")) return { ok: true };
  if (name.toLowerCase().endsWith(".txt") || mimeLower.startsWith("text/")) return { ok: true };
  if (mimeLower.startsWith("image/")) return { ok: true };

  return {
    ok: false,
    error: "Format non pris en charge. Utilisez PDF, courriel (.eml) ou texte.",
  };
}

export function classifyDocumentType(
  fileName: string,
  mime: string,
  buf: Buffer,
  uploadKind: DocumentIntakeKind,
): DocumentIntakeDocumentType {
  const lowerName = fileName.toLowerCase();
  const head = buf.subarray(0, 4000).toString("utf8").toLowerCase();
  const haystack = `${lowerName}\n${head}`;

  if (
    /rapport\s+d['']inspection|inspection\s+pr[eé]-achat/i.test(haystack)
  ) {
    return "previous_inspection_report";
  }

  if (
    /declaration.*vendeur|d[eé]claration du vendeur|\bdv\b|seller disclosure/.test(haystack)
  ) {
    return "seller_disclosure";
  }

  const steveFromBuffer = detectSteveFieldNotesFromBuffer(lowerName, head);
  if (steveFromBuffer.match) {
    return "steve_field_notes";
  }

  if (/courtier|broker|centris|mls|real estate agent/.test(haystack)) {
    return "broker_email";
  }

  if (classifyClientEmailFromBuffer(lowerName, head)) {
    return "client_email";
  }

  if (
    isLikelyPdfBuffer(buf, fileName, mime) &&
    /gmail|outlook|mail\.google/.test(haystack) &&
    hasClientEmailDocumentIndicators(haystack, fileName)
  ) {
    return "client_email";
  }

  if (/annexe|attachment|pi[eè]ce jointe/.test(haystack)) {
    return "attachment";
  }

  return "other";
}

/** Extraction texte unifiée — jamais stocker le PDF seul sans passer par ici. */
export function extractDocumentText(buffer: Buffer, fileName: string, mime: string): string {
  const mimeLower = (mime || "").toLowerCase();
  if (fileName.toLowerCase().endsWith(".eml") || mimeLower.includes("rfc822")) {
    return extractEmailTextLocal(buffer);
  }
  if (isLikelyPdfBuffer(buffer, fileName, mimeLower)) {
    return extractPdfTextLocal(buffer);
  }
  return extractPlainTextLocal(buffer, fileName);
}

export function buildTextExcerpt(text: string, maxLength = 4000): string {
  return text.slice(0, maxLength);
}
