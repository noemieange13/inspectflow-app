import type {
  AnyDevOfflineInspection,
  DevOfflineInspection,
} from "../types";

import { computeInspectionChecksum } from "./checksum";

export function isV2Inspection(
  record: AnyDevOfflineInspection,
): record is DevOfflineInspection {
  return record.schema_version === 2;
}

/**
 * v1 → v2: additive migration. Content is untouched; sync metadata is
 * initialized so the record can enter the sync pipeline.
 */
export function migrateOfflineInspection(
  record: AnyDevOfflineInspection,
): DevOfflineInspection {
  if (isV2Inspection(record)) {
    return record;
  }
  return {
    ...record,
    schema_version: 2,
    remote_id: null,
    last_synced_at: null,
    sync_attempts: 0,
    sync_error: null,
    sync_started_at: null,
    sync_finished_at: null,
    checksum: computeInspectionChecksum(record),
    client_revision: 1,
    server_revision: null,
  };
}
