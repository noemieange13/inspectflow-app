import type { ObservationSeverityClass } from "@/lib/observation_ai_engine";
import { PROVINCES, type ProvinceCode } from "@/lib/compliance/inspection-norms";

import type { ReportWriterLanguage, ReportWriterNormativeContext } from "./types";

export function resolveWriterLanguage(ctx: ReportWriterNormativeContext): ReportWriterLanguage {
  if (ctx.language === "en" || ctx.language === "fr") return ctx.language;
  const province = normalizeProvince(ctx.province);
  if (province === "ON" || province === "BC" || province === "AB") return "en";
  return "fr";
}

export function normalizeProvince(raw: string): ProvinceCode {
  const t = raw.trim().toUpperCase();
  if (t in PROVINCES) return t as ProvinceCode;
  if (t === "QUEBEC" || t === "QUÉBEC") return "QC";
  return "QC";
}

export function systemLabel(system: string, language: ReportWriterLanguage): string {
  const mapFr: Record<string, string> = {
    toiture: "toiture",
    structure: "structure / enveloppe",
    electricite: "installation électrique",
    plomberie: "plomberie",
    chauffage: "chauffage",
    isolation: "isolation",
    ventilation: "ventilation",
  };
  const mapEn: Record<string, string> = {
    toiture: "roofing",
    structure: "structure / building envelope",
    electricite: "electrical system",
    plomberie: "plumbing",
    chauffage: "heating",
    isolation: "insulation",
    ventilation: "ventilation",
  };
  const map = language === "en" ? mapEn : mapFr;
  return map[system] ?? system.replace(/_/g, " ");
}

export function buildImpactText(
  severity: ObservationSeverityClass,
  system: string,
  component: string,
  language: ReportWriterLanguage,
): string {
  const sys = systemLabel(system, language);
  const comp = component.trim() || sys;

  if (language === "en") {
    switch (severity) {
      case "safety":
        return `If left unaddressed, conditions observed on the ${comp} may increase safety risk for occupants or users of the ${sys}.`;
      case "major":
        return `Without further evaluation or correction, the observed condition on the ${comp} may lead to accelerated deterioration or loss of performance of the ${sys}.`;
      case "attention":
        return `The observed condition may progress over time and affect the service life or performance of the ${sys}.`;
      case "maintenance":
        return `At this stage, the condition appears compatible with normal wear; monitoring during routine upkeep is advisable.`;
    }
  }

  switch (severity) {
    case "safety":
      return `Si la situation perdure, l'état observé au niveau du ${comp} pourrait accroître un risque pour la sécurité des occupants ou des usagers du système (${sys}).`;
    case "major":
      return `Sans évaluation ou correction, l'état observé au ${comp} pourrait entraîner une dégradation accélérée ou une perte de performance du système (${sys}).`;
    case "attention":
      return `L'état observé pourrait évoluer avec le temps et affecter la durabilité ou le rendement du système (${sys}).`;
    case "maintenance":
      return `À ce stade, l'état observé semble compatible avec un entretien courant ; une surveillance lors des visites d'entretien est indiquée.`;
  }
}

export function buildRecommendationText(
  severity: ObservationSeverityClass,
  system: string,
  norme: string | undefined,
  language: ReportWriterLanguage,
  province: ProvinceCode,
): string {
  const body =
    norme?.trim() ||
    (PROVINCES[province]?.primaryBody ?? "applicable practice standard");

  if (language === "en") {
    switch (severity) {
      case "safety":
        return `Priority corrective action is recommended. Have a qualified specialist evaluate the ${systemLabel(system, language)} before continued use. Align with ${body}.`;
      case "major":
        return `Further evaluation and corrective work on the ${systemLabel(system, language)} are recommended. Consult qualified contractors as needed. Reference: ${body}.`;
      case "attention":
        return `Plan follow-up inspection or targeted maintenance on the ${systemLabel(system, language)} in the short term. Reference: ${body}.`;
      case "maintenance":
        return `Include this item in routine maintenance of the ${systemLabel(system, language)} and re-check at the next service visit. Reference: ${body}.`;
    }
  }

  switch (severity) {
    case "safety":
      return `Une correction prioritaire est recommandée. Faire évaluer le ${systemLabel(system, language)} par un spécialiste qualifié avant usage continu. Réf. : ${body}.`;
    case "major":
      return `Une évaluation complémentaire et des travaux correctifs sur le ${systemLabel(system, language)} sont recommandés. Consulter des entrepreneurs qualifiés au besoin. Réf. : ${body}.`;
    case "attention":
      return `Prévoir un suivi ou un entretien ciblé du ${systemLabel(system, language)} à court terme. Réf. : ${body}.`;
    case "maintenance":
      return `Intégrer cet élément à l'entretien courant du ${systemLabel(system, language)} et revérifier lors de la prochaine visite d'entretien. Réf. : ${body}.`;
  }
}

export function buildLimitationText(
  severity: ObservationSeverityClass,
  language: ReportWriterLanguage,
): string | null {
  if (language === "en") {
    return "Exact root cause was not determined during the non-invasive visual inspection.";
  }
  return "La cause exacte n'a pas été déterminée lors de l'inspection visuelle non invasive.";
}

/** Heuristique légère — évite re-traduction si le contenu est déjà dans la langue cible. */
export function detectEntryNoteLanguage(text: string): ReportWriterLanguage {
  const sample = text.trim();
  if (!sample) return "fr";

  const frPatterns =
    /\b(la|le|les|des|du|de|et|est|été|observé|recommandé|fondation|toiture|humidité|système|niveau|sans|pour|une|dans|sur|avec|lors|visuelle|entretien)\b/gi;
  const enPatterns =
    /\b(the|and|is|was|observed|recommended|foundation|roof|attic|moisture|system|level|without|for|during|visual|maintenance|should|may|have|been)\b/gi;

  const frScore = (sample.match(frPatterns) ?? []).length;
  const enScore = (sample.match(enPatterns) ?? []).length;

  if (enScore > frScore + 1) return "en";
  if (frScore > enScore + 1) return "fr";
  return frScore >= enScore ? "fr" : "en";
}

export function isAlarmistPhrase(text: string, language: ReportWriterLanguage): boolean {
  const patterns =
    language === "en"
      ? /\b(immediate danger|evacuate|emergency|critical failure|certain collapse)\b/i
      : /\b(danger immédiat|évacuation|urgence absolue|effondrement certain|catastroph)\b/i;
  return patterns.test(text);
}
