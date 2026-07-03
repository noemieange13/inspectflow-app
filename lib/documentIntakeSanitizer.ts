/**
 * Pilot Hotfix #1 — intake data-quality sanitizers.
 *
 * Pure, conservative OCR artifact cleanup used post-parse / pre-fusion. These
 * helpers never invent content: they either clean obvious OCR noise, preserve
 * the original value, or blank a field when it can only be reconstructed by
 * guessing.
 */

const CONTROL_CHARS = /[\u0000-\u001F\u007F-\u009F]/g;

/** Canadian province/territory codes that look like OCR noise but are legitimate. */
const CA_PROVINCE_CODES = new Set([
  "QC",
  "ON",
  "NB",
  "NS",
  "PE",
  "NL",
  "MB",
  "SK",
  "AB",
  "BC",
  "YT",
  "NT",
  "NU",
]);

const CA_POSTAL_FIRST = /^[A-Za-z]\d[A-Za-z]$/; // J9L
const CA_POSTAL_SECOND = /^\d[A-Za-z]\d$/; // 0H3

/** Confidence at/above which we allow known OCR substitutions on building values. */
export const BUILDING_HIGH_CONFIDENCE = 0.8;

/** Below this confidence a contaminated address is blanked rather than shown. */
export const ADDRESS_MIN_CONFIDENCE = 0.4;

/** Strip OCR control characters and collapse redundant whitespace. */
export function stripOcrControlChars(value: string): string {
  return value.replace(CONTROL_CHARS, " ").replace(/\s+/g, " ").trim();
}

/**
 * Issue 2 — remove OCR separator artifacts from free-text fields (roof, exterior,
 * heating, …) and return clean, human-readable text.
 *
 * Handles: repeated `+`, `:+` / `+:` runs, duplicated `:`, stray leading/trailing
 * punctuation and OCR control characters. Interior single separators that carry
 * meaning (e.g. a hyphen in "N-O") are preserved.
 */
export function cleanOcrSeparatorText(value: string): string {
  if (!value) return value;
  let out = stripOcrControlChars(value);
  // Any run of separators that contains a "+" is an OCR artifact → single comma.
  out = out.replace(/\s*[:+]*\+[:+]*\s*/g, ", ");
  // Collapse duplicated colons / commas produced by the pass above or by OCR.
  out = out.replace(/:{2,}/g, ":");
  out = out.replace(/(?:\s*,\s*){2,}/g, ", ");
  // Trim stray leading/trailing separators & punctuation.
  out = out.replace(/^[\s,:+.;·|-]+/, "").replace(/[\s,:+.;·|-]+$/, "");
  return out.replace(/\s+/g, " ").trim();
}

function isPostalToken(token: string): boolean {
  return CA_POSTAL_FIRST.test(token) || CA_POSTAL_SECOND.test(token);
}

/**
 * A token is treated as unrelated OCR noise when it is a short, all-uppercase
 * letter blob (e.g. "GX", "SER", "OÙ") that is neither a postal fragment nor a
 * province code, and carries no digits.
 */
export function looksLikeOcrNoiseToken(token: string): boolean {
  const core = token.replace(/[^\p{L}\p{N}]/gu, "");
  if (!core) return true; // pure punctuation
  if (/\d/.test(core)) return false; // civic numbers / years → keep
  if (isPostalToken(token)) return false;
  const upper = core.toUpperCase();
  if (CA_PROVINCE_CODES.has(upper)) return false;
  return core.length <= 3 && core === upper;
}

/**
 * Issue 1 — keep address content clean and independent from unrelated OCR
 * fragments.
 *
 * Removes trailing OCR-noise tokens so distinct fields (address / city /
 * province / postal) never get silently concatenated. When confidence is low
 * and the value is still dominated by noise, returns "" instead of inventing an
 * address.
 */
export function sanitizeAddressValue(value: string, confidence = 0.7): string {
  const cleaned = stripOcrControlChars(value).replace(/\s+,/g, ",");
  if (!cleaned) return "";

  const tokens = cleaned.split(/\s+/).filter(Boolean);
  while (tokens.length > 1 && looksLikeOcrNoiseToken(tokens[tokens.length - 1]!)) {
    tokens.pop();
  }

  if (confidence < ADDRESS_MIN_CONFIDENCE) {
    const residualNoise = tokens.filter(looksLikeOcrNoiseToken).length;
    if (residualNoise >= 2 || (tokens.length > 0 && residualNoise / tokens.length > 0.5)) {
      return "";
    }
  }

  return tokens
    .join(" ")
    .replace(/\s+,/g, ",")
    .replace(/[\s,]+$/, "")
    .trim();
}

/**
 * Issue 3 — normalize building values.
 *
 * OCR control characters are always removed (never meaningful). Known OCR
 * substitutions (currently: backslash misread of a slash) are applied ONLY when
 * confidence is high; otherwise the original value is preserved verbatim so we
 * never guess.
 */
export function normalizeBuildingValue(value: string, confidence: number): string {
  const base = stripOcrControlChars(value);
  if (confidence < BUILDING_HIGH_CONFIDENCE) return base;
  return base.replace(/\\/g, "/").replace(/\s+/g, " ").trim();
}
