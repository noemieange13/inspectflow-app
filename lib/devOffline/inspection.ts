import { randomUUID } from "node:crypto";

import {
  DEV_INSPECTOR,
  devInspectorFullName,
  stampDevInspectorAttribution,
} from "@/lib/devInspectorMode";
import { generateReportAccessToken, defaultReportTokenExpiresAt } from "@/lib/reportAccessToken";

import { loadOfflineDevProfile } from "./profile";
import {
  listDevOfflineJsonFiles,
  readDevOfflineJson,
  writeDevOfflineJson,
} from "./serverStore";
import { isV2Inspection, migrateOfflineInspection } from "./sync/migration";
import {
  buildDevelopmentDraftStamp,
  DEVELOPMENT_DRAFT_PAYLOAD_KEY,
  type AnyDevOfflineInspection,
  type DevOfflineInspection,
} from "./types";

function inspectionPath(id: string): string {
  return `inspections/${id}.json`;
}

/**
 * Loads a local inspection. Phase 9F: v1 records are automatically migrated to
 * schema_version 2 (and persisted back) so every caller sees the v2 shape.
 */
export async function getOfflineInspection(
  id: string,
): Promise<DevOfflineInspection | null> {
  const raw = await readDevOfflineJson<AnyDevOfflineInspection>(inspectionPath(id));
  if (!raw) return null;
  if (isV2Inspection(raw)) return raw;
  const migrated = migrateOfflineInspection(raw);
  await saveOfflineInspection(migrated);
  return migrated;
}

export async function saveOfflineInspection(
  record: DevOfflineInspection,
): Promise<void> {
  await writeDevOfflineJson(inspectionPath(record.id), record);
}

/** Phase 9F — ids of every locally stored inspection (sync discovery). */
export async function listOfflineInspectionIds(): Promise<string[]> {
  const files = await listDevOfflineJsonFiles("inspections");
  return files.map((name) => name.replace(/\.json$/, ""));
}

export async function createOfflineInspection(input: {
  clientName: string;
  address: string;
  inspectionType: string;
  reportPayload: Record<string, unknown>;
  userId?: string | null;
}): Promise<DevOfflineInspection> {
  const now = new Date().toISOString();
  const id = randomUUID();
  const accessToken = generateReportAccessToken();
  const profile = await loadOfflineDevProfile();

  let payload: Record<string, unknown> = {
    ...input.reportPayload,
    [DEVELOPMENT_DRAFT_PAYLOAD_KEY]: buildDevelopmentDraftStamp(),
  };
  payload = stampDevInspectorAttribution(payload);
  if (profile.display_name || profile.company_name) {
    payload.cover_v1 = {
      ...(typeof payload.cover_v1 === "object" && payload.cover_v1
        ? (payload.cover_v1 as Record<string, unknown>)
        : {}),
      inspecteur_nom: profile.display_name ?? devInspectorFullName(),
      compagnie: profile.company_name ?? DEV_INSPECTOR.company,
    };
  }

  const record: DevOfflineInspection = {
    schema_version: 2,
    id,
    access_token: accessToken,
    token_expires_at: defaultReportTokenExpiresAt().toISOString(),
    user_id: input.userId ?? null,
    inspector_id: DEV_INSPECTOR.id,
    inspector_name: devInspectorFullName(),
    inspector_company: DEV_INSPECTOR.company,
    created_at: now,
    updated_at: now,
    sync_status: "local_only",
    payload,
    remote_id: null,
    last_synced_at: null,
    sync_attempts: 0,
    sync_error: null,
    sync_started_at: null,
    sync_finished_at: null,
    // checksum is written only by the sync engine at last successful sync.
    checksum: null,
    client_revision: 1,
    server_revision: null,
  };

  await saveOfflineInspection(record);
  return record;
}

export function offlineInspectionResponse(record: DevOfflineInspection) {
  const reportUrl = `/report/${encodeURIComponent(record.id)}?token=${encodeURIComponent(record.access_token)}&offline=1`;
  return {
    success: true,
    reportId: record.id,
    reportUrl,
    offline_dev: true,
    offline_message:
      "Supabase is unavailable. Running in Offline Development Mode.",
    inspector_id: record.inspector_id,
    inspector_name: record.inspector_name,
    inspection: record,
  };
}

export async function updateOfflineInspectionPayload(
  id: string,
  accessToken: string,
  mutator: (payload: Record<string, unknown>) => Record<string, unknown>,
): Promise<DevOfflineInspection | null> {
  const record = await getOfflineInspection(id);
  if (!record || record.access_token !== accessToken) return null;
  const next: DevOfflineInspection = {
    ...record,
    updated_at: new Date().toISOString(),
    payload: mutator(record.payload),
    client_revision: (record.client_revision ?? 1) + 1,
    // A synced record edited locally becomes pending again.
    sync_status: record.sync_status === "synced" ? "pending_sync" : record.sync_status,
  };
  await saveOfflineInspection(next);
  return next;
}
