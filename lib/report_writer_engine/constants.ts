export const REPORT_WRITER_MODEL = "report-writer-v1";
export const REPORT_WRITER_PROMPT_VERSION = "professional-observation-v1";

/** Marqueur writer — distinct du moteur observation (3A). */
export const REPORT_WRITER_NOTE_MARKER = "<!-- report-writer-engine:v1 -->";

/** Patterns causaux interdits — on reformule en observation visuelle. */
export const INVENTED_CAUSE_PATTERNS: RegExp[] = [
  /\b(provient|provenant|caus[ée] par|due à|dû à|caused by|due to|results from|resulting from)\b/gi,
  /\b(la fuite vient|the leak is from|origine certaine|certainement caus)\b/gi,
];
