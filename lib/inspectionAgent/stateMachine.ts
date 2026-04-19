import type { AgentState, InspectionAgentObservation } from "./types";

/**
 * État dérivé (lecture seule) pour l’UI et le prompt décideur — pas une persistance de workflow.
 */
export function deriveAgentState(obs: InspectionAgentObservation): AgentState {
  if (obs.photo_count < 1 && obs.missing_qc_systems.length >= 2) {
    return "COLLECTING";
  }
  if (obs.missing_qc_systems.length > 0) {
    return "GENERATING";
  }
  if (!obs.pdf_readiness_ok) {
    return "FIXING";
  }
  if (obs.building_market.flags.review_recommended) {
    return "QC_CHECK";
  }
  return "FINALIZING";
}
