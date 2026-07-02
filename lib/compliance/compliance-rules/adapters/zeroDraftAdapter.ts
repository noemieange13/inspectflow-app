import type { ProvinceCode } from "@/lib/compliance/inspection-norms";
import { PROVINCES } from "@/lib/compliance/inspection-norms";
import {
  getComplianceExportMode,
  parseCoverV1FromUnknown,
  type InspectionCoverPayloadV1,
} from "@/lib/inspectionCoverPayload";
import { isObservationId } from "@/lib/observationIds";
import { parsePayloadEntries } from "@/lib/qcSystemSections";

import { zoneToNormSectionId, zoneToSystemCode } from "../mappers/systemMap";
import type {
  ComplianceContext,
  ComplianceReportScope,
  NormalizedConstat,
  NormalizedPhoto,
} from "../types";
import { QC_AIBQ_2027_RULESET_ID } from "../rules/qc-aibq-2027";

type ZeroDraftAdapterInput = {
  payload?: Record<string, unknown> | null;
  cover?: InspectionCoverPayloadV1 | null;
  linkedPhotos?: NormalizedPhoto[];
  reportScope?: ComplianceReportScope;
};

function jurisdictionToProvince(j: string | undefined): ProvinceCode {
  if (!j) return "QC";
  if (j === "ca_general") return "CA";
  const m = /^ca_([a-z]{2})$/i.exec(j);
  if (m?.[1]) return m[1].toUpperCase() as ProvinceCode;
  return "QC";
}

function parseEntriesWithSeverity(raw: unknown): Array<{
  id?: string;
  zone: string;
  note: string;
  severity: string;
}> {
  if (!Array.isArray(raw)) return [];
  const out: Array<{
    id?: string;
    zone: string;
    note: string;
    severity: string;
  }> = [];
  for (const row of raw) {
    if (!row || typeof row !== "object") continue;
    const o = row as Record<string, unknown>;
    const id = typeof o.id === "string" ? o.id.trim() : undefined;
    const zone = typeof o.zone === "string" ? o.zone : "";
    const note = typeof o.note === "string" ? o.note : "";
    const severity = typeof o.severity === "string" ? o.severity : "low";
    out.push({ id, zone, note, severity });
  }
  return out;
}

function normalizeSections(raw: unknown): Array<Record<string, unknown>> {
  if (!Array.isArray(raw)) return [];
  return raw.filter((x): x is Record<string, unknown> => x != null && typeof x === "object");
}

export function buildZeroDraftComplianceContext(input: ZeroDraftAdapterInput): ComplianceContext {
  const payload = input.payload ?? {};
  const cover =
    input.cover ??
    (payload.cover_v1 != null ? parseCoverV1FromUnknown(payload.cover_v1) : null);

  const province = cover
    ? jurisdictionToProvince(cover.conformite_juridiction)
    : jurisdictionToProvince(
        typeof payload.jurisdiction === "string" ? payload.jurisdiction : undefined,
      );

  const provinceInfo = PROVINCES[province] ?? PROVINCES.QC;
  const scope = input.reportScope ?? (input.payload ? "full" : "cover_only");

  const entriesDetailed = parseEntriesWithSeverity(payload.entries);
  const fallbackEntries = parsePayloadEntries(payload.entries);
  const sections = normalizeSections(payload.sections);

  const constats: NormalizedConstat[] = [];
  const n = Math.max(entriesDetailed.length, fallbackEntries.length, sections.length);
  for (let i = 0; i < n; i++) {
    const detailed = entriesDetailed[i];
    const fallback = fallbackEntries[i];
    const zone = detailed?.zone ?? fallback?.zone ?? "";
    const note = (detailed?.note ?? fallback?.note ?? "").trim();
    const entryId =
      detailed?.id && isObservationId(detailed.id) ? detailed.id : "";
    const section = sections[i];
    const rec =
      section && typeof section.recommendation === "string"
        ? section.recommendation.trim()
        : "";
    if (!entryId && !zone && !note) continue;
    constats.push({
      id: entryId || `missing-id-${i}`,
      systemCode: zoneToSystemCode(zone),
      normSectionId: zoneToNormSectionId(zone),
      hasObservationText: note.length >= 1,
      hasRecommendation: rec.length > 0,
      severity: detailed?.severity,
      entryIndex: i,
    });
  }

  const photos: NormalizedPhoto[] = (input.linkedPhotos ?? []).filter((p) =>
    isObservationId(p.photo_id),
  );

  const exportMode = cover ? getComplianceExportMode(cover) : "CA_STANDARD";
  const rulesetId = exportMode === "QC_2027" ? QC_AIBQ_2027_RULESET_ID : "";

  return {
    province,
    normBody: provinceInfo.primaryBody,
    normVersion: exportMode === "QC_2027" ? "2027" : "2023",
    rulesetId,
    cover,
    constats,
    photos,
    reportScope: scope,
  };
}

export function buildZeroDraftComplianceContextFromReadiness(
  cover: InspectionCoverPayloadV1 | null,
  opts?: {
    reportPayload?: Record<string, unknown> | null;
    linkedPhotos?: NormalizedPhoto[];
  },
): ComplianceContext {
  const rp = opts?.reportPayload;
  const hasReportBundle = rp !== undefined && rp !== null;
  return buildZeroDraftComplianceContext({
    payload: rp ?? undefined,
    cover,
    linkedPhotos: opts?.linkedPhotos,
    reportScope: hasReportBundle ? "full" : "cover_only",
  });
}
