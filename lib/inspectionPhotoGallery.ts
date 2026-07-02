import type { ZoneCode } from "@/lib/reportNarrative";
import { inferLinkedZoneFromPhotoAnalysis } from "@/lib/inferLinkedZoneFromPhotoAnalysis";
import type { ReportPhotoTier } from "@/lib/reportPhotoSelection";

export type PhotoGalleryStatusFilter =
  | "all"
  | "not_analyzed"
  | "processing"
  | "failed"
  | "skipped_duplicates";

export type PhotoGalleryAssociationFilter = "all" | "linked" | "unlinked";

export type PhotoGalleryReportFilter = "all" | "in_pdf" | "excluded_pdf";

export type PhotoGalleryAiFilter = "all" | "with_anomaly" | "without_anomaly";

export type PhotoGallerySystemFilter =
  | ""
  | "toiture"
  | "exterieur"
  | "plomberie"
  | "electricite"
  | "chauffage"
  | "climatisation"
  | "interieur";

export type PhotoGalleryFilterState = {
  status: PhotoGalleryStatusFilter;
  association: PhotoGalleryAssociationFilter;
  report: PhotoGalleryReportFilter;
  ai: PhotoGalleryAiFilter;
  system: PhotoGallerySystemFilter;
};

export const DEFAULT_GALLERY_FILTERS: PhotoGalleryFilterState = {
  status: "all",
  association: "all",
  report: "all",
  ai: "all",
  system: "",
};

/** @deprecated Utiliser `PhotoGalleryFilterState` — conservé pour compat tests internes. */
export type PhotoGalleryFilter =
  | "all"
  | "not_analyzed"
  | "with_finding"
  | "without_finding"
  | "in_pdf"
  | "unused"
  | "duplicates";

/** @deprecated Utiliser `PhotoGallerySystemFilter`. */
export type PhotoGallerySearchPreset = "" | "electricity" | "roof" | "foundation" | "humidity";

export type InspectionPhotoGalleryItem = {
  id: string;
  name: string;
  url: string | null;
  uploading: boolean;
  error?: string;
  ai_score?: number;
  selected_for_report?: boolean;
  report_tier?: ReportPhotoTier;
  serverPhotoId?: string | null;
  observation_id?: string | null;
  linked_zone?: ZoneCode;
  analysis?: unknown;
  analysis_status?: string | null;
  duplicate_of_photo_id?: string | null;
};

export type PhotoGalleryBadge = "analyzed" | "linked_finding" | "report_selection" | "problem";

const SYSTEM_ZONE_GROUPS: Record<
  Exclude<PhotoGallerySystemFilter, "">,
  ZoneCode[]
> = {
  toiture: ["toiture", "grenier"],
  exterieur: ["exterieur", "facade", "garage"],
  plomberie: ["plomberie", "salle_de_bain"],
  electricite: ["installation_electrique"],
  interieur: ["salon", "cuisine", "salle_de_bain", "sous_sol", "grenier"],
  chauffage: [],
  climatisation: [],
};

const SEARCH_PRESET_ZONES: Record<
  Exclude<PhotoGallerySearchPreset, "">,
  ZoneCode[]
> = {
  electricity: ["installation_electrique"],
  roof: ["toiture", "grenier"],
  foundation: ["fondation", "sous_sol"],
  humidity: ["sous_sol", "fondation", "plomberie", "salle_de_bain", "facade"],
};

const HUMIDITY_PATTERN =
  /\b(humid|humidity|infiltr|moisiss|mold|eau|water|fuite|leak|condensation)\b/i;

function analysisRecord(analysis: unknown): Record<string, unknown> | null {
  if (!analysis || typeof analysis !== "object") return null;
  return analysis as Record<string, unknown>;
}

export function photoHasAnalysis(photo: InspectionPhotoGalleryItem): boolean {
  if (photo.analysis != null) return true;
  const s = photo.analysis_status;
  return s === "complete" || s === "skipped";
}

