export {
  REPORT_WRITER_MODEL,
  REPORT_WRITER_PROMPT_VERSION,
  REPORT_WRITER_NOTE_MARKER,
  INVENTED_CAUSE_PATTERNS,
} from "./constants";

export type {
  FormattedProfessionalNote,
  ProfessionalObservationConfidence,
  ProfessionalObservationText,
  ProfessionalObservationTraceability,
  ReportWriterInput,
  ReportWriterLanguage,
  ReportWriterNormativeContext,
} from "./types";

export {
  adaptWrittenTextForInspectorStyle,
  applyDetailLevel,
  applyRecommendationStyle,
  applyTone,
  buildInspectorStyleWriterContext,
  type InspectorStyleWriterContext,
} from "./inspectorStyle";

export { sanitizeFactualObservation, containsInventedCause } from "./sanitize";

export {
  buildImpactText,
  buildRecommendationText,
  buildLimitationText,
  detectEntryNoteLanguage,
  isAlarmistPhrase,
  normalizeProvince,
  resolveWriterLanguage,
  systemLabel,
} from "./language";

export {
  writeProfessionalObservation,
  writeProfessionalObservations,
} from "./writeObservation";

export {
  inspectorEditedMachineNote,
  isMachineGeneratedEntryNote,
  isWriterGeneratedEntryNote,
  mergeProfessionalNoteWithExisting,
  shouldPreserveInspectorEntryNote,
} from "./protectInspector";
