/**
 * Ancre d’injection pour l’Edge `reports-pdf` : le bloc « Rapport IA minimal » remplace ce marqueur
 * lorsqu’il est présent (gabarit QC 2027 — sommaire exécutif), sinon insertion avant `</body>`.
 * Doit être identique à la chaîne dans `supabase/functions/reports-pdf/index.ts`.
 */
export const PDF_AI_NARRATIVE_ANCHOR = "<!-- inspectflow-ai-narrative-anchor -->";
