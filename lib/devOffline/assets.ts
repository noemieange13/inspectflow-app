import { randomUUID } from "node:crypto";

import { readDevOfflineJson, writeDevOfflineJson } from "./serverStore";
import type { DevOfflineAssetV1 } from "./types";

function assetPath(id: string): string {
  return `assets/${id}.json`;
}

export async function storeOfflineAsset(input: {
  asset_type: "logo" | "signature" | "photo";
  mime_type: string;
  buffer: Buffer;
}): Promise<string> {
  const id = randomUUID();
  const data_url = `data:${input.mime_type};base64,${input.buffer.toString("base64")}`;
  const record: DevOfflineAssetV1 = {
    schema_version: 1,
    asset_type: input.asset_type,
    mime_type: input.mime_type,
    data_url,
    created_at: new Date().toISOString(),
  };
  await writeDevOfflineJson(assetPath(id), record);
  return data_url;
}

/** Phase 9F — read a stored asset by id (used by the sync engine). */
export async function getOfflineAsset(id: string): Promise<DevOfflineAssetV1 | null> {
  return readDevOfflineJson<DevOfflineAssetV1>(assetPath(id));
}
