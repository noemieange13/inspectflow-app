import { createServiceRoleClient } from "@/lib/supabaseServer";
import { ensureReportPayloadHtml } from "@/lib/ensureReportPayloadHtml";
import { invokeReportsPdf } from "@/lib/triggerInspectionUltimate";

import { runInspectionAgentDeciderLlm } from "./decideLlm";
import { collectInspectionAgentObservation } from "./collectContext";
import { decideInspectionAgentActions } from "./decideActions";
import { persistBuildingSummaryV1 } from "./persistBuildingSummary";
import type {
  AgentAction,
  AgentAutonomyLevel,
  AgentExecutionStep,
  InspectionAgentRunResult,
} from "./types";

export async function runInspectionAgent(input: {
  reportId: string;
  autonomy: AgentAutonomyLevel;
  /** Si false, observe + décide seulement (mode assist / prévisualisation). */
  execute: boolean;
  /** Enrichit les suggestions avec OpenAI (aucune exécution directe des sorties modèle). */
  useLlm?: boolean;
}): Promise<InspectionAgentRunResult> {
  const supabase = await createServiceRoleClient();
  const { data: report, error } = await supabase
    .from("reports")
    .select("id, payload")
    .eq("id", input.reportId.trim())
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }
  if (!report) {
    throw new Error("Rapport introuvable");
  }

  const payload = (report.payload ?? {}) as Record<string, unknown>;
  const observation = await collectInspectionAgentObservation(
    supabase,
    report.id,
    payload,
  );

  const persist = await persistBuildingSummaryV1(supabase, report.id, {
    score: observation.building_market.score,
    label_fr: observation.building_market.label_fr,
    label_en: observation.building_market.label_en,
    estimated_cost_cad: observation.building_market.estimated_cost_cad,
    intrinsic_high_risk: observation.building_market.flags.intrinsic_high_risk,
    score_below_60: observation.building_market.flags.score_below_60,
    review_recommended: observation.building_market.flags.review_recommended,
    summary: {
      score: observation.building_market.score,
      label_fr: observation.building_market.label_fr,
      estimated_cost_cad: observation.building_market.estimated_cost_cad,
    },
    focus_systems: [...observation.building_market.focus_systems],
    breakdown: observation.building_market.breakdown as Record<string, number>,
    agent_state: observation.agent_state,
    updated_at: new Date().toISOString(),
  });
  if (!persist.ok) {
    console.warn("persistBuildingSummaryV1:", persist.error);
  }

  let decisions = decideInspectionAgentActions(observation, input.autonomy);

  if (input.useLlm) {
    const llmCtx = {
      report_id: observation.report_id,
      report_language:
        payload.language === "en" || payload.lang === "en" ? "en" : "fr",
      agent_state: observation.agent_state,
      autonomy: input.autonomy,
      pdf_readiness_ok: observation.pdf_readiness_ok,
      pdf_gate: observation.pdf_gate,
      missing_qc_systems: observation.missing_qc_systems,
      photo_count: observation.photo_count,
      building_market: observation.building_market,
      building_index_v1: observation.building_index_v1,
      plan_steps: observation.plan_steps,
    };
    const plan = await runInspectionAgentDeciderLlm(llmCtx);
    if (plan?.notes.length) {
      const extra: AgentAction[] = plan.notes.map((note) => ({
        type: "suggest_followup" as const,
        message: `🤖 (${Math.round(plan.confidence * 100)}%) ${note}`,
      }));
      decisions = [...decisions, ...extra];
    }
  }
  const executed_steps: AgentExecutionStep[] = [];

  if (!input.execute) {
    return {
      autonomy: input.autonomy,
      executed: false,
      observation,
      decisions,
      executed_steps,
    };
  }

  for (const action of decisions) {
    const step = await executeOneAction(report.id, action);
    executed_steps.push(step);
    if (!step.ok && action.type !== "noop" && action.type !== "suggest_followup") {
      break;
    }
  }

  return {
    autonomy: input.autonomy,
    executed: true,
    observation,
    decisions,
    executed_steps,
  };
}

async function executeOneAction(
  reportId: string,
  action: AgentAction,
): Promise<AgentExecutionStep> {
  switch (action.type) {
    case "ensure_html": {
      const ensured = await ensureReportPayloadHtml(reportId);
      if (!ensured.ok) {
        return {
          action: "ensure_html",
          ok: false,
          detail: ensured.error,
        };
      }
      return {
        action: "ensure_html",
        ok: true,
        detail: `HTML généré (${ensured.builtHtml.length} caractères).`,
      };
    }
    case "prepare_pdf": {
      const ensured = await ensureReportPayloadHtml(reportId);
      if (!ensured.ok) {
        return {
          action: "prepare_pdf",
          ok: false,
          detail: ensured.error,
        };
      }
      const res = await invokeReportsPdf(reportId, { htmlForPdf: ensured.builtHtml });
      const text = await res.text();
      if (!res.ok) {
        return {
          action: "prepare_pdf",
          ok: false,
          detail: text.slice(0, 800),
        };
      }
      return {
        action: "prepare_pdf",
        ok: true,
        detail: text.slice(0, 400),
      };
    }
    case "request_user_input":
      return {
        action: "request_user_input",
        ok: false,
        detail: action.message,
      };
    case "suggest_followup":
      return {
        action: "suggest_followup",
        ok: true,
        detail: action.message,
      };
    case "noop":
      return { action: "noop", ok: true, detail: action.detail };
  }
}