export function photoIsDuplicate(photo: InspectionPhotoGalleryItem): boolean {
  return typeof photo.duplicate_of_photo_id === "string" && photo.duplicate_of_photo_id.length > 0;
}

export function photoHasDetectedProblem(photo: InspectionPhotoGalleryItem): boolean {
  const a = analysisRecord(photo.analysis);
  if (!a) return false;
  const defects = a.defects_or_risks;
  if (Array.isArray(defects) && defects.some((d) => typeof d === "string" && d.trim())) {
    return true;
  }
  const severity = a.severity_hint;
  return severity === "medium" || severity === "high";
}

export function photoMatchesSearchPreset(
  photo: InspectionPhotoGalleryItem,
  preset: PhotoGallerySearchPreset,
): boolean {
  if (!preset) return true;

  const zones = SEARCH_PRESET_ZONES[preset];
  const linked = photo.linked_zone ?? inferLinkedZoneFromPhotoAnalysis(photo.analysis) ?? "autre";
  if (zones.includes(linked)) return true;

  const a = analysisRecord(photo.analysis);
  const textParts: string[] = [];
  if (a) {
    if (typeof a.summary === "string") textParts.push(a.summary);
    if (typeof a.suggested_inspector_note === "string") textParts.push(a.suggested_inspector_note);
    if (typeof a.suggested_building_zone === "string") textParts.push(a.suggested_building_zone);
    for (const key of ["observations", "defects_or_risks"] as const) {
      const arr = a[key];
      if (Array.isArray(arr)) {
        for (const item of arr) {
          if (typeof item === "string") textParts.push(item);
        }
      }
    }
  }
  const blob = textParts.join(" ").toLowerCase();

  if (preset === "electricity") {
    return /\b(electri|panneau|breaker|disjoncteur|compteur|wiring|cablage)\b/i.test(blob);
  }
  if (preset === "roof") {
    return /\b(toiture|roof|shingle|bardeau|comble|gutter|gouttiere)\b/i.test(blob);
  }
  if (preset === "foundation") {
    return /\b(fondation|foundation|semelle|footing|vide sanitaire|crawl)\b/i.test(blob);
  }
  if (preset === "humidity") {
    return HUMIDITY_PATTERN.test(blob) || zones.includes(linked);
  }
  return false;
}

export function photoIsSkippedDuplicate(photo: InspectionPhotoGalleryItem): boolean {
  return photo.analysis_status === "skipped" || photoIsDuplicate(photo);
}

export function photoIsLinkedToFinding(
  photo: InspectionPhotoGalleryItem,
  validObservationIds: Set<string>,
): boolean {
  return !!photo.observation_id && validObservationIds.has(photo.observation_id);
}

export function photoMatchesStatusFilter(
  photo: InspectionPhotoGalleryItem,
  status: PhotoGalleryStatusFilter,
): boolean {
  if (status === "all") return true;
  const s = photo.analysis_status;
  switch (status) {
    case "not_analyzed":
      return !photo.uploading && !photoHasAnalysis(photo);
    case "processing":
      return s === "processing" || s === "pending";
    case "failed":
      return s === "failed";
    case "skipped_duplicates":
      return photoIsSkippedDuplicate(photo);
    default:
      return true;
  }
}

export function photoMatchesAssociationFilter(
  photo: InspectionPhotoGalleryItem,
  association: PhotoGalleryAssociationFilter,
  validObservationIds: Set<string>,
): boolean {
  if (association === "all") return true;
  const linked = photoIsLinkedToFinding(photo, validObservationIds);
  return association === "linked" ? linked : !linked;
}

export function photoMatchesReportFilter(
  photo: InspectionPhotoGalleryItem,
  report: PhotoGalleryReportFilter,
  isSelectedForReport: (photo: InspectionPhotoGalleryItem) => boolean,
): boolean {
  if (report === "all") return true;
  const selected = isSelectedForReport(photo);
  return report === "in_pdf" ? selected : !selected;
}

