import { INVENTED_CAUSE_PATTERNS } from "./constants";

/** Reformule sans attribuer de cause non observée. */
export function sanitizeFactualObservation(raw: string, language: "fr" | "en"): string {
  let text = raw.trim();
  for (const pattern of INVENTED_CAUSE_PATTERNS) {
    text = text.replace(pattern, language === "en" ? " consistent with " : " compatible avec ");
  }

  text = text
    .replace(/\s{2,}/g, " ")
    .replace(/\s+([,.;])/g, "$1")
    .trim();

  if (language === "en") {
    if (!/^at inspection|^during the visual|^visible\b/i.test(text)) {
      text = `During the visual inspection, ${text.charAt(0).toLowerCase()}${text.slice(1)}`;
    }
  } else if (!/^à l'inspection|^lors de l'inspection|^des traces|^une condition|^des signes/i.test(text)) {
    text = `À l'inspection visuelle, ${text.charAt(0).toLowerCase()}${text.slice(1)}`;
  }

  return text.endsWith(".") ? text : `${text}.`;
}

export function containsInventedCause(text: string): boolean {
  return INVENTED_CAUSE_PATTERNS.some((p) => {
    p.lastIndex = 0;
    return p.test(text);
  });
}
