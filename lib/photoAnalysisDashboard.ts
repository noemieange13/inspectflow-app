import type { InspectionPhotoProgress } from "@/lib/inspectionPhotoProgress";

export type PhotoAnalysisDashboardState = "in_progress" | "complete" | "action_required";

/** État agrégé affiché dans le panneau analyse (priorité : en cours > action > terminée). */
export function derivePhotoAnalysisDashboardState(
  analysis: InspectionPhotoProgress["analysis"],
): PhotoAnalysisDashboardState {
  if (analysis.pending + analysis.processing > 0) return "in_progress";
  if (analysis.failed > 0) return "action_required";
  return "complete";
}

export function photoAnalysisDashboardStateLabel(
  state: PhotoAnalysisDashboardState,
  language: "fr" | "en",
): string {
  if (language === "en") {
    if (state === "in_progress") return "Analysis in progress";
    if (state === "action_required") return "Action required";
    return "Analysis complete";
  }
  if (state === "in_progress") return "Analyse en cours";
  if (state === "action_required") return "Action requise";
  return "Analyse terminée";
}
