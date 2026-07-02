/**
 * Phase 8Z — Snapshot de secours avant approbation finale (régénération PDF identique).
 */

import { INSPECTION_KNOWLEDGE_BASE_KEY } from "@/lib/inspectionKnowledgeBase";
import { REPORT_COMPLIANCE_V1_KEY } from "@/lib/legalClauses/qc/version";
import { LEGAL_SECTIONS_V1_KEY } from "@/lib/report_legal_sections_engine";
import { REPORT_PROFESSIONAL_SNAPSHOT_KEY } from "@/lib/inspectorProfile";
import { REPORT_CONCLUSION_V1_KEY } from "@/lib/reportConclusionEngine";
import { STEVE_FINDINGS_V1_KEY } from "@/lib/findingSchema";

export const REPORT_BACKUP_SNAPSHOT_V1_KEY = "report_backup_snapshot_v1" as const;

export type ReportBackupSnapshotV1 = {
  schema_version: 1;
  captured_at: string;
  locked: true;
  inspection_data: {
    cover_v1: unknown;
    building_profile_v1: unknown;
    report_property_snapshot_v1: unknown;
    inspection_weather_v1: unknown;
  };
  findings: unknown;
  photo_references: {
    steve_photo_context_v1: unknown;
    report_photo_selection_v1: unknown;
    photo_observation_links: unknown;
  };
  legal: {
    legal_sections_v1: unknown;
    report_compliance_v1: unknown;
    inspection_knowledge_base_v1: unknown;
  };
  inspector: unknown;
  conclusion: unknown;
};

function pickPayloadKey(payload: Record<string, unknown>, key: string): unknown {
  return Object.prototype.hasOwnProperty.call(payload, key) ? payload[key] : null;
}

export function buildReportBackupSnapshotV1(
  payload: Record<string, unknown>,
  capturedAt = new Date().toISOString(),
): ReportBackupSnapshotV1 {
  return {
    schema_version: 1,
    captured_at: capturedAt,
    locked: true,
    inspection_data: {
      cover_v1: pickPayloadKey(payload, "cover_v1"),
      building_profile_v1: pickPayloadKey(payload, "building_profile_v1"),
      report_property_snapshot_v1: pickPayloadKey(payload, "report_property_snapshot_v1"),
      inspection_weather_v1: pickPayloadKey(payload, "inspection_weather_v1"),
    },
    findings: pickPayloadKey(payload, STEVE_FINDINGS_V1_KEY) ?? pickPayloadKey(payload, "entries"),
    photo_references: {
      steve_photo_context_v1: pickPayloadKey(payload, "steve_photo_context_v1"),
      report_photo_selection_v1: pickPayloadKey(payload, "report_photo_selection_v1"),
      photo_observation_links: pickPayloadKey(payload, "photo_observation_links"),
    },
    legal: {
      legal_sections_v1: pickPayloadKey(payload, LEGAL_SECTIONS_V1_KEY),
      report_compliance_v1: pickPayloadKey(payload, REPORT_COMPLIANCE_V1_KEY),
      inspection_knowledge_base_v1: pickPayloadKey(payload, INSPECTION_KNOWLEDGE_BASE_KEY),
    },
    inspector: pickPayloadKey(payload, REPORT_PROFESSIONAL_SNAPSHOT_KEY),
    conclusion: pickPayloadKey(payload, REPORT_CONCLUSION_V1_KEY),
  };
}

export function attachReportBackupToPayload(
  payload: Record<string, unknown>,
  capturedAt = new Date().toISOString(),
): Record<string, unknown> {
  return {
    ...payload,
    [REPORT_BACKUP_SNAPSHOT_V1_KEY]: buildReportBackupSnapshotV1(payload, capturedAt),
  };
}

export function readReportBackupFromPayload(
  payload: Record<string, unknown>,
): ReportBackupSnapshotV1 | null {
  const raw = payload[REPORT_BACKUP_SNAPSHOT_V1_KEY];
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const o = raw as Record<string, unknown>;
  if (o.schema_version !== 1 || o.locked !== true) return null;
  return o as ReportBackupSnapshotV1;
}

/** Persist backup snapshot via existing report-content save path (before PDF approval). */
export async function persistReportBackupSnapshot(input: {
  reportId: string;
  accessToken: string;
  payload: Record<string, unknown>;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const { buildFindingsReviewSaveBody } = await import("@/lib/findingsReview");
  const { parseStructuredEntriesFromPayload } = await import("@/lib/reportNarrative");
  const withBackup = readReportBackupFromPayload(input.payload)
    ? input.payload
    : attachReportBackupToPayload(input.payload);
  const entries = parseStructuredEntriesFromPayload(withBackup);
  if (entries.length === 0) {
    return { ok: false, error: "no_entries" };
  }
  const body = buildFindingsReviewSaveBody(
    input.reportId,
    input.accessToken,
    withBackup,
    entries,
  );
  const res = await fetch("/api/report-content", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    return { ok: false, error: "save_failed" };
  }
  return { ok: true };
}
