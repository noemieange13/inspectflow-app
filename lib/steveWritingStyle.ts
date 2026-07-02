/**
 * Phase 8V — Banque de formulations Steve + garde-fous rédactionnels.
 */

export const STEVE_OPENERS_FR = [
  "Nous avons observé",
  "Nous avons constaté",
  "Au moment de l'inspection",
  "Aucune anomalie n'a été constatée",
  "Par mesure préventive",
  "Contacter un entrepreneur qualifié afin de",
] as const;

export const STEVE_FORBIDDEN_WRITING_PATTERNS = [
  /\bIA détecte\b/i,
  /\bprobablement\b/i,
  /\bsemble être\b/i,
  /\bpeut-être\b/i,
  /\bAI detect/i,
  /\bprobably\b/i,
  /\bseems to be\b/i,
  /\bmaybe\b/i,
] as const;

export const STEVE_NO_ANOMALY_COMMENT_FR =
  "Aucune anomalie apparente n'a été constatée au moment de l'inspection.";

export const STEVE_NO_ANOMALY_COMMENT_EN =
  "No apparent anomaly was observed at the time of inspection.";

export function containsSteveForbiddenPhrase(text: string): boolean {
  return STEVE_FORBIDDEN_WRITING_PATTERNS.some((re) => re.test(text));
}

export function sanitizeSteveWriting(text: string): string {
  let out = text.trim();
  for (const re of STEVE_FORBIDDEN_WRITING_PATTERNS) {
    out = out.replace(re, "").trim();
  }
  return out.replace(/\s{2,}/g, " ");
}

export function defaultSteveNoAnomalyComment(language: "fr" | "en" = "fr"): string {
  return language === "en" ? STEVE_NO_ANOMALY_COMMENT_EN : STEVE_NO_ANOMALY_COMMENT_FR;
}

export function ensureSteveCommentEnding(
  commentaire: string,
  language: "fr" | "en" = "fr",
): string {
  const cleaned = sanitizeSteveWriting(commentaire);
  if (cleaned.length > 0) return cleaned;
  return defaultSteveNoAnomalyComment(language);
}

export function buildSteveObservationPrefix(
  component: string,
  language: "fr" | "en" = "fr",
): string {
  const label = component.trim();
  if (!label) {
    return language === "en" ? "We observed " : "Nous avons observé ";
  }
  return language === "en"
    ? `We observed at ${label}: `
    : `Nous avons observé au niveau de ${label} : `;
}

export function buildSteveRecommendation(
  action: string,
  language: "fr" | "en" = "fr",
): string {
  const body = sanitizeSteveWriting(action);
  if (!body) return "";
  if (/entrepreneur qualifié|qualified contractor/i.test(body)) return body;
  return language === "en"
    ? `Contact a qualified contractor to ${body.replace(/^[.:,\s]+/, "")}`
    : `Contacter un entrepreneur qualifié afin de ${body.replace(/^[.:,\s]+/, "")}`;
}
