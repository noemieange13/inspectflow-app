/**
 * Pilot #0.17 — Quebec inspection handwriting dictionary (Steve field sheets).
 */

export const QUEBEC_ADDRESS_TERMS = [
  "Rue",
  "Chemin",
  "Ch.",
  "Boulevard",
  "Avenue",
  "Route",
  "Rang",
] as const;

export const QUEBEC_CITIES = [
  "Gatineau",
  "Cantley",
  "Chelsea",
  "Mont-Laurier",
  "Val-des-Monts",
  "Ottawa",
] as const;

export const QUEBEC_POSTAL_PREFIXES = ["J9", "J8", "K1", "J0", "G1", "H1"] as const;

export const BUILDING_TERMS = [
  "Bardeaux",
  "Tôle",
  "Fondation",
  "Béton",
  "Panneau électrique",
  "Chauffe-eau",
  "Fournaise",
  "Thermopompe",
  "Garage",
  "Sous-sol",
  "Plain-pied",
] as const;

export type OcrCorrectionRule = {
  pattern: RegExp;
  replacement: string;
  reason: string;
  capture?: string;
};

/** Token-level OCR corrections — conservative, dictionary-backed only. */
export const OCR_CORRECTION_RULES: OcrCorrectionRule[] = [
  { pattern: /\bRut\b/gi, replacement: "Rue", reason: "quebec_address_dictionary", capture: "Rut" },
  { pattern: /\bRu\b/g, replacement: "Rue", reason: "quebec_address_dictionary", capture: "Ru" },
  { pattern: /\bdada\b/gi, replacement: "de la", reason: "quebec_address_dictionary", capture: "dada" },
  { pattern: /\bdela\b/gi, replacement: "de la", reason: "quebec_address_dictionary", capture: "dela" },
  { pattern: /\bdea\s+Reine\b/gi, replacement: "de la Reine", reason: "quebec_address_dictionary", capture: "dea Reine" },
  { pattern: /\bReine\s+dea\b/gi, replacement: "Reine des", reason: "quebec_address_dictionary", capture: "Reine dea" },
  { pattern: /\bdea\s+Pui\b/gi, replacement: "des Prés", reason: "quebec_address_dictionary", capture: "dea Pui" },
  { pattern: /\bdea\b(?!\s+(?:Pui|Reine))/gi, replacement: "des", reason: "quebec_address_dictionary", capture: "dea" },
  { pattern: /\bPui\b/g, replacement: "Prés", reason: "quebec_address_dictionary", capture: "Pui" },
  { pattern: /\bPres\b/g, replacement: "Prés", reason: "quebec_address_dictionary", capture: "Pres" },
  { pattern: /\bdal\s+owt3\b/gi, replacement: "J9L 0H3", reason: "quebec_postal_dictionary", capture: "dal owt3" },
  { pattern: /\bowt3\b/gi, replacement: "0H3", reason: "quebec_postal_dictionary", capture: "owt3" },
  { pattern: /\bdal\b/gi, replacement: "J9L", reason: "quebec_postal_dictionary", capture: "dal" },
  { pattern: /\bCha\b/g, replacement: "Ch.", reason: "quebec_address_dictionary", capture: "Cha" },
  { pattern: /\bTole\b/g, replacement: "Tôle", reason: "quebec_building_dictionary", capture: "Tole" },
  { pattern: /\btole\b/g, replacement: "tôle", reason: "quebec_building_dictionary", capture: "tole" },
  { pattern: /\bTote\b/g, replacement: "Tôle", reason: "quebec_building_dictionary", capture: "Tote" },
  { pattern: /\bM-O\b/g, replacement: "N-O", reason: "quebec_orientation_dictionary", capture: "M-O" },
  { pattern: /Reine,\s*des\s+Pr[eé]s/gi, replacement: "Reine des Prés", reason: "quebec_address_dictionary", capture: "Reine, des Prés" },
  { pattern: /\s+-\s+(?=J9)/g, replacement: ", ", reason: "quebec_address_dictionary" },
  { pattern: /\bVPS\s+SEES\b/gi, replacement: "", reason: "ocr_noise_removal", capture: "VPS SEES" },
];

export const INSPECTION_VOCABULARY_REJECT = [
  /^inspect/i,
  /^check/i,
  /^rapport/i,
  /^toiture/i,
  /^adresse/i,
  /^construction/i,
  /^courtier\s+immobilier/i,
  /^panneau/i,
  /^d[eé]claration/i,
];

export function findKnownCity(text: string): string | null {
  const lower = text.toLowerCase();
  for (const city of QUEBEC_CITIES) {
    if (lower.includes(city.toLowerCase())) return city;
  }
  return null;
}

export function suggestsMontLaurierAddress(text: string): boolean {
  return /reine des pr[eé]s/i.test(text);
}
