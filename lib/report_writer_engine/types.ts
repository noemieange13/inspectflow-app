import type { AIObservationDraft, ObservationSeverityClass } from "@/lib/observation_ai_engine";
import type { InspectionKnowledgeResult } from "@/lib/inspection_knowledge_engine";
import type { InspectorReportStyleV1 } from "@/lib/inspectorReportStyle";

export type ReportWriterLanguage = "fr" | "en";

export type ReportWriterNormativeContext = {
  province: string;
  norme?: string;
  building_type?: string;
  construction_year?: number | null;
  language: ReportWriterLanguage;
  /** Phase 8Q — style inspecteur (vocabulaire, détail, ton). */
  inspector_style?: InspectorReportStyleV1;
};

export type ReportWriterInput = {
  draft: AIObservationDraft;
  normative_context: ReportWriterNormativeContext;
  /** Expertise métier 3C — enrichit recommandation / références. */
  knowledge?: InspectionKnowledgeResult;
};

export type ProfessionalObservationConfidence = "low" | "medium" | "high";

export type ProfessionalObservationTraceability = {
  writer_model: string;
  prompt_version: string;
  generated_at: string;
  draft_id: string;
  inspector_style?: InspectorReportStyleV1;
};

export type ProfessionalObservationText = {
  observation: string;
  impact: string;
  recommendation: string;
  /** Limitation ponctuelle du constat (≠ bloc limitations couverture). */
  limitation: string | null;
  confidence_level: ProfessionalObservationConfidence;
  traceability: ProfessionalObservationTraceability;
};

export type FormattedProfessionalNote = {
  text: ProfessionalObservationText;
  /** Note structurée pour `ReportEntryInput.note`. */
  formatted_note: string;
};
