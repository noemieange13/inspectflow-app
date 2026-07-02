/**
 * Glossaire professionnel inspection bâtiment FR ↔ EN (Phase 8I).
 * Paires triées par longueur décroissante pour remplacement phrase entière d'abord.
 */

export type InspectionTermPair = { fr: string; en: string };

export const INSPECTION_TERM_GLOSSARY: InspectionTermPair[] = [
  { fr: "revêtement de toiture", en: "roof covering" },
  { fr: "revêtement toiture", en: "roof covering" },
  { fr: "entretoit", en: "attic" },
  { fr: "combles", en: "attic space" },
  { fr: "fondation", en: "foundation" },
  { fr: "infiltration d'eau", en: "water infiltration" },
  { fr: "infiltration d'eau", en: "water infiltration" },
  { fr: "humidité relative", en: "relative humidity" },
  { fr: "humidité", en: "moisture" },
  { fr: "moisissure", en: "mold" },
  { fr: "charpente", en: "framing" },
  { fr: "solive", en: "joist" },
  { fr: "poutre", en: "beam" },
  { fr: "membrane", en: "membrane" },
  { fr: "solage", en: "sill plate" },
  { fr: "vide sanitaire", en: "crawl space" },
  { fr: "sous-sol", en: "basement" },
  { fr: "toiture", en: "roof" },
  { fr: "gouttière", en: "gutter" },
  { fr: "bardeaux", en: "shingles" },
  { fr: "fenêtre", en: "window" },
  { fr: "portes", en: "doors" },
  { fr: "porte", en: "door" },
  { fr: "façade", en: "exterior wall" },
  { fr: "revêtement extérieur", en: "exterior cladding" },
  { fr: "isolation", en: "insulation" },
  { fr: "ventilation", en: "ventilation" },
  { fr: "chauffage", en: "heating" },
  { fr: "plomberie", en: "plumbing" },
  { fr: "électricité", en: "electrical" },
  { fr: "installation électrique", en: "electrical system" },
  { fr: "panneau électrique", en: "electrical panel" },
  { fr: "fissure", en: "crack" },
  { fr: "fissuration", en: "cracking" },
  { fr: "dégradation", en: "deterioration" },
  { fr: "usure", en: "wear" },
  { fr: "recommandation", en: "recommendation" },
  { fr: "observation", en: "observation" },
  { fr: "limitation", en: "limitation" },
  { fr: "inspection visuelle", en: "visual inspection" },
  { fr: "non invasive", en: "non-invasive" },
  { fr: "entrepreneur qualifié", en: "qualified contractor" },
  { fr: "spécialiste qualifié", en: "qualified specialist" },
  { fr: "gravité", en: "severity" },
  { fr: "sécurité", en: "safety" },
  { fr: "entretien", en: "maintenance" },
  { fr: "surveillance", en: "monitoring" },
  { fr: "évaluation complémentaire", en: "further evaluation" },
  { fr: "travaux correctifs", en: "corrective work" },
  { fr: "Note terrain", en: "Field note" },
  { fr: "Faible", en: "Low" },
  { fr: "Moyenne", en: "Medium" },
  { fr: "Élevée", en: "High" },
  { fr: "Elevee", en: "High" },
  { fr: "À surveiller", en: "Monitor" },
  { fr: "À corriger", en: "To correct" },
  { fr: "Important", en: "Important" },
];

/** Longest phrases first — avoids partial replacements on substrings. */
export function sortedInspectionTerms(): InspectionTermPair[] {
  return [...INSPECTION_TERM_GLOSSARY].sort(
    (a, b) => Math.max(b.fr.length, b.en.length) - Math.max(a.fr.length, a.en.length),
  );
}