export function photoMatchesAiFilter(
  photo: InspectionPhotoGalleryItem,
  ai: PhotoGalleryAiFilter,
): boolean {
  if (ai === "all") return true;
  const hasProblem = photoHasDetectedProblem(photo);
  return ai === "with_anomaly" ? hasProblem : !hasProblem;
}

function analysisTextBlob(photo: InspectionPhotoGalleryItem): string {
  const a = analysisRecord(photo.analysis);
  const textParts: string[] = [];
  if (a) {
    if (typeof a.summary === "string") textParts.push(a.summary);
    if (typeof a.suggested_inspector_note === "string") textParts.push(a.suggested_inspector_note);
    if (typeof a.suggested_building_zone === "string") textParts.push(a.suggested_building_zone);
    for (const key of ["observations", "defects_or_risks"] as const) {
      const arr = a[key];
      if (Array.isArray(arr)) {
        for (const item of arr) {
          if (typeof item === "string") textParts.push(item);
        }
      }
    }
  }
  return textParts.join(" ").toLowerCase();
}

export function photoMatchesSystemFilter(
  photo: InspectionPhotoGalleryItem,
  system: PhotoGallerySystemFilter,
): boolean {
  if (!system) return true;

  const zones = SYSTEM_ZONE_GROUPS[system];
  const linked = photo.linked_zone ?? inferLinkedZoneFromPhotoAnalysis(photo.analysis) ?? "autre";
  if (zones.length > 0 && zones.includes(linked)) return true;

  const blob = analysisTextBlob(photo);

  if (system === "electricite") {
    return (
      zones.includes(linked) ||
      /\b(electri|panneau|breaker|disjoncteur|compteur|wiring|cablage)\b/i.test(blob)
    );
  }
  if (system === "toiture") {
    return (
      zones.includes(linked) ||
      /\b(toiture|roof|shingle|bardeau|comble|gutter|gouttiere)\b/i.test(blob)
    );
  }
  if (system === "exterieur") {
    return (
      zones.includes(linked) ||
      /\b(exterieur|exterior|facade|gouttiere|gutter|terrasse|deck|balcon)\b/i.test(blob)
    );
  }
  if (system === "plomberie") {
    return (
      zones.includes(linked) ||
      /\b(plomberie|plumbing|tuyau|pipe|robinet|faucet|drain|egout)\b/i.test(blob) ||
      HUMIDITY_PATTERN.test(blob)
    );
  }
  if (system === "chauffage") {
    return /\b(chauffage|heating|fournaise|furnace|chaudiere|boiler|radiateur|radiator|thermopompe heat)\b/i.test(
      blob,
    );
  }
  if (system === "climatisation") {
    return /\b(climatisation|climatiseur|air condition|hvac|condenseur|compresseur|thermopompe|heat pump)\b/i.test(
      blob,
    );
  }
  if (system === "interieur") {
    return zones.includes(linked);
  }
  return false;
}

export function photoMatchesGalleryFilterState(
  photo: InspectionPhotoGalleryItem,
  filters: PhotoGalleryFilterState,
  opts: {
    validObservationIds: Set<string>;
    isSelectedForReport: (photo: InspectionPhotoGalleryItem) => boolean;
  },
): boolean {
  return (
    photoMatchesStatusFilter(photo, filters.status) &&
    photoMatchesAssociationFilter(photo, filters.association, opts.validObservationIds) &&
    photoMatchesReportFilter(photo, filters.report, opts.isSelectedForReport) &&
    photoMatchesAiFilter(photo, filters.ai) &&
    photoMatchesSystemFilter(photo, filters.system)
  );
}

