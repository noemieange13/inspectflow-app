export {
  INSPECTION_KNOWLEDGE_BASE_VERSION,
  KNOWN_REFERENCE_CATALOG,
  KNOWN_REFERENCE_IDS,
} from "./constants";

export type {
  ApplicableReference,
  InspectionKnowledgeContext,
  InspectionKnowledgeInput,
  InspectionKnowledgeResult,
  InspectionKnowledgeUrgency,
  KnownReferenceId,
} from "./types";

export {
  buildKnowledgeContextFromDraft,
  filterUnknownReferences,
  isKnownReferenceId,
  normalizeKnowledgeProvince,
  resolveApplicableReferences,
  resolveNormBody,
  sectionForSystem,
} from "./references";

export {
  evaluateInspectionKnowledge,
  stableKnowledgeSnapshot,
} from "./evaluate";
