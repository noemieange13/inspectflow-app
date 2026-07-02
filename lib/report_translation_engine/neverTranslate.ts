/**
 * Segments qui ne doivent jamais être traduits (noms, adresses, numéros, références légales).
 */

const LEGAL_REF_PATTERN =
  /\b(R\.?B\.?Q\.?|NBC|CSA\s+C[\d.]+|CNB|Code\s+(?:national|du\s+bâtiment)|AIBQ\s*#?\d+|RBQ\s*#?\d+)\b/gi;

const CERT_NUMBER_PATTERN = /\b(?:#|No\.?|n[°o]\s*)\s*\d[\d-]{2,}\b/gi;

const STREET_ADDRESS_PATTERN =
  /\b\d{1,5}\s+(?:rue|avenue|av\.?|boulevard|boul\.?|street|st\.?|road|rd\.?|drive|dr\.?)\s+[\wÀ-ÿ' -]{2,40}\b/gi;

const POSTAL_CODE_PATTERN = /\b[A-Z]\d[A-Z]\s?\d[A-Z]\d\b/gi;

const PHONE_PATTERN = /\b(?:\+?1[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}\b/g;

const EMAIL_PATTERN = /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi;

const PROTECTED_MARKER_PREFIX = "\uE000";
const PROTECTED_MARKER_SUFFIX = "\uE001";

export function collectProtectedSpans(text: string, extraTerms: string[] = []): string[] {
  const spans = new Set<string>();
  const patterns = [
    LEGAL_REF_PATTERN,
    CERT_NUMBER_PATTERN,
    STREET_ADDRESS_PATTERN,
    POSTAL_CODE_PATTERN,
    PHONE_PATTERN,
    EMAIL_PATTERN,
  ];
  for (const re of patterns) {
    re.lastIndex = 0;
    for (const m of text.matchAll(re)) {
      if (m[0]?.trim()) spans.add(m[0].trim());
    }
  }
  for (const term of extraTerms) {
    const t = term.trim();
    if (t.length >= 2 && text.includes(t)) spans.add(t);
  }
  return [...spans].sort((a, b) => b.length - a.length);
}

export function wrapProtectedSpans(text: string, protectedSpans: string[]): string {
  let out = text;
  for (const span of protectedSpans) {
    if (!span || !out.includes(span)) continue;
    const marker = `${PROTECTED_MARKER_PREFIX}${span}${PROTECTED_MARKER_SUFFIX}`;
    out = out.split(span).join(marker);
  }
  return out;
}

export function unwrapProtectedSpans(text: string): string {
  return text
    .split(PROTECTED_MARKER_PREFIX)
    .join("")
    .split(PROTECTED_MARKER_SUFFIX)
    .join("");
}

export function shouldNeverTranslateField(field: string): boolean {
  return field === "id" || field === "order" || field === "severity_class";
}

/** Client / inspector names supplied by caller — never glossary-translated. */
export function mergeProtectedTerms(
  text: string,
  names: string[],
): string[] {
  return collectProtectedSpans(text, names.filter((n) => n.trim().length >= 2));
}
