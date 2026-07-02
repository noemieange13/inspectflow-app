/**
 * Pilot #0.21 — preserve uncertain Steve handwriting as candidates (never discard).
 */
import type { HandwrittenFieldValue, LayoutTextBlock } from "@/lib/document_parsers/steveFieldSheetParser";
import type { SteveIgnoredToken } from "@/lib/steveFormFieldBoundaries";
import { isAddressContaminationToken, isPrintedFormStructureToken } from "@/lib/steveFormFieldBoundaries";

export type SteveFieldCandidateStatus = "accepted" | "candidate" | "ignored";

export type SteveFieldCandidate = {
  text: string;
  confidence: number;
  status: SteveFieldCandidateStatus;
};

export type SteveUncertainFieldValue = {
  value: string | null;
  candidates: SteveFieldCandidate[];
  confidence: number;
  requires_confirmation: boolean;
  source: HandwrittenFieldValue["source"];
  original_value?: string;
};

const ADDRESS_NOISE = /^(email|courriel|-)$/i;

function normalizeText(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

export function isStrictAddressToken(text: string): boolean {
  const trimmed = normalizeText(text);
  if (!trimmed || ADDRESS_NOISE.test(trimmed)) return false;
  return (
    /\d{2,}/.test(trimmed) ||
    /(rue|rut|avenue|chemin|mont-|laurier|reine|pr[eé]s|j\d)/i.test(trimmed) ||
    /\b[JK]\d[A-Z]?\s*\d[A-Z]\d\b/i.test(trimmed)
  );
}

export function classifyAddressToken(text: string): SteveFieldCandidateStatus {
  const trimmed = normalizeText(text);
  if (!trimmed || ADDRESS_NOISE.test(trimmed)) return "ignored";
  if (/^(vps|sees)$/i.test(trimmed)) return "ignored";
  if (isPrintedFormStructureToken(trimmed) || isAddressContaminationToken(trimmed)) return "ignored";
  return isStrictAddressToken(trimmed) ? "accepted" : "candidate";
}

export function buildCandidatesFromTokens(tokens: LayoutTextBlock[]): SteveFieldCandidate[] {
  return tokens.map((token) => ({
    text: normalizeText(token.text),
    confidence: token.confidence,
    status: classifyAddressToken(token.text),
  }));
}

export function joinActiveCandidateText(candidates: SteveFieldCandidate[]): string {
  return candidates
    .filter((candidate) => candidate.status !== "ignored")
    .map((candidate) => candidate.text)
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();
}

export function averageTokenConfidence(tokens: LayoutTextBlock[]): number {
  if (tokens.length === 0) return 0;
  return tokens.reduce((sum, token) => sum + token.confidence, 0) / tokens.length;
}

export function isFieldValueFuller(
  existing: string | null | undefined,
  incoming: string | null | undefined,
): boolean {
  const left = normalizeText(existing ?? "");
  const right = normalizeText(incoming ?? "");
  if (!right) return false;
  if (!left) return true;
  if (right.length > left.length) return true;
  if (/\d{2,}/.test(right) && left.length < 6) return true;
  if (/(rue|avenue|mont-|j\d)/i.test(right) && !/(rue|avenue|mont-|j\d)/i.test(left)) return true;
  return false;
}

export function buildHandwritingCandidateField(input: {
  value: string;
  original_value?: string;
  candidates: SteveFieldCandidate[];
  confidence: number;
  requires_confirmation?: boolean;
  ignored_tokens?: SteveIgnoredToken[];
}): HandwrittenFieldValue {
  const trimmed = normalizeText(input.value);
  return {
    value: trimmed.slice(0, 240),
    original_value: input.original_value && input.original_value !== trimmed ? input.original_value : undefined,
    source: "handwriting_candidate",
    confidence: input.confidence,
    requires_confirmation: input.requires_confirmation ?? true,
    candidates: input.candidates,
    ignored_tokens: input.ignored_tokens,
  };
}

export function readSteveCandidateDisplayValue(
  field: HandwrittenFieldValue | null | undefined,
): string | null {
  if (!field) return null;
  const primary = field.value?.trim();
  if (primary) return primary;
  const fromCandidates = joinActiveCandidateText(field.candidates ?? []);
  if (fromCandidates) return fromCandidates;
  return field.original_value?.trim() || null;
}