export function filterInspectionPhotos(
  photos: InspectionPhotoGalleryItem[],
  opts: {
    filters?: PhotoGalleryFilterState;
    /** @deprecated Préférer `filters`. */
    filter?: PhotoGalleryFilter;
    /** @deprecated Préférer `filters.system`. */
    search?: PhotoGallerySearchPreset;
    validObservationIds: Set<string>;
    isSelectedForReport: (photo: InspectionPhotoGalleryItem) => boolean;
  },
): InspectionPhotoGalleryItem[] {
  const filters =
    opts.filters ??
    legacyFilterStateFromDeprecated(opts.filter ?? "all", opts.search ?? "");

  return photos.filter((photo) =>
    photoMatchesGalleryFilterState(photo, filters, opts),
  );
}

function legacyFilterStateFromDeprecated(
  filter: PhotoGalleryFilter,
  search: PhotoGallerySearchPreset,
): PhotoGalleryFilterState {
  const state: PhotoGalleryFilterState = { ...DEFAULT_GALLERY_FILTERS };
  switch (filter) {
    case "not_analyzed":
      state.status = "not_analyzed";
      break;
    case "duplicates":
      state.status = "skipped_duplicates";
      break;
    case "with_finding":
      state.association = "linked";
      break;
    case "without_finding":
      state.association = "unlinked";
      break;
    case "in_pdf":
      state.report = "in_pdf";
      break;
    case "unused":
      state.report = "excluded_pdf";
      break;
    default:
      break;
  }
  if (search === "electricity") state.system = "electricite";
  else if (search === "roof") state.system = "toiture";
  else if (search === "foundation") state.system = "interieur";
  else if (search === "humidity") state.system = "plomberie";
  return state;
}

/** @deprecated Utiliser `photoMatchesGalleryFilterState`. */
export function photoMatchesGalleryFilter(
  photo: InspectionPhotoGalleryItem,
  filter: PhotoGalleryFilter,
  opts: { validObservationIds: Set<string>; isSelectedForReport: (photo: InspectionPhotoGalleryItem) => boolean },
): boolean {
  return photoMatchesGalleryFilterState(
    photo,
    legacyFilterStateFromDeprecated(filter, ""),
    opts,
  );
}

export function computePhotoGalleryBadges(
  photo: InspectionPhotoGalleryItem,
  opts: {
    validObservationIds: Set<string>;
    isSelectedForReport: (photo: InspectionPhotoGalleryItem) => boolean;
  },
): PhotoGalleryBadge[] {
  const badges: PhotoGalleryBadge[] = [];
  if (photoHasAnalysis(photo)) badges.push("analyzed");
  if (photo.observation_id && opts.validObservationIds.has(photo.observation_id)) {
    badges.push("linked_finding");
  }
  if (opts.isSelectedForReport(photo)) badges.push("report_selection");
  if (photoHasDetectedProblem(photo)) badges.push("problem");
  return badges;
}

export const GALLERY_COLUMNS = 3;
/** Hauteur fixe par cellule (virtualisation). */
export const GALLERY_ROW_HEIGHT_PX = 228;
export const GALLERY_OVERSCAN_ROWS = 2;

export function galleryRowCount(photoCount: number, columns = GALLERY_COLUMNS): number {
  return Math.ceil(Math.max(0, photoCount) / columns);
}

export function galleryTotalHeightPx(photoCount: number, columns = GALLERY_COLUMNS): number {
  return galleryRowCount(photoCount, columns) * GALLERY_ROW_HEIGHT_PX;
}

export function galleryVisibleRowRange(
  scrollTop: number,
  viewportHeight: number,
  photoCount: number,
  columns = GALLERY_COLUMNS,
  overscanRows = GALLERY_OVERSCAN_ROWS,
): { startRow: number; endRow: number; startIndex: number; endIndex: number } {
  const rowCount = galleryRowCount(photoCount, columns);
  const startRow = Math.max(0, Math.floor(scrollTop / GALLERY_ROW_HEIGHT_PX) - overscanRows);
  const endRow = Math.min(
    rowCount,
    Math.ceil((scrollTop + viewportHeight) / GALLERY_ROW_HEIGHT_PX) + overscanRows,
  );
  return {
    startRow,
    endRow,
    startIndex: startRow * columns,
    endIndex: Math.min(photoCount, endRow * columns),
  };
}
