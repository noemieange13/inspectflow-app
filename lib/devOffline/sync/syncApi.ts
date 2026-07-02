import { isDevAuthBypass } from "@/lib/devInspectorMode";
import { createServiceRoleClient } from "@/lib/supabaseServer";

import { getOfflineAsset } from "../assets";
import type { DevOfflineInspection } from "../types";

import {
  SYNC_REMOTE_TIMEOUT_MS,
  type RemoteInspectionSnapshot,
  type SyncRemoteApi,
} from "./syncTypes";

/** Sync metadata stamped inside the remote payload — makes uploads idempotent. */
export const REMOTE_SYNC_STAMP_KEY = "dev_offline_sync_v1" as const;

/** Storage bucket + prefix for synced assets (photos, attachments, logos…). */
const ASSET_BUCKET = "user-uploads";
const ASSET_PREFIX = "dev-sync/assets";

type RemoteSyncStamp = {
  checksum: string;
  client_revision: number;
  server_revision: number;
  synced_at: string;
  offline_dev: true;
};

function readRemoteStamp(payload: unknown): RemoteSyncStamp | null {
  if (!payload || typeof payload !== "object") return null;
  const stamp = (payload as Record<string, unknown>)[REMOTE_SYNC_STAMP_KEY];
  if (!stamp || typeof stamp !== "object") return null;
  const s = stamp as Partial<RemoteSyncStamp>;
  if (typeof s.checksum !== "string" || typeof s.server_revision !== "number") {
    return null;
  }
  return s as RemoteSyncStamp;
}

/** Reject after the sync timeout so a hung request becomes a retryable error. */
async function withTimeout<T>(promise: Promise<T>, label: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(
      () => reject(new Error(`${label} timed out after ${SYNC_REMOTE_TIMEOUT_MS}ms`)),
      SYNC_REMOTE_TIMEOUT_MS,
    );
    timer.unref?.();
  });
  try {
    return await Promise.race([promise, timeout]);
  } finally {
    clearTimeout(timer);
  }
}

function parseDataUrl(dataUrl: string): { mime: string; buffer: Buffer } | null {
  const match = /^data:([^;,]+);base64,(.+)$/s.exec(dataUrl);
  if (!match) return null;
  return { mime: match[1], buffer: Buffer.from(match[2], "base64") };
}

function extensionForMime(mime: string): string {
  const map: Record<string, string> = {
    "image/jpeg": "jpg",
    "image/png": "png",
    "image/webp": "webp",
    "image/gif": "gif",
    "application/pdf": "pdf",
  };
  return map[mime] ?? "bin";
}

/**
 * Supabase-backed remote adapter (Phase 9H). Dev-bypass only — the engine also
 * refuses to run outside dev, this is a defense-in-depth second gate.
 *
 * Idempotency guarantees:
 * - Inspections/report content: rows upserted by the local record UUID
 *   (`reports.id`, onConflict id) — replays can never create duplicate rows.
 * - Photos / assets / attachments: deterministic storage path derived from the
 *   asset id + `upsert: true` — replays overwrite the same object.
 * - Every remote call is bounded by SYNC_REMOTE_TIMEOUT_MS so hung requests
 *   surface as retryable errors instead of blocking the queue.
 */
export function createSupabaseSyncApi(): SyncRemoteApi {
  if (!isDevAuthBypass()) {
    throw new Error("createSupabaseSyncApi is only available in dev bypass mode");
  }

  return {
    async fetchRemoteInspection(
      record: DevOfflineInspection,
    ): Promise<RemoteInspectionSnapshot | null> {
      const supabase = await createServiceRoleClient();
      const remoteId = record.remote_id ?? record.id;
      const { data, error } = await withTimeout(
        supabase
          .from("reports")
          .select("id, payload, updated_at")
          .eq("id", remoteId)
          .maybeSingle(),
        "fetchRemoteInspection",
      );
      if (error) {
        throw new Error(`fetchRemoteInspection failed: ${error.message}`);
      }
      if (!data) return null;
      const stamp = readRemoteStamp(data.payload);
      return {
        remote_id: data.id as string,
        server_revision: stamp?.server_revision ?? 0,
        checksum: stamp?.checksum ?? null,
        updated_at: (data.updated_at as string | null) ?? null,
        payload:
          data.payload && typeof data.payload === "object"
            ? (data.payload as Record<string, unknown>)
            : null,
      };
    },

    async upsertInspection(record: DevOfflineInspection, checksum: string) {
      const supabase = await createServiceRoleClient();
      const clientRevision = record.client_revision ?? 1;
      const stamp: RemoteSyncStamp = {
        checksum,
        client_revision: clientRevision,
        // Deterministic: same client_revision always maps to the same
        // server_revision, so replayed uploads are no-ops.
        server_revision: clientRevision,
        synced_at: new Date().toISOString(),
        offline_dev: true,
      };
      const { error } = await withTimeout(
        supabase.from("reports").upsert(
          {
            id: record.remote_id ?? record.id,
            access_token: record.access_token,
            token_expires_at: record.token_expires_at,
            user_id: record.user_id,
            payload: { ...record.payload, [REMOTE_SYNC_STAMP_KEY]: stamp },
          },
          { onConflict: "id" },
        ),
        "upsertInspection",
      );
      if (error) {
        throw new Error(`upsertInspection failed: ${error.message}`);
      }
      return {
        remote_id: record.remote_id ?? record.id,
        server_revision: stamp.server_revision,
      };
    },

    async uploadAsset(assetId: string) {
      const asset = await getOfflineAsset(assetId);
      if (!asset) {
        throw new Error(`uploadAsset: offline asset not found: ${assetId}`);
      }
      const parsed = parseDataUrl(asset.data_url);
      if (!parsed) {
        throw new Error(`uploadAsset: asset ${assetId} has no parsable data URL`);
      }

      const supabase = await createServiceRoleClient();
      const path = `${ASSET_PREFIX}/${assetId}.${extensionForMime(parsed.mime)}`;
      const { error } = await withTimeout(
        supabase.storage.from(ASSET_BUCKET).upload(path, parsed.buffer, {
          contentType: parsed.mime,
          upsert: true,
        }),
        "uploadAsset",
      );
      if (error) {
        throw new Error(`uploadAsset failed: ${error.message}`);
      }
      const { data } = supabase.storage.from(ASSET_BUCKET).getPublicUrl(path);
      return {
        remote_url: data.publicUrl,
        bytes_uploaded: parsed.buffer.byteLength,
      };
    },
  };
}
