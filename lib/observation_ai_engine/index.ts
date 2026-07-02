export {
  OBSERVATION_AI_ENGINE_MODEL,
  OBSERVATION_AI_ENGINE_PROMPT_VERSION,
  OBSERVATION_AI_NOTE_MARKER,
} from "./constants";

export type {
  AIObservationDraft,
  AIObservationTraceability,
  InspectionObservationContext,
  ObservationEngineInput,
  ObservationEnginePhotoInput,
  ObservationEngineResult,
  ObservationSeverityClass,
} from "./types";

export {
  classifyObservationSeverity,
  extractPhotoAnomalySignal,
  type PhotoAnomalySignal,
} from "./analyzePhoto";

export {
  generateObservationDrafts,
  photosToEngineInput,
} from "./generateDrafts";

export {
  identifyInspectorLockedEntryIds,
  isAiGeneratedEntryNote,
  mergeObservationDraftsOnRerun,
} from "./mergeDrafts";

export {
  aiObservationDraftToReportEntry,
  aiObservationDraftsToReportEntries,
} from "./adaptToReportEntry";

export {
  normativeReferencesForDraft,
  normalizeProvinceCode,
  resolveNormativeBody,
  systemCoversZone,
  zoneToSystemComponent,
} from "./normativeContext";
