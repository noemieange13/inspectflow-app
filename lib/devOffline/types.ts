/**
 * Format local sync-compatible.
 * Phase 9E — modèle local v1 (gelé). Phase 9F — v2 ajoute les métadonnées de synchronisation.
 */
export type DevOfflineSyncStatus =
  | "local_only"
  | "pending_sync"
  | "syncing"
  | "synced"
  | "conflict"
  | "failed";

type DevOfflineInspectionCore = {
  id: string;
  access_token: string;
  token_expires_at: string;
  user_id: string | null;
  inspector_id: string;
  inspector_name: string;
  inspector_company: string;
  created_at: string;
  updated_at: string;
  sync_status: DevOfflineSyncStatus;
  payload: Record<string, unknown>;
};

/** Phase 9E legacy shape — still readable; migrated to v2 on load. */
export type DevOfflineInspectionV1 = DevOfflineInspectionCore & {
  schema_version: 1;
};

/** Phase 9F — sync-aware record. All sync fields optional for forward compatibility. */
export type DevOfflineInspectionV2 = DevOfflineInspectionCore & {
  schema_version: 2;
  remote_id?: string | null;
  last_synced_at?: string | null;
  sync_attempts?: number;
  sync_error?: string | null;
  sync_started_at?: string | null;
  sync_finished_at?: string | null;
  checksum?: string | null;
  client_revision?: number;
  server_revision?: number | null;
};

/** Current offline inspection shape used across the app. */
export type DevOfflineInspection = DevOfflineInspectionV2;

export type AnyDevOfflineInspection = DevOfflineInspectionV1 | DevOfflineInspectionV2;

export type DevOfflineAssetV1 = {
  schema_version: 1;
  asset_type: "logo" | "signature" | "photo";
  mime_type: string;
  data_url: string;
  created_at: string;
};

export const DEVELOPMENT_DRAFT_PAYLOAD_KEY = "development_draft_v1" as const;

export function buildDevelopmentDraftStamp(): Record<string, unknown> {
  return {
    label: "Development Draft",
    sync_status: "local_only" as DevOfflineSyncStatus,
    message: "No database synchronization.",
    stamped_at: new Date().toISOString(),
  };
}
