/**
 * Événements produit côté client — écouter via :
 * `window.addEventListener("inspectflow:telemetry", (e) => …)`.
 * Aucune dépendance analytics : branchement Posthog / autre au choix.
 *
 * Funnel PDF (ex.) : `pdf_generate_blocked` → résolution readiness →
 * `pdf_generate_success` (+ timing + `total_steps_resolved`).
 * Photos : `photos_bulk_upload_*` (+ `duration_ms`, `avg_time_per_file`, `photos_bulk_upload_failed`).
 * Limitations : `limitations_auto_generated`, `limitations_modified`.
 * QC 2027 : `qc_certification_checked`, `qc_certification_failed`, `qc_certification_fix_clicked`
 * (+ `report_id`, `ruleset_id` quand disponibles).
 * QC Copilot IA V3 : `qc_ai_suggestion_shown`, `qc_ai_suggestion_applied`, `qc_ai_suggestion_rejected`.
 * Persistance optionnelle Supabase (`qc_events`) via `emitQcTelemetry` + file hors-ligne (`lib/qcTelemetry.ts`).
 */
export function emitProductEvent(
  name: string,
  detail?: Record<string, unknown>,
): void {
  if (typeof window === "undefined") return;
  try {
    window.dispatchEvent(
      new CustomEvent("inspectflow:telemetry", {
        detail: { name, t: Date.now(), ...detail },
      }),
    );
  } catch {
    /* ignore */
  }
}
