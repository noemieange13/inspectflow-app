import type { IssueCode, Severity, ZoneCode } from "@/lib/reportNarrative";

/** Sévérité affichée à l'inspecteur (français). */
export type LocalSeverityLabel = "mineure" | "moyenne" | "majeure";

/** Catégories métier détectées par mots-clés. */
export type LocalCategory =
  | "infiltration"
  | "fissure"
  | "électricité"
  | "plomberie"
  | "ventilation"
  | "structure"
  | "sécurité";

export type StructuredObservation = {
  room: string;
  component: string;
  issue: string;
  category: LocalCategory;
  severity: LocalSeverityLabel;
  recommendation: string;
  zone: ZoneCode;
  issueCode: IssueCode;
  reportSeverity: Severity;
};

export interface InspectionObservationProvider {
  parseInspectionObservation(input: string): StructuredObservation;
}

const ROOM_PATTERNS: Array<{ pattern: RegExp; room: string; zone: ZoneCode }> = [
  { pattern: /\bcuisine\b/i, room: "Cuisine", zone: "cuisine" },
  { pattern: /\bsalle\s*de\s*bain\b|\bsdb\b|\btoilette?s?\b/i, room: "Salle de bain", zone: "salle_de_bain" },
  { pattern: /\bsalon\b|\bliving\b/i, room: "Salon", zone: "salon" },
  { pattern: /\bchambre\b/i, room: "Chambre", zone: "autre" },
  { pattern: /\bsous[\s-]?sol\b|\bbasement\b/i, room: "Sous-sol", zone: "sous_sol" },
  { pattern: /\bgrenier\b|\bcombles?\b|\battic\b/i, room: "Grenier", zone: "grenier" },
  { pattern: /\bext[ée]rieur\b|\bterrain\b|\bcour\b|\bpatio\b/i, room: "Extérieur", zone: "exterieur" },
  { pattern: /\btoit(?:ure)?\b|\broof\b/i, room: "Toiture", zone: "toiture" },
  { pattern: /\bgarage\b/i, room: "Garage", zone: "garage" },
  { pattern: /\bfondation\b|\bstructur/i, room: "Structure", zone: "fondation" },
  { pattern: /\b[ée]lectri/i, room: "Installation électrique", zone: "installation_electrique" },
  { pattern: /\bplomber/i, room: "Plomberie", zone: "plomberie" },
  { pattern: /\bfa[çc]ade\b/i, room: "Façade", zone: "facade" },
];

const CATEGORY_PATTERNS: Array<{ pattern: RegExp; category: LocalCategory; issueCode: IssueCode }> = [
  { pattern: /\binfiltr|\bfuite\b|\bécoulement\b|\bgoutte\b/i, category: "infiltration", issueCode: "water_infiltration" },
  { pattern: /\bfissur/i, category: "fissure", issueCode: "crack_wall" },
  { pattern: /\b[ée]lectri|\bpanneau\b|\bprise\b|\bfil\b|\bdisjonct/i, category: "électricité", issueCode: "electrical_risk" },
  { pattern: /\bplomber|\btuyau\b|\brobinet\b|\bdrain\b|\bévacuation\b/i, category: "plomberie", issueCode: "plumbing_issue" },
  { pattern: /\bventil|\bextracteur\b|\bvni\b|\bmoisiss/i, category: "ventilation", issueCode: "ventilation_issue" },
  { pattern: /\bstructur|\baffaisse|\bcharpente\b|\bpoutre\b/i, category: "structure", issueCode: "structure_movement" },
  { pattern: /\bs[ée]curit|\bd[ée]tecteur\b|\bincendie\b|\brampe\b|\bgarde[\s-]?corps\b/i, category: "sécurité", issueCode: "fire_safety" },
];

const MAJOR_SEVERITY = /\b(urgent|grave|majeur|importante?|danger|critique|risque|s[ée]curit[ée]|imm[ée]diat)\b/i;
const MINOR_SEVERITY = /\b(l[ée]ger|l[ée]g[èe]re|mineur|superficiel|esth[ée]tique|faible|cosm[ée]tique)\b/i;

const COMPONENT_HINTS: Array<{ pattern: RegExp; label: string }> = [
  { pattern: /\bplafond\b/i, label: "Plafond" },
  { pattern: /\bmur\b/i, label: "Mur" },
  { pattern: /\bplancher\b|\bsol\b/i, label: "Plancher" },
  { pattern: /\bfen[êe]tre\b/i, label: "Fenêtre" },
  { pattern: /\bporte\b/i, label: "Porte" },
  { pattern: /\btoit(?:ure)?\b/i, label: "Toiture" },
  { pattern: /\bgoutti[èe]re\b/i, label: "Gouttière" },
  { pattern: /\bvanit[ée]\b|\blavabo\b/i, label: "Vanité" },
  { pattern: /\bdouche\b|\bbaignoire\b/i, label: "Douche / baignoire" },
  { pattern: /\bcomptoir\b/i, label: "Comptoir" },
  { pattern: /\barmoire\b/i, label: "Armoire électrique" },
  { pattern: /\bthermopompe\b|\bclimatisation\b/i, label: "Thermopompe" },
];

