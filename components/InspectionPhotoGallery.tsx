"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";

import {
  computePhotoGalleryBadges,
  DEFAULT_GALLERY_FILTERS,
  filterInspectionPhotos,
  galleryTotalHeightPx,
  galleryVisibleRowRange,
  GALLERY_COLUMNS,
  GALLERY_ROW_HEIGHT_PX,
  type InspectionPhotoGalleryItem,
  type PhotoGalleryAiFilter,
  type PhotoGalleryAssociationFilter,
  type PhotoGalleryFilterState,
  type PhotoGalleryReportFilter,
  type PhotoGalleryStatusFilter,
  type PhotoGallerySystemFilter,
} from "@/lib/inspectionPhotoGallery";
import type { ReportPhotoTier } from "@/lib/reportPhotoSelection";
import type { ReportEntryInput, ReportLanguage } from "@/lib/reportNarrative";
import { isObservationId, observationEntryLabel } from "@/lib/observationIds";

type Props = {
  language: ReportLanguage;
  photos: InspectionPhotoGalleryItem[];
  entries: ReportEntryInput[];
  validObservationIds: Set<string>;
  photoSelectionReasonsByKey: Record<string, { fr: string; en: string }>;
  isSelectedForReport: (photo: InspectionPhotoGalleryItem) => boolean;
  onObservationChange: (photoId: string, observationId: string | null) => void;
  onToggleReportSelection: (photoId: string) => void;
  onTierChange: (photoId: string, tier: Exclude<ReportPhotoTier, "excluded">) => void;
};

const STATUS_OPTIONS: Array<{ id: PhotoGalleryStatusFilter; fr: string; en: string }> = [
  { id: "all", fr: "Toutes", en: "All" },
  { id: "not_analyzed", fr: "Non analysées", en: "Not analyzed" },
  { id: "processing", fr: "Analyse en cours", en: "Analysis in progress" },
  { id: "failed", fr: "Erreur analyse", en: "Analysis error" },
  { id: "skipped_duplicates", fr: "Doublons ignorés", en: "Skipped duplicates" },
];

const ASSOCIATION_OPTIONS: Array<{ id: PhotoGalleryAssociationFilter; fr: string; en: string }> = [
  { id: "all", fr: "Toutes", en: "All" },
  { id: "linked", fr: "Liées à un constat", en: "Linked to finding" },
  { id: "unlinked", fr: "Non liées", en: "Unlinked" },
];

const REPORT_OPTIONS: Array<{ id: PhotoGalleryReportFilter; fr: string; en: string }> = [
  { id: "all", fr: "Toutes", en: "All" },
  { id: "in_pdf", fr: "Incluses PDF", en: "Included in PDF" },
  { id: "excluded_pdf", fr: "Exclues PDF", en: "Excluded from PDF" },
];

const AI_OPTIONS: Array<{ id: PhotoGalleryAiFilter; fr: string; en: string }> = [
  { id: "all", fr: "Toutes", en: "All" },
  { id: "with_anomaly", fr: "Avec anomalies", en: "With anomalies" },
  { id: "without_anomaly", fr: "Sans anomalie", en: "No anomaly" },
];

const SYSTEM_OPTIONS: Array<{ id: PhotoGallerySystemFilter; fr: string; en: string }> = [
  { id: "", fr: "Tous systèmes", en: "All systems" },
  { id: "toiture", fr: "Toiture", en: "Roof" },
  { id: "exterieur", fr: "Extérieur", en: "Exterior" },
  { id: "plomberie", fr: "Plomberie", en: "Plumbing" },
  { id: "electricite", fr: "Électricité", en: "Electrical" },
  { id: "chauffage", fr: "Chauffage", en: "Heating" },
  { id: "climatisation", fr: "Climatisation", en: "HVAC" },
  { id: "interieur", fr: "Intérieur", en: "Interior" },
];

function selectClassName() {
  return "rounded border border-slate-200 bg-white px-2 py-1 text-[11px] text-slate-800";
}

function badgeLabel(badge: ReturnType<typeof computePhotoGalleryBadges>[number], language: ReportLanguage): string {
  if (language === "en") {
    switch (badge) {
      case "analyzed":
        return "Analyzed";
      case "linked_finding":
        return "Linked";
      case "report_selection":
        return "In report";
      case "problem":
        return "Issue";
    }
  }
  switch (badge) {
    case "analyzed":
      return "Analysée";
    case "linked_finding":
      return "Liée";
    case "report_selection":
      return "Rapport";
    case "problem":
      return "Problème";
  }
}

function badgeIcon(badge: ReturnType<typeof computePhotoGalleryBadges>[number]): string {
  switch (badge) {
    case "analyzed":
      return "✓";
    case "linked_finding":
      return "🔗";
    case "report_selection":
      return "⭐";
    case "problem":
      return "⚠";
  }
}

