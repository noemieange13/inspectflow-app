export type {
  ComponentCheckResult,
  InspectFlowReportInput,
  LegacyPhotoMapping,
  LegacySteveReportInput,
  LockedClauseCheck,
  PhotoMappingResult,
  SteveReportScore,
  StructureCheckResult,
  ValidationStatus,
} from "@/lib/reportComparison/types";

export {
  compareSteveReports,
  DEFAULT_LEGACY_PHOTO_MAPPINGS,
  STEVE_PRODUCTION_THRESHOLD,
  steveSystemOrderLabels,
} from "@/lib/reportComparison/steveReportComparator";
