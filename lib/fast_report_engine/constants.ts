/** Seuil haute confiance — fraction 0–1 ou entier 0–100 accepté en entrée note. */
export const HIGH_CONFIDENCE_THRESHOLD = 0.85;

export const HIGH_CONFIDENCE_PERCENT = 85;

/** Objectif produit : rapport fiable en moins de 5 minutes. */
export const FAST_REPORT_TIME_TARGET_SECONDS = 5 * 60;

export const FAST_REPORT_ENGINE_VERSION = "fast-report-v1";

export const FAST_REPORT_STEP_IDS = {
  verify: "verify",
  photos: "photos",
  pdf_create: "pdf_create",
  finalize: "finalize",
} as const;
