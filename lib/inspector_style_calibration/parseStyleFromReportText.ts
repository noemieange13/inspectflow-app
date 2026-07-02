/**
 * Phase 8Q — Extract style signals from report text (PII stripped).
 */

const EMAIL_RE = /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/gi;
const PHONE_RE = /\b(?:\+?1[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}\b/g;
const POSTAL_RE = /\b[A-Z]\d[A-Z]\s?\d[A-Z]\d\b/gi;
const STREET_RE =
  /\b\d{1,5}\s+(?:rue|avenue|av\.?|boulevard|boul\.?|street|st\.?|road|rd\.?|drive|dr\.?)\s+[\w\s'-]{2,40}/gi;
const CLIENT_LABEL_RE =
  /(?:client|vendeur|acheteur|buyer|seller|propriétaire|owner)\s*[:\-]\s*[^\n]{2,60}/gi;
const NAME_AFTER_LABEL_RE =
  /(?:inspecté pour|inspected for|préparé pour|prepared for)\s*[:\-]?\s*[^\n]{2,60}/gi;

export type StyleTextAnalysis = {
  sanitized_text: string;
  finding_blocks: string[];
  recommendation_blocks: string[];
  section_labels: string[];
  avg_finding_length: number;
  avg_recommendation_length: number;
  frequent_words: string[];
  frequent_phrases: string[];
  structure_patterns: string[];
};

const STOP_WORDS = new Set([
  "le",
  "la",
  "les",
  "de",
  "du",
  "des",
  "un",
  "une",
  "et",
  "est",
  "au",
  "aux",
  "en",
  "sur",
  "pour",
  "par",
  "avec",
  "the",
  "and",
  "or",
  "of",
  "to",
  "in",
  "for",
  "on",
  "at",
  "is",
  "was",
  "are",
  "be",
  "this",
  "that",
  "from",
]);

const SECTION_LABEL_PATTERNS = [
  { pattern: /^observation\b/im, label: "Observation" },
  { pattern: /^constat\b/im, label: "Constat" },
  { pattern: /^impact\b/im, label: "Impact" },
  { pattern: /^conséquence/im, label: "Conséquence" },
  { pattern: /^recommandation\b/im, label: "Recommandation" },
  { pattern: /^recommendation\b/im, label: "Recommendation" },
  { pattern: /^limitation\b/im, label: "Limitation" },
];

function stripPiiPatterns(text: string): string {
  return text
    .replace(EMAIL_RE, "[redacted]")
    .replace(PHONE_RE, "[redacted]")
    .replace(POSTAL_RE, "[redacted]")
    .replace(STREET_RE, "[redacted address]")
    .replace(CLIENT_LABEL_RE, "[redacted client]")
    .replace(NAME_AFTER_LABEL_RE, "[redacted client]");
}

function extractSectionBlocks(text: string, labelPattern: RegExp): string[] {
  const blocks: string[] = [];
  const lines = text.split(/\r?\n/);
  let current: string[] = [];
  let inSection = false;

  for (const line of lines) {
    if (labelPattern.test(line.trim())) {
      if (current.length) blocks.push(current.join("\n").trim());
      current = [];
      inSection = true;
      continue;
    }
    if (inSection) {
      if (/^(observation|constat|impact|conséquence|recommandation|recommendation|limitation)\b/i.test(line.trim())) {
        if (current.length) blocks.push(current.join("\n").trim());
        current = [];
        continue;
      }
      current.push(line);
    }
  }
  if (current.length) blocks.push(current.join("\n").trim());
  return blocks.filter((b) => b.length > 10);
}

function tokenizeWords(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s'-]/gu, " ")
    .split(/\s+/)
    .filter((w) => w.length > 3 && !STOP_WORDS.has(w));
}

function topFrequent(items: string[], limit: number): string[] {
  const counts = new Map<string, number>();
  for (const item of items) {
    counts.set(item, (counts.get(item) ?? 0) + 1);
  }
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([word]) => word);
}

function extractPhrases(text: string): string[] {
  const phrases: string[] = [];
  const patterns = [
    /(?:il est recommandé|it is recommended|nous recommandons|we recommend)[^.!?]{0,80}/gi,
    /(?:surveillance|monitoring|follow-up|suivi)[^.!?]{0,60}/gi,
    /(?:entrepreneur qualifié|qualified contractor|spécialiste qualifié|qualified specialist)[^.!?]{0,60}/gi,
    /(?:inspection visuelle|visual inspection)[^.!?]{0,60}/gi,
    /(?:à court terme|in the short term)[^.!?]{0,40}/gi,
  ];
  for (const re of patterns) {
    const matches = text.match(re) ?? [];
    for (const m of matches) {
      const cleaned = m.trim().replace(/\s+/g, " ");
      if (cleaned.length > 12) phrases.push(cleaned.slice(0, 120));
    }
  }
  return [...new Set(phrases)].slice(0, 15);
}

function detectStructurePatterns(text: string, labels: string[]): string[] {
  const patterns: string[] = [];
  if (labels.includes("Observation") || labels.includes("Constat")) {
    patterns.push("observation_section");
  }
  if (labels.some((l) => /impact|conséquence/i.test(l))) {
    patterns.push("impact_section");
  }
  if (labels.some((l) => /recommandation|recommendation/i.test(l))) {
    patterns.push("recommendation_section");
  }
  if (/limitation/i.test(text)) patterns.push("limitation_section");
  if (patterns.length === 0 && text.length > 200) patterns.push("narrative_blocks");
  return patterns;
}

export function parseStyleFromReportText(text: string): StyleTextAnalysis {
  const sanitized_text = stripPiiPatterns(text);
  const section_labels: string[] = [];
  for (const { pattern, label } of SECTION_LABEL_PATTERNS) {
    if (pattern.test(sanitized_text)) section_labels.push(label);
  }

  const finding_blocks = [
    ...extractSectionBlocks(sanitized_text, /^(observation|constat)\b/i),
  ];
  const recommendation_blocks = extractSectionBlocks(
    sanitized_text,
    /^(recommandation|recommendation)\b/i,
  );

  const allWords = tokenizeWords(sanitized_text);
  const frequent_words = topFrequent(allWords, 20);
  const frequent_phrases = extractPhrases(sanitized_text);
  const structure_patterns = detectStructurePatterns(sanitized_text, section_labels);

  const findingLengths = finding_blocks.map((b) => b.length);
  const recLengths = recommendation_blocks.map((b) => b.length);
  const avg_finding_length =
    findingLengths.length > 0
      ? findingLengths.reduce((a, b) => a + b, 0) / findingLengths.length
      : sanitized_text.length / Math.max(1, (sanitized_text.match(/\n\n/g) ?? []).length + 1);
  const avg_recommendation_length =
    recLengths.length > 0
      ? recLengths.reduce((a, b) => a + b, 0) / recLengths.length
      : avg_finding_length * 0.6;

  return {
    sanitized_text,
    finding_blocks,
    recommendation_blocks,
    section_labels: [...new Set(section_labels)],
    avg_finding_length,
    avg_recommendation_length,
    frequent_words,
    frequent_phrases,
    structure_patterns,
  };
}

/** Test helper — verify PII patterns were stripped from output. */
export function containsStrippedPii(styleOutput: string, originalPii: string[]): boolean {
  const lower = styleOutput.toLowerCase();
  return originalPii.some((p) => p.trim().length > 2 && lower.includes(p.trim().toLowerCase()));
}
