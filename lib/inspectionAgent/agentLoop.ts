/**
 * Boucle agent (state machine) — référence produit alignée sur la spec « observe → décide → agit ».
 * L’implémentation serveur actuelle : `collectInspectionAgentObservation` + `decideInspectionAgentActions`
 * + exécution bornée dans `runInspectionAgent` (HTML/PDF). Les étapes « generate_section » / « apply_fix »
 * restent côté UI ou pipelines métier ; le LLM ne fait qu’émettre des suggestions.
 */

import type { AgentState } from "./types";

export type AgentLoopContext = {
  state: AgentState;
  enoughData: boolean;
  qcValid: boolean;
};

/**
 * Transition synchrone documentée (pas d’effets I/O ici).
 * Pour une exécution réelle, enchaîner les handlers métier après chaque transition.
 */
export function nextAgentState(ctx: AgentLoopContext): AgentState | "DONE" {
  switch (ctx.state) {
    case "COLLECTING":
      return ctx.enoughData ? "ANALYZING" : "COLLECTING";
    case "ANALYZING":
      return "GENERATING";
    case "GENERATING":
      return "QC_CHECK";
    case "QC_CHECK":
      return ctx.qcValid ? "FINALIZING" : "FIXING";
    case "FIXING":
      return "QC_CHECK";
    case "FINALIZING":
      return "DONE";
    case "DONE":
      return "DONE";
    default:
      return ctx.state;
  }
}