const DEFAULT_RECOMMENDATIONS: Record<LocalCategory, string> = {
  infiltration: "Faire vérifier l'étanchéité et corriger la source d'infiltration.",
  fissure: "Documenter l'évolution et consulter un spécialiste si la fissure s'agrandit.",
  électricité: "Faire corriger par un entrepreneur électricien certifié.",
  plomberie: "Faire réparer par un plombier qualifié.",
  ventilation: "Améliorer la ventilation ou faire entretenir le système.",
  structure: "Faire évaluer par un ingénieur ou entrepreneur spécialisé.",
  sécurité: "Corriger sans délai pour assurer la sécurité des occupants.",
};

function normalizeInput(input: string): string {
  return input.replace(/\s+/g, " ").trim();
}

function detectRoom(text: string): { room: string; zone: ZoneCode } {
  for (const { pattern, room, zone } of ROOM_PATTERNS) {
    if (pattern.test(text)) return { room, zone };
  }
  return { room: "Zone non précisée", zone: "autre" };
}

function detectCategory(text: string): { category: LocalCategory; issueCode: IssueCode } {
  for (const { pattern, category, issueCode } of CATEGORY_PATTERNS) {
    if (pattern.test(text)) return { category, issueCode };
  }
  return { category: "structure", issueCode: "other" };
}

function detectSeverity(text: string): LocalSeverityLabel {
  if (MAJOR_SEVERITY.test(text)) return "majeure";
  if (MINOR_SEVERITY.test(text)) return "mineure";
  return "moyenne";
}

export function localSeverityToReport(severity: LocalSeverityLabel): Severity {
  switch (severity) {
    case "mineure":
      return "low";
    case "majeure":
      return "high";
    default:
      return "medium";
  }
}

function detectComponent(text: string, room: string): string {
  for (const { pattern, label } of COMPONENT_HINTS) {
    if (pattern.test(text)) return label;
  }
  return room !== "Zone non précisée" ? `Élément — ${room}` : "Élément observé";
}

function extractIssueSentence(text: string): string {
  const cleaned = normalizeInput(text);
  if (cleaned.length <= 120) return cleaned;
  const firstSentence = cleaned.split(/[.!?]/)[0]?.trim();
  return firstSentence && firstSentence.length > 10 ? firstSentence : cleaned.slice(0, 120);
}

function buildRecommendation(category: LocalCategory, issue: string): string {
  const base = DEFAULT_RECOMMENDATIONS[category];
  if (issue.length > 20 && /surveill/i.test(issue)) {
    return "Surveiller l'évolution et planifier une correction si nécessaire.";
  }
  return base;
}

/** Moteur local rule-based — aucun appel OpenAI requis. */
export function parseInspectionObservation(input: string): StructuredObservation {
  const text = normalizeInput(input);
  const { room, zone } = detectRoom(text);
  const { category, issueCode } = detectCategory(text);
  const severity = detectSeverity(text);
  const component = detectComponent(text, room);
  const issue = extractIssueSentence(text) || "Constat à préciser.";
  const recommendation = buildRecommendation(category, issue);

  return {
    room,
    component,
    issue,
    category,
    severity,
    recommendation,
    zone,
    issueCode,
    reportSeverity: localSeverityToReport(severity),
  };
}

/** Adaptateur futur OpenAI — même contrat que le moteur local. */
export class LocalInspectionObservationProvider implements InspectionObservationProvider {
  parseInspectionObservation(input: string): StructuredObservation {
    return parseInspectionObservation(input);
  }
}

export const localInspectionObservationProvider = new LocalInspectionObservationProvider();

export function severityLabelFr(severity: LocalSeverityLabel): string {
  switch (severity) {
    case "mineure":
      return "Mineure";
    case "majeure":
      return "Majeure";
    default:
      return "Moyenne";
  }
}

export function categoryLabelFr(category: LocalCategory): string {
  const labels: Record<LocalCategory, string> = {
    infiltration: "Infiltration",
    fissure: "Fissure",
    électricité: "Électricité",
    plomberie: "Plomberie",
    ventilation: "Ventilation",
    structure: "Structure",
    sécurité: "Sécurité",
  };
  return labels[category];
}
