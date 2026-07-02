/**
 * Pilot #0.11 — document type detection priority (Steve field sheet before client_email).
 */
import type { DocumentIntakeDocumentType } from "@/lib/documentIntakeFiles";
import { isSteveFieldSheet } from "@/lib/document_parsers/steveFieldSheetParser";

export type SteveFieldNotesDetection = {
  match: boolean;
  reason: string;
};

const STEVE_STRONG_INDICATORS = [
  /inspect[- ]?habitation/i,
  /check[- ]?list for report/i,
  /check[- ]?list pour rapport/i,
];

const STEVE_LABEL_PATTERNS = [
  /\bdate\b/i,
  /\badresse\b/i,
  /type de b[aâ]timent/i,
  /ann[eé]e de construction/i,
  /orientation de la fa[cç]ade/i,
  /rev[eê]tement ext[eé]rieur/i,
  /r[eé]servoir eau chaude/i,
  /type de chauffage/i,
  /^toiture\b/i,
  /^\d+\.\s*toiture\b/i,
];

function normalizeClassifierText(text: string): string {
  return text
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

export function detectSteveFieldNotes(text: string): SteveFieldNotesDetection {
  const normalized = normalizeClassifierText(text);

  if (isSteveFieldSheet(text)) {
    return { match: true, reason: "Steve checklist signature detected" };
  }

  const hasStrongIndicator = STEVE_STRONG_INDICATORS.some((pattern) => pattern.test(normalized));
  if (hasStrongIndicator) {
    return { match: true, reason: "Steve checklist signature detected" };
  }

  const labelHits = STEVE_LABEL_PATTERNS.filter((pattern) => pattern.test(normalized)).length;
  if (labelHits >= 3) {
    return { match: true, reason: "Steve checklist signature detected" };
  }

  return { match: false, reason: "" };
}

export function hasClientEmailDocumentIndicators(
  text: string,
  fileName = "",
): boolean {
  const lowerName = fileName.toLowerCase();
  if (lowerName.endsWith(".eml")) return true;

  const sample = text.slice(0, 8000);
  if (/(?:^|[\n\r(])(from|to|de|à|objet|subject)\s*:/im.test(sample)) return true;
  if (/\b(from|to|de|à|objet|subject)\s*:/im.test(sample)) return true;

  const hasEmailAddress = /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/.test(sample);
  const hasEmailContext = /\b(from|to|de|à|objet|subject)\s*:/im.test(sample);
  return hasEmailAddress && hasEmailContext;
}

export function classifyClientEmailFromBuffer(fileName: string, bufferHead: string): boolean {
  return hasClientEmailDocumentIndicators(bufferHead, fileName);
}

export function detectSteveFieldNotesFromBuffer(
  fileName: string,
  bufferHead: string,
): SteveFieldNotesDetection {
  return detectSteveFieldNotes(`${fileName}\n${bufferHead}`);
}

export function resolveTextDocumentType(
  text: string,
  classifiedType: DocumentIntakeDocumentType,
  fileName = "",
): DocumentIntakeDocumentType {
  if (detectSteveFieldNotes(text).match) return "steve_field_notes";
  if (classifiedType === "seller_disclosure") return "seller_disclosure";
  if (hasClientEmailDocumentIndicators(text, fileName)) return "client_email";
  if (classifiedType === "broker_email") return "broker_email";
  if (classifiedType === "previous_inspection_report") return "previous_inspection_report";
  if (classifiedType === "attachment") return "attachment";
  return classifiedType === "client_email" ? "other" : classifiedType;
}
