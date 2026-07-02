import type { ZoneCode } from "@/lib/reportNarrative";

export type ObservationSeverityClass =
  | "maintenance"
  | "attention"
  | "major"
  | "safety";

export type AIObservationTraceability = {
  ai_generated: true;
  model: string;
  prompt_version: string;
  created_at: string;
};

export type AIObservationDraft = {
  /** Identifiant stable du brouillon (regroupement). */
  draft_id: string;
  system: string;
  component: string;
  title: string;
  observation_text: string;
  recommendation: string;
  severity: ObservationSeverityClass;
  confidence_score: number;
  source_photo_ids: string[];
  reasoning_summary: string;
  /** Zones métier associées (preuve photo). */
  linked_zones: ZoneCode[];
  normative_references: string[];
  traceability: AIObservationTraceability;
};

export type ObservationEnginePhotoInput = {
  id: string;
  observation_id?: string | null;
  analysis?: unknown;
  linked_zone?: ZoneCode | string | null;
};

export type InspectionObservationContext = {
  province: string;
  norme?: string;
  building_type?: string;
  construction_year?: number | null;
  language: "fr" | "en";
};

export type ObservationEngineInput = {
  photos: ObservationEnginePhotoInput[];
  context: InspectionObservationContext;
  /** Constats existants — protection inspecteur + éviter doublons. */
  existing_entries?: Array<{
    id?: string;
    zone: string;
    issue?: string;
    severity?: string;
    note?: string;
  }>;
  /** Brouillons IA précédents (relance). */
  previous_ai_drafts?: AIObservationDraft[];
  /** IDs de constats verrouillés par l'inspecteur. */
  inspector_locked_entry_ids?: Set<string>;
};

export type ObservationEngineResult = {
  drafts: AIObservationDraft[];
  skipped_normal_photos: string[];
  grouped_photo_count: number;
};
