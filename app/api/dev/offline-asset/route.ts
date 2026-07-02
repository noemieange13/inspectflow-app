import { NextRequest, NextResponse } from "next/server";

import { isDevAuthBypass } from "@/lib/devInspectorMode";
import { storeOfflineAsset } from "@/lib/devOffline/assets";
import { formatApiErrorMessage, OFFLINE_DEV_USER_MESSAGE } from "@/lib/devOffline/errors";
import { shouldUseOfflineDevStore } from "@/lib/devOffline/probe";

const ALLOWED = new Set(["logo", "signature", "photo"]);

export async function POST(req: NextRequest) {
  if (!isDevAuthBypass()) {
    return NextResponse.json({ success: false, error: "Dev only" }, { status: 403 });
  }

  let formData: FormData;
  try {
    formData = await req.formData();
  } catch {
    return NextResponse.json({ success: false, error: "Invalid form data" }, { status: 400 });
  }

  const file = formData.get("file");
  const assetTypeRaw = formData.get("asset_type");
  if (!(file instanceof File)) {
    return NextResponse.json({ success: false, error: "file required" }, { status: 400 });
  }
  const assetType =
    typeof assetTypeRaw === "string" && ALLOWED.has(assetTypeRaw.trim())
      ? (assetTypeRaw.trim() as "logo" | "signature" | "photo")
      : null;
  if (!assetType) {
    return NextResponse.json({ success: false, error: "Invalid asset_type" }, { status: 400 });
  }
  if (!file.type.startsWith("image/")) {
    return NextResponse.json({ success: false, error: "Image required" }, { status: 400 });
  }

  try {
    const useOffline = await shouldUseOfflineDevStore();
    if (!useOffline) {
      return NextResponse.json(
        {
          success: false,
          error: "Supabase online — use /api/professional-asset/upload",
        },
        { status: 409 },
      );
    }
    const buffer = Buffer.from(await file.arrayBuffer());
    const url = await storeOfflineAsset({
      asset_type: assetType,
      mime_type: file.type,
      buffer,
    });
    return NextResponse.json({
      success: true,
      url,
      offline_dev: true,
      offline_message: OFFLINE_DEV_USER_MESSAGE,
      asset_type: assetType,
    });
  } catch (e) {
    return NextResponse.json(
      { success: false, error: formatApiErrorMessage(e) },
      { status: 500 },
    );
  }
}
