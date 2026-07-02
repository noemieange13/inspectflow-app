import type { ObservationSeverityClass } from "@/lib/observation_ai_engine";
import type { NormBody } from "@/lib/compliance/inspection-norms";

export type InspectionKnowledgeUrgency =
  | "routine"
  | "short_term"
  | "planned_correction"
  | "immediate";

export type InspectionKnowledgeContext = {
  province: string;
  norm_body: NormBody;
  norm_version?: string;
  building_age?: number | null;
  system: string;
  component: string;
  severity: ObservationSeverityClass;
  language?: "fr" | "en";
};

export type KnownReferenceId = string;

export type ApplicableReference = {
  id: KnownReferenceId;
  label: string;
  source_url: string;
};

export type InspectionKnowledgeResult = {
  recommended_action: string;
  specialist_required: boolean;
  urgency_level: InspectionKnowledgeUrgency;
  inspection_limitations: string[];
  applicable_references: ApplicableReference[];
  confidence: number;
  knowledge_base_version: string;
  evaluated_at: string;
};

export type InspectionKnowledgeInput = {
  /** Contexte explicite ou dérivé du brouillon 3A. */
  context: InspectionKnowledgeContext;
  draft_reference_hints?: string[];
  draft_confidence?: number;
};
