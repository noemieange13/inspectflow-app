import {
  PROFESSIONAL_ANNEX_PHOTO_CAP,
} from "@/lib/report_template_engine/constants";
import type { PhotoAnnexGroup, PhotoLayout } from "@/lib/report_template_engine/types";
import { professionalSectionTitle } from "@/lib/report_template_engine/locales";
import {
  parseReportPhotoSelectionIds,
  parseReportPhotoSelectionLocked,
  parseReportPhotoSelectionTiers,
} from "@/lib/reportPhotoSelectionPayload";
import { parseObservationPhotoUrlsFromPayload } from "@/lib/reportObservationPhotos";
import { readInspectionDefaultsFromPayload } from "@/lib/inspectorProfile";
import type { ReportLocale } from "@/lib/reportLocale";
import type { ZoneCode } from "@/lib/reportNarrative";
import { resolveProfessionalSectionForEntry } from "@/lib/report_template_engine/constants";

export type PhotoRowForLayout = {
  id: string;
  url?: string | null;
  observation_id?: string | null;
  zone?: string | null;
  duplicate_group?: string | null;
  file_hash?: string | null;
};

function str(v: unknown): string {
  return typeof v === "string" ? v.trim() : "";
}

/** Read optional full photo bank preference (defaults false). */
export function readIncludeFullPhotoBank(payload: Record<string, unknown>): boolean {
  const defaults = readInspectionDefaultsFromPayload(payload);
  const rawDefaults = payload.inspection_defaults_v1;
  if (rawDefaults && typeof rawDefaults === "object") {
    const flag = (rawDefaults as Record<string, unknown>).include_full_photo_bank;
    if (flag === true) return true;
  }
  const prefs = payload.default_report_preferences;
  if (prefs && typeof prefs === "object") {
    const flag = (prefs as Record<string, unknown>).include_full_photo_bank;
    if (flag === true) return true;
  }
  if (defaults && typeof defaults === "object") {
    const ext = defaults as Record<string, unknown> & { include_full_photo_bank?: unknown };
    if (ext.include_full_photo_bank === true) return true;
  }
  return false;
}

function parsePhotoRowsFromPayload(payload: Record<string, unknown>): PhotoRowForLayout[] {
  const bank = payload.report_photo_bank_v1;
  if (bank && typeof bank === "object" && !Array.isArray(bank)) {
    const photos = (bank as Record<string, unknown>).photos;
    if (Array.isArray(photos)) {
      return photos
        .filter((p) => p && typeof p === "object")
        .map((p) => {
          const o = p as Record<string, unknown>;
          return {
            id: str(o.id),
            url: str(o.url) || null,
            observation_id: str(o.observation_id) || null,
            zone: str(o.zone) || null,
            duplicate_group: str(o.duplicate_group) || null,
            file_hash: str(o.file_hash) || null,
          };
        })
        .filter((p) => p.id.length > 0);
    }
  }
  return [];
}

function duplicateKey(row: PhotoRowForLayout): string | null {
  return row.duplicate_group?.trim() || row.file_hash?.trim() || null;
}

/** Dedupe annex photos by duplicate_group / file_hash — exported for tests. */
export function dedupeAnnexPhotoUrls(
  rows: PhotoRowForLayout[],
  cap = PROFESSIONAL_ANNEX_PHOTO_CAP,
): string[] {
  const seenGroups = new Set<string>();
  const out: string[] = [];

  for (const row of rows) {
    const url = str(row.url);
    if (!url) continue;
    const group = duplicateKey(row);
    if (group) {
      if (seenGroups.has(group)) continue;
      seenGroups.add(group);
    }
    out.push(url);
    if (out.length >= cap) break;
  }
  return out;
}

function resolveTier(
  photoId: string,
  tiers: Record<string, "critical" | "support">,
): "critical" | "support" {
  return tiers[photoId] === "support" ? "support" : "critical";
}

/**
 * Resolve primary/secondary photos from selection — never overrides inspector lock.
 * Inspector-selected IDs always win for tier assignment.
 */
