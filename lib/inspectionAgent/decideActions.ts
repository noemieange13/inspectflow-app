import type { AgentAction, AgentAutonomyLevel, InspectionAgentObservation } from "./types";

function scoreBasedSuggestions(obs: InspectionAgentObservation): AgentAction[] {
  const out: AgentAction[] = [];
  const m = obs.building_market;

  if (m.flags.review_recommended) {
    out.push({
      type: "suggest_followup",
      message: `⚠️ Score décisionnel ${m.score}/100 (${m.label_fr}) — revue inspecteur recommandée avant engagement client.${
        m.flags.score_below_60 ? " (score < 60)" : ""
      }${m.flags.intrinsic_high_risk ? " (risque sécurité / déclaré)" : ""}`,
    });
  }

  if (m.breakdown.roof < 50) {
    out.push({
      type: "suggest_followup",
      message:
        "Priorité sécurité / étanchéité : toiture (sous-score < 50) — compléter constats, photos et recommandations.",
    });
  }

  if (m.breakdown.electrical < 50) {
    out.push({
      type: "suggest_followup",
      message:
        "Priorité sécurité : installation électrique (sous-score < 50) — vérifier gravité et preuves terrain.",
    });
  }

  if (m.estimated_cost_cad > 0) {
    const rounded = Math.round(m.estimated_cost_cad / 100) * 100;
    out.push({
      type: "suggest_followup",
      message: `Coût indicatif travaux (heuristique gravité) : ≈ ${rounded.toLocaleString("fr-CA")} $ CAD — non substitut à devis professionnel.`,
    });
  }

  return out;
}

/**
 * Décideur hybride (règles) — complété côté orchestration par le décideur LLM optionnel.
 * Priorités : sécurité (structure, électricité) → conformité → complétude → rédaction.
 */
export function decideInspectionAgentActions(
  obs: InspectionAgentObservation,
  autonomy: AgentAutonomyLevel,
): AgentAction[] {
  const out: AgentAction[] = [];

  if (!obs.pdf_readiness_ok) {
    out.push({
      type: "request_user_input",
      message:
        obs.pdf_readiness_error ??
        "Le rapport n’est pas prêt pour l’export PDF. Complétez la couverture et la grille QC.",
      gate: obs.pdf_gate,
    });
    out.push(...scoreBasedSuggestions(obs));
    if (obs.missing_qc_systems.length > 0) {
      out.push({
        type: "suggest_followup",
        message: `Sections systèmes à documenter : ${obs.missing_qc_systems.join(", ")}.`,
      });
    }
    return out;
  }

  out.push(...scoreBasedSuggestions(obs));

  if (autonomy === "assist") {
    out.push({
      type: "suggest_followup",
      message:
        "Prêt pour export — vous pouvez lancer la génération HTML/PDF depuis l’interface ou activer le mode semi-autonome.",
    });
    return out;
  }

  out.push({
    type: "ensure_html",
    reason: "Synchroniser le HTML serveur avant PDF (ensureReportPayloadHtml).",
  });

  if (autonomy === "full") {
    out.push({
      type: "prepare_pdf",
      reason: "Rapport certifié — invocation reports-pdf avec HTML frais.",
    });
  } else {
    out.push({
      type: "noop",
      detail:
        "Mode semi-autonome : HTML mis à jour ; PDF non lancé automatiquement (passez en mode autonome ou déclenchez le PDF manuellement).",
    });
  }

  return out;
}
