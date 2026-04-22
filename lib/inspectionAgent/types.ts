/**
 * Mode agent inspection : observe → décide → agit (borné) — branché sur le flux PDF existant.
 */

import type { BuildingScoreMarketResult } from "@/lib/buildingScoreMarket";

export type AgentState =
  | "COLLECTING"
  | "ANALYZING"
  | "GENERATING"
  | "QC_CHECK"
  | "FIXING"
  | "FINALIZING"
  | "DONE";

export type AgentAutonomyLevel = "assist" | "semi" | "full";

export type AgentActionType =
  | "ensure_html"
  | "prepare_pdf"
  | "request_user_input"
  | "suggest_followup"
  | "noop";

export type AgentAction =
  | { type: "ensure_html"; reason: string }
  | { type: "prepare_pdf"; reason: string }
  | { type: "request_user_input"; message: string; gate?: string }
  | { type: "suggest_followup"; message: string }
  | { type: "noop"; detail: string };

export type AgentExecutionStep = {
  action: AgentActionType;
  ok: boolean;
  detail?: string;
};

export type InspectionAgentObservation = {
  report_id: string;
  photo_count: number;
  qc_events_count: number;
  payload_keys: string[];
  missing_qc_systems: string[];
  pdf_readiness_ok: boolean;
  pdf_readiness_error?: string;
  pdf_gate?: string;
  building_index_v1: number;
  /** @deprecated Préférer `building_market.score` */
  building_score_v2: number;
  /** @deprecated Préférer `building_market.label_fr` */
  building_label_v2: string;
  building_market: BuildingScoreMarketResult;
  agent_state: AgentState;
  plan_steps: string[];
};

export type InspectionAgentRunResult = {
  autonomy: AgentAutonomyLevel;
  executed: boolean;
  observation: InspectionAgentObservation;
  decisions: AgentAction[];
  executed_steps: AgentExecutionStep[];
};