export function resolvePhotoLayout(
  payload: Record<string, unknown>,
  locale: ReportLocale,
): PhotoLayout {
  const selectionRaw = payload.report_photo_selection_v1;
  const selectedIds = parseReportPhotoSelectionIds(selectionRaw) ?? [];
  const tiers = parseReportPhotoSelectionTiers(selectionRaw);
  const locked = parseReportPhotoSelectionLocked(selectionRaw);
  const urlsByObs = parseObservationPhotoUrlsFromPayload(payload);
  const photoRows = parsePhotoRowsFromPayload(payload);
  const includeFullPhotoBank = readIncludeFullPhotoBank(payload);

  const primaryByObservationId: Record<string, string> = {};
  const secondaryByObservationId: Record<string, string[]> = {};

  for (const [obsId, urls] of Object.entries(urlsByObs)) {
    if (!obsId || urls.length === 0) continue;
    primaryByObservationId[obsId] = urls[0];
    if (urls.length > 1) {
      secondaryByObservationId[obsId] = urls.slice(1);
    }
  }

  if (selectedIds.length > 0) {
    const urlByPhotoId = new Map<string, string>();
    for (const row of photoRows) {
      if (row.url) urlByPhotoId.set(row.id, row.url);
    }

    for (const [obsId, urls] of Object.entries(urlsByObs)) {
      const primaryUrl = urls.find((u) =>
        selectedIds.some((id) => urlByPhotoId.get(id) === u),
      );
      if (primaryUrl) {
        primaryByObservationId[obsId] = primaryUrl;
      }
      if (locked) continue;
      const secondary = urls.filter((u) => u !== primaryByObservationId[obsId]);
      if (secondary.length > 0) {
        secondaryByObservationId[obsId] = secondary;
      }
    }

    for (const photoId of selectedIds) {
      const tier = resolveTier(photoId, tiers);
      const row = photoRows.find((r) => r.id === photoId);
      const obsId = row?.observation_id?.trim();
      const url = row?.url || urlByPhotoId.get(photoId);
      if (!obsId || !url) continue;
      if (tier === "critical") {
        primaryByObservationId[obsId] = url;
      } else {
        const sec = secondaryByObservationId[obsId] ?? [];
        if (!sec.includes(url)) sec.push(url);
        secondaryByObservationId[obsId] = sec;
      }
    }
  }

  const annexGroups: PhotoAnnexGroup[] = [];
  if (includeFullPhotoBank && photoRows.length > 0) {
    const bySection = new Map<string, PhotoRowForLayout[]>();
    for (const row of photoRows) {
      if (!selectedIds.includes(row.id) && selectedIds.length > 0) continue;
      const code = resolveProfessionalSectionForEntry(
        (row.zone ?? "autre") as ZoneCode,
        undefined,
      );
      const list = bySection.get(code) ?? [];
      list.push(row);
      bySection.set(code, list);
    }
    for (const [code, rows] of bySection) {
      const urls = dedupeAnnexPhotoUrls(rows);
      if (urls.length === 0) continue;
      annexGroups.push({
        label: professionalSectionTitle(code, locale),
        photoUrls: urls,
      });
    }
  }

  return {
    primaryByObservationId,
    secondaryByObservationId,
    annexGroups,
    includeFullPhotoBank,
  };
}

export function pickFacadePhotoUrl(
  payload: Record<string, unknown>,
  photoLayout: PhotoLayout,
): string | null {
  const rows = parsePhotoRowsFromPayload(payload);
  const selectionRaw = payload.report_photo_selection_v1;
  const selectedIds = parseReportPhotoSelectionIds(selectionRaw) ?? [];
  const tiers = parseReportPhotoSelectionTiers(selectionRaw);

  for (const id of selectedIds) {
    if (tiers[id] === "support") continue;
    const row = rows.find((r) => r.id === id);
    if (row?.url && (row.zone === "facade" || row.zone === "exterieur")) {
      return row.url;
    }
  }

  for (const row of rows) {
    if (row.url && (row.zone === "facade" || row.zone === "exterieur")) {
      return row.url;
    }
  }

  const firstPrimary = Object.values(photoLayout.primaryByObservationId)[0];
  return firstPrimary ?? null;
}

/** Test helper: inspector tier must not be replaced when locked. */
export function inspectorPrimaryPreserved(
  payload: Record<string, unknown>,
  observationId: string,
  inspectorPhotoUrl: string,
): boolean {
  const layout = resolvePhotoLayout(payload, "fr-CA");
  return layout.primaryByObservationId[observationId] === inspectorPhotoUrl;
}
