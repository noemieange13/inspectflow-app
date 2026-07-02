"use client";

import { useMemo } from "react";

import { computeBuyerSummary } from "@/lib/buyerSummary";
import {
  computeTerrainGuideStep,
  type TerrainGuidePreferences,
} from "@/lib/terrainFieldGuide";
import type { UserAgentProfile } from "@/lib/userAgentProfile";
import type { ReportEntryInput, ReportLanguage } from "@/lib/reportNarrative";

type Props = {
  language: ReportLanguage;
  entries: ReportEntryInput[];
  photosCoverageByZone: Record<string, number>;
  validPhotoCount: number;
  reportPayload: Record<string, unknown> | null | undefined;
  terrainPreferences?: TerrainGuidePreferences;
  buyerProfile?: Pick<UserAgentProfile, "prefers_short_reports">;
};

/**
 * Résumé mission court : prochain geste terrain + une ligne « acheteur ».
 */
export default function ReportMissionSummary({
  language,
  entries,
  photosCoverageByZone,
  validPhotoCount,
  reportPayload,
  terrainPreferences,
  buyerProfile,
}: Props) {
  const terrain = useMemo(
    () =>
      computeTerrainGuideStep({
        entries,
        photosCoverageByZone,
        validPhotoCount,
        preferences: terrainPreferences,
      }),
    [entries, photosCoverageByZone, validPhotoCount, terrainPreferences],
  );

  const buyer = useMemo(
    () =>
      computeBuyerSummary({
        entries,
        payload: reportPayload,
        language,
        profile: buyerProfile,
      }),
    [entries, reportPayload, language, buyerProfile],
  );

  const terrainLine =
    terrain == null
      ? language === "en"
        ? "Terrain: QC coverage looks on track."
        : "Terrain : couverture QC semble correcte."
      : language === "en"
        ? `Terrain next: ${terrain.title_en}`
        : `Terrain : ${terrain.title_fr}`;

  return (
    <div
      className="mb-4 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs text-slate-700 shadow-sm"
      role="region"
      aria-label={language === "en" ? "Mission summary" : "Résumé mission"}
    >
      <p className="font-semibold text-slate-900">
        {language === "en" ? "Mission summary" : "Résumé mission"}
      </p>
      <p className="mt-1">{terrainLine}</p>
      <p className="mt-0.5 text-slate-600">
        {language === "en" ? "Buyer view" : "Vue acheteur"}: {buyer.risk} ·{" "}
        {buyer.estimated_cost}
      </p>
    </div>
  );
}
