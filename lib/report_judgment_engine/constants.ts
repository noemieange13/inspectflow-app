export const REPORT_JUDGMENT_VERSION = "2027.1";

/** Confiance minimale pour inclure un constat (sauf sécurité). */
export const MIN_CONFIDENCE_FOR_REPORT = 0.45;

export const AESTHETIC_ONLY_PATTERN =
  /\b(esth[ée]tique|cosm[ée]tique|cosmetic|peinture écaillée sans|surface only|apparence seulement|minor cosmetic)\b/i;

export const NORMAL_WEAR_PATTERN =
  /\b(usure normale|normal wear|vieillissement normal|typical aging|entretien courant suffisant)\b/i;

export const KEEP_SYSTEMS = new Set([
  "structure",
  "electricite",
  "plomberie",
  "toiture",
  "ventilation",
  "chauffage",
]);

export const ACTIVE_DEFECT_PATTERN =
  /\b(infiltr|fuite|leak|non fonctionnel|not working|inoperable|d[ée]faillant|failed|risque|safety|s[ée]curit|structural|fissure|crack)\b/i;

export const NON_FUNCTIONAL_PATTERN =
  /\b(non fonctionnel|inoperable|not working|ne fonctionne pas|out of service|hors service)\b/i;
