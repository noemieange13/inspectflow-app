import { NextRequest, NextResponse } from "next/server";

import { loadOrganizationMember } from "@/lib/access_control/membership";
import { resolveActiveOrganizationId } from "@/lib/currentOrganization";
import { isDevAuthBypass } from "@/lib/devInspectorMode";
import { storeOfflineAsset } from "@/lib/devOffline/assets";
import {
  formatApiErrorMessage,
  isSupabaseNetworkError,
  OFFLINE_DEV_USER_MESSAGE,
} from "@/lib/devOffline/errors";
import { shouldUseOfflineDevStore } from "@/lib/devOffline/probe";
import { createServiceRoleClient } from "@/lib/supabaseServer";
import { resolveBearerUserId } from "@/lib/supabaseAuthFromRequest";

const BUCKET = "professional-assets";
const MAX_SIZE_BYTES = 2 * 1024 * 1024;
const ALLOWED_TYPES = new Set(["logo", "signature"]);

async function ensureBucket(supabase: Awaited<ReturnType<typeof createServiceRoleClient>>) {
  const { data: buckets } = await supabase.storage.listBuckets();
  if (buckets?.some((b) => b.name === BUCKET)) return;
  await supabase.storage.createBucket(BUCKET, { public: true });
}

function extensionForMime(mime: string): string {
  if (mime === "image/png") return "png";
  if (mime === "image/jpeg" || mime === "image/jpg") return "jpg";
  if (mime === "image/webp") return "webp";
  if (mime === "image/svg+xml") return "svg";
  return "bin";
}

export async function POST(req: NextRequest) {
  const userId = await resolveBearerUserId(req);
  const devBypass = isDevAuthBypass();

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
    typeof assetTypeRaw === "string" && ALLOWED_TYPES.has(assetTypeRaw.trim())
      ? assetTypeRaw.trim()
      : null;
  if (!assetType) {
    return NextResponse.json(
      { success: false, error: "asset_type must be logo or signature" },
      { status: 400 },
    );
  }

  if (!file.type.startsWith("image/")) {
    return NextResponse.json({ success: false, error: "Image file required" }, { status: 400 });
  }

  if (file.size > MAX_SIZE_BYTES) {
    return NextResponse.json({ success: false, error: "File too large (max 2 MB)" }, { status: 400 });
  }

  const buffer = Buffer.from(await file.arrayBuffer());

  if (devBypass && (!userId || (await shouldUseOfflineDevStore()))) {
    try {
      const url = await storeOfflineAsset({
        asset_type: assetType as "logo" | "signature",
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

  if (!userId) {
    return NextResponse.json({ success: false, error: "access_denied" }, { status: 403 });
  }

  const orgIdRaw = formData.get("organization_id");

  try {
    const supabase = await createServiceRoleClient();
    const organizationId = await resolveActiveOrganizationId(
      supabase,
      userId,
      typeof orgIdRaw === "string" ? orgIdRaw : null,
    );

    if (!organizationId) {
      return NextResponse.json(
        { success: false, error: "organization_required" },
        { status: 400 },
      );
    }

    const member = await loadOrganizationMember(supabase, organizationId, userId);
    if (!member || member.status !== "active") {
      return NextResponse.json({ success: false, error: "access_denied" }, { status: 403 });
    }

    await ensureBucket(supabase);

    const folder = assetType === "logo" ? "logos" : "signatures";
    const ext = extensionForMime(file.type);
    const objectPath = `${organizationId}/${folder}/${userId}-${Date.now()}.${ext}`;

    const { error: uploadError } = await supabase.storage
      .from(BUCKET)
      .upload(objectPath, buffer, {
        contentType: file.type,
        upsert: true,
      });

    if (uploadError) {
      console.error("professional-asset upload:", uploadError);
      return NextResponse.json({ success: false, error: uploadError.message }, { status: 500 });
    }

    const { data: publicUrlData } = supabase.storage.from(BUCKET).getPublicUrl(objectPath);

    return NextResponse.json({
      success: true,
      url: publicUrlData.publicUrl,
      path: objectPath,
      asset_type: assetType,
    });
  } catch (e) {
    if (devBypass && isSupabaseNetworkError(e)) {
      try {
        const url = await storeOfflineAsset({
          asset_type: assetType as "logo" | "signature",
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
      } catch (offlineErr) {
        return NextResponse.json(
          { success: false, error: formatApiErrorMessage(offlineErr) },
          { status: 500 },
        );
      }
    }
    const message = formatApiErrorMessage(e);
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