export default function InspectionPhotoGallery({
  language,
  photos,
  entries,
  validObservationIds,
  photoSelectionReasonsByKey,
  isSelectedForReport,
  onObservationChange,
  onToggleReportSelection,
  onTierChange,
}: Props) {
  const [filters, setFilters] = useState<PhotoGalleryFilterState>(DEFAULT_GALLERY_FILTERS);
  const scrollRef = useRef<HTMLDivElement>(null);
  const [scrollTop, setScrollTop] = useState(0);
  const [viewportHeight, setViewportHeight] = useState(420);

  const patchFilter = useCallback(
    <K extends keyof PhotoGalleryFilterState>(key: K, value: PhotoGalleryFilterState[K]) => {
      setFilters((prev) => ({ ...prev, [key]: value }));
      const el = scrollRef.current;
      if (el) el.scrollTop = 0;
      setScrollTop(0);
    },
    [],
  );

  const filterOpts = useMemo(
    () => ({
      filters,
      validObservationIds,
      isSelectedForReport,
    }),
    [filters, validObservationIds, isSelectedForReport],
  );

  const filteredPhotos = useMemo(
    () => filterInspectionPhotos(photos, filterOpts),
    [photos, filterOpts],
  );

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => {
      setViewportHeight(el.clientHeight);
    });
    ro.observe(el);
    setViewportHeight(el.clientHeight);
    return () => ro.disconnect();
  }, []);

  const onScroll = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    setScrollTop(el.scrollTop);
  }, []);

  const { startRow, endRow } = galleryVisibleRowRange(
    scrollTop,
    viewportHeight,
    filteredPhotos.length,
  );
  const visibleCells: InspectionPhotoGalleryItem[] = [];
  for (let row = startRow; row < endRow; row += 1) {
    for (let col = 0; col < GALLERY_COLUMNS; col += 1) {
      const idx = row * GALLERY_COLUMNS + col;
      if (idx >= filteredPhotos.length) break;
      visibleCells.push(filteredPhotos[idx]!);
    }
  }
  const totalHeight = galleryTotalHeightPx(filteredPhotos.length);
  const offsetY = startRow * GALLERY_ROW_HEIGHT_PX;

  const renderCell = (photo: InspectionPhotoGalleryItem): ReactNode => {
    const photoRowKeyForReason = (photo.serverPhotoId?.trim() || photo.id).trim();
    const photoSelectionReason = photoSelectionReasonsByKey[photoRowKeyForReason];
    const selectedForReport = isSelectedForReport(photo);
    const currentTier: Exclude<ReportPhotoTier, "excluded"> =
      photo.report_tier === "critical" ? "critical" : "support";
    const badges = computePhotoGalleryBadges(photo, {
      validObservationIds,
      isSelectedForReport,
    });

    return (
      <div
        key={photo.id}
        className="rounded-md border border-slate-200 p-1.5 text-center"
        style={{ height: GALLERY_ROW_HEIGHT_PX - 8 }}
      >
        <div className="mb-1 flex flex-wrap justify-center gap-0.5">
          {badges.map((b) => (
            <span
              key={b}
              title={badgeLabel(b, language)}
              className={`inline-flex items-center rounded px-1 py-0.5 text-[9px] font-medium leading-none ${
                b === "problem"
                  ? "bg-amber-100 text-amber-900"
                  : b === "report_selection"
                    ? "bg-violet-100 text-violet-900"
                    : b === "linked_finding"
                      ? "bg-blue-100 text-blue-900"
                      : "bg-emerald-100 text-emerald-900"
              }`}
            >
              {badgeIcon(b)}
            </span>
          ))}
        </div>
        {photo.url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={photo.url} alt={photo.name} className="h-20 w-full rounded object-cover" loading="lazy" />
        ) : photo.uploading ? (
          <div className="flex h-20 items-center justify-center rounded bg-slate-100">
            <span className="text-xs text-slate-400">…</span>
          </div>
        ) : (
          <div className="flex h-20 items-center justify-center rounded bg-red-50">
            <span className="text-xs text-red-500">{language === "en" ? "Error" : "Erreur"}</span>
          </div>
        )}
        <p className="mt-1 truncate text-xs text-slate-500">{photo.name}</p>
        {photo.url && !photo.uploading ? (
          <label className="mt-1 block text-left">
            <span className="sr-only">{language === "en" ? "Finding" : "Constat"}</span>
            <select
              className="mt-0.5 w-full rounded border border-slate-200 px-1 py-0.5 text-[10px] text-slate-800"
              value={photo.observation_id ?? ""}
              onChange={(e) => {
                const v = e.target.value.trim();
                onObservationChange(photo.id, v && isObservationId(v) ? v : null);
              }}
            >
              <option value="">{language === "en" ? "— no finding —" : "— aucun constat —"}</option>
              {entries.map((entry) =>
                entry.id ? (
                  <option key={entry.id} value={entry.id}>
                    {observationEntryLabel(entry, language)}
                  </option>
                ) : null,
              )}
            </select>
          </label>
        ) : null}
        {photo.ai_score != null && !photo.error ? (
          <p className="text-[10px] font-medium text-violet-800">
            IA {(photo.ai_score * 100).toFixed(0)}%
          </p>
        ) : null}
        {photo.url && !photo.uploading ? (
          <button
            type="button"
            className="mt-1 text-[10px] font-medium text-blue-700 underline"
            onClick={() => onToggleReportSelection(photo.id)}
          >
            {selectedForReport
              ? language === "en"
                ? "Deselect for summary"
                : "Retirer de la sélection"
              : language === "en"
                ? "Select for summary"
                : "Inclure sélection"}
          </button>
        ) : null}
        {photo.url && !photo.uploading && selectedForReport ? (
          <label className="mt-1 block text-left">
            <span className="sr-only">{language === "en" ? "Photo tier" : "Niveau de photo"}</span>
            <select
              className="w-full rounded border border-amber-200 bg-amber-50 px-1 py-0.5 text-[10px] font-medium text-amber-950"
              value={currentTier}
              onChange={(e) => {
                onTierChange(photo.id, e.target.value === "critical" ? "critical" : "support");
              }}
            >
              <option value="critical">
                {language === "en" ? "Critical evidence" : "Critique (preuve)"}
              </option>
              <option value="support">
                {language === "en" ? "Support context" : "Support (contexte)"}
              </option>
            </select>
          </label>
        ) : null}
        {selectedForReport && photoSelectionReason ? (
          <p className="mt-1 text-left text-[9px] leading-snug text-slate-600">
            {language === "en" ? photoSelectionReason.en : photoSelectionReason.fr}
          </p>
        ) : null}
        {photo.error ? <p className="text-xs text-red-500">{photo.error}</p> : null}
      </div>
    );
  };

  if (photos.length === 0) return null;

  return (
    <div className="mt-3 space-y-2">
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1.5">
        <p className="w-full text-[11px] font-medium text-slate-700 sm:w-auto">
          {language === "en"
            ? `Photos shown: ${filteredPhotos.length} / ${photos.length}`
            : `Photos affichées : ${filteredPhotos.length} / ${photos.length}`}
        </p>
        <label className="inline-flex items-center gap-1">
          <span className="text-[10px] text-slate-500">{language === "en" ? "Status" : "État"}</span>
          <select
            value={filters.status}
            onChange={(e) => patchFilter("status", e.target.value as PhotoGalleryStatusFilter)}
            className={selectClassName()}
          >
            {STATUS_OPTIONS.map((opt) => (
              <option key={opt.id} value={opt.id}>
                {language === "en" ? opt.en : opt.fr}
              </option>
            ))}
          </select>
        </label>
        <label className="inline-flex items-center gap-1">
          <span className="text-[10px] text-slate-500">
            {language === "en" ? "Finding" : "Association"}
          </span>
          <select
            value={filters.association}
            onChange={(e) =>
              patchFilter("association", e.target.value as PhotoGalleryAssociationFilter)
            }
            className={selectClassName()}
          >
            {ASSOCIATION_OPTIONS.map((opt) => (
              <option key={opt.id} value={opt.id}>
                {language === "en" ? opt.en : opt.fr}
              </option>
            ))}
          </select>
        </label>
        <label className="inline-flex items-center gap-1">
          <span className="text-[10px] text-slate-500">
            {language === "en" ? "Report" : "Rapport"}
          </span>
          <select
            value={filters.report}
            onChange={(e) => patchFilter("report", e.target.value as PhotoGalleryReportFilter)}
            className={selectClassName()}
          >
            {REPORT_OPTIONS.map((opt) => (
              <option key={opt.id} value={opt.id}>
                {language === "en" ? opt.en : opt.fr}
              </option>
            ))}
          </select>
        </label>
        <label className="inline-flex items-center gap-1">
          <span className="text-[10px] text-slate-500">IA</span>
          <select
            value={filters.ai}
            onChange={(e) => patchFilter("ai", e.target.value as PhotoGalleryAiFilter)}
            className={selectClassName()}
          >
            {AI_OPTIONS.map((opt) => (
              <option key={opt.id} value={opt.id}>
                {language === "en" ? opt.en : opt.fr}
              </option>
            ))}
          </select>
        </label>
        <label className="inline-flex items-center gap-1">
          <span className="text-[10px] text-slate-500">
            {language === "en" ? "System" : "Système"}
          </span>
          <select
            value={filters.system}
            onChange={(e) => patchFilter("system", e.target.value as PhotoGallerySystemFilter)}
            className={selectClassName()}
          >
            {SYSTEM_OPTIONS.map((opt) => (
              <option key={opt.id || "all-systems"} value={opt.id}>
                {language === "en" ? opt.en : opt.fr}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div
        ref={scrollRef}
        onScroll={onScroll}
        className="max-h-[min(70vh,520px)] overflow-y-auto rounded-md border border-slate-100 bg-slate-50/40"
      >
        <div style={{ height: totalHeight, position: "relative" }}>
          <div
            className="absolute inset-x-0 grid grid-cols-3 gap-2 px-1"
            style={{ transform: `translateY(${offsetY}px)` }}
          >
            {visibleCells.map((photo) => renderCell(photo))}
          </div>
        </div>
      </div>
    </div>
  );
}
