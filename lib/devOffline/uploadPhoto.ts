import { createHash, randomUUID } from "node:crypto";

import { reportAccessTokensMatch } from "@/lib/reportAccessToken";

import { storeOfflineAsset } from "./assets";
import { getOfflineInspection } from "./inspection";

export async function handleOfflinePhotoUpload(input: {
  reportId: string;
  accessTokenRaw: string;
  file: File;
  buffer: Buffer;
  clientUploadId?: string;
  captureMode?: string | null;
}): Promise<Response | null> {
  const record = await getOfflineInspection(input.reportId);
  if (!record) return null;

  const token = input.accessTokenRaw.trim();
  if (!token || !reportAccessTokensMatch(token, record.access_token)) {
    return Response.json({ error: "access_denied" }, { status: 403 });
  }

  const fileHash = createHash("sha256").update(input.buffer).digest("hex");
  const photoId = randomUUID();
  const url = await storeOfflineAsset({
    asset_type: "photo",
    mime_type: input.file.type || "application/octet-stream",
    buffer: input.buffer,
  });

  return Response.json({
    success: true,
    deduplicated: false,
    storage_path: `offline://${input.reportId}/${photoId}`,
    url,
    file_hash: fileHash,
    photo_id: photoId,
    batch_id: null,
    file_name: input.file.name,
    file_size: input.file.size,
    capture_mode: input.captureMode ?? null,
    offline_dev: true,
  });
}
