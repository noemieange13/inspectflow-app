"use client";

import { useMemo } from "react";

import { emitProductEvent } from "@/lib/productTelemetry";
import {
  computeTerrainGuideStep,
  type TerrainGuidePreferences,
} from "@/lib/terrainFieldGuide";
import type { ReportEntryInput, ReportLanguage, ZoneCode } from "@/lib/reportNarrative";

type Props = {
  language: ReportLanguage;
  entries: ReportEntryInput[];
  photosCoverageByZone: Record<string, number>;
  validPhotoCount: number;
  onPresetZoneForNextPhoto: (zone: ZoneCode) => void;
  onScrollToPhotos: () => void;
  preferences?: TerrainGuidePreferences;
};

/**
 * Guide terrain proactif — pendant l’inspection (photos QC & constats).
 */
export default function TerrainGuidePanel({
  language,
  entries,
  photosCoverageByZone,
  validPhotoCount,
  onPresetZoneForNextPhoto,
  onScrollToPhotos,
  preferences,
}: Props) {
  const step = useMemo(
    () =>
      computeTerrainGuideStep({
        entries,
        photosCoverageByZone,
        validPhotoCount,
        preferences,
      }),
    [entries, photosCoverageByZone, validPhotoCount, preferences],
  );

  if (!step) {
    return (
      <div
        id="terrain-guide-panel"
        className="mb-4 rounded-xl border border-emerald-200 bg-emerald-50/80 px-4 py-3 text-sm text-emerald-950"
        role="status"
      >
        <p className="font-semibold">
          {language === "en" ? "Field guide" : "Guide terrain"}
        </p>
        <p className="mt-1 text-emerald-900/90">
          {language === "en"
            ? "QC photo coverage and findings look complete for now — re-check before export."
            : "Couverture photo QC et constats semblent complets pour l’instant — vérifiez avant export."}
        </p>
      </div>
    );
  }

  const title = language === "en" ? step.title_en : step.title_fr;
  const detail = language === "en" ? step.detail_en : step.detail_fr;
  const isPhoto = step.kind === "photo";

  return (
    <div
      id="terrain-guide-panel"
      className="mb-4 rounded-xl border border-amber-300 bg-amber-50/95 px-4 py-3 text-slate-900 shadow-sm"
      role="region"
      aria-label={language === "en" ? "Field inspection guide" : "Guide inspection terrain"}
    >
      <p className="text-xs font-semibold uppercase tracking-wide text-amber-900">
        {language === "en" ? "Field guide (proactive)" : "Guide terrain (proactif)"}
      </p>
      <p className="mt-1 text-base font-semibold text-amber-950">📸 {title}</p>
      <p className="mt-1 text-sm text-amber-950/95">{detail}</p>
      {isPhoto ? (
        <p className="mt-1 font-mono text-xs text-amber-900/80">
          QC {step.qc_system}: {step.current_photos}/{step.min_photos}{" "}
          {language === "en" ? "photos" : "photos"}
        </p>
      ) : null}
      <div className="mt-3 flex flex-wrap gap-2">
        <button
          type="button"
          className="rounded-md bg-amber-700 px-3 py-1.5 text-xs font-semibold text-white hover:bg-amber-800"
          onClick={() => {
            onPresetZoneForNextPhoto(step.suggested_zone);
            emitProductEvent("terrain_guide_preset_zone", {
              zone: step.suggested_zone,
              qc_system: step.qc_system,
              kind: step.kind,
            });
            onScrollToPhotos();
          }}
        >
          {language === "en"
            ? `Set zone for next photo: ${step.suggested_zone}`
            : `Zone prochaine photo : ${step.suggested_zone}`}
        </button>
        <button
          type="button"
          className="rounded-md border border-amber-600 bg-white px-3 py-1.5 text-xs font-semibold text-amber-950 hover:bg-amber-100/80"
          onClick={() => onScrollToPhotos()}
        >
          {language === "en" ? "Open photos area" : "Aller aux photos"}
        </button>
      </div>
    </div>
  );
}
