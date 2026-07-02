import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it, beforeEach } from "node:test";

import {
  formatApiErrorMessage,
  isSupabaseNetworkError,
  OFFLINE_DEV_USER_MESSAGE,
} from "../lib/devOffline/errors";
import {
  buildDevelopmentDraftStamp,
  DEVELOPMENT_DRAFT_PAYLOAD_KEY,
} from "../lib/devOffline/types";
import { resetDevInspectorProfileOverrides } from "../lib/devInspectorProfileStore";
import {
  createOfflineInspection,
  getOfflineInspection,
} from "../lib/devOffline/inspection";
import { resetDevSupabaseUserIdCache } from "../lib/devInspectorUserId";
import { resetSupabaseProbeCache } from "../lib/devOffline/probe";
import { clearDevOfflineTestRoot } from "./helpers/devOfflineTestRoot";

const root = join(import.meta.dirname, "..");

function read(rel: string): string {
  return readFileSync(join(root, rel), "utf8");
}

describe("Phase 9E — offline development resilience", () => {
  beforeEach(async () => {
    process.env.NODE_ENV = "development";
    process.env.DEV_AUTH_BYPASS = "true";
    resetDevInspectorProfileOverrides();
    resetDevSupabaseUserIdCache();
    resetSupabaseProbeCache();
    await clearDevOfflineTestRoot();
  });

  it("detects Supabase network errors", () => {
    assert.equal(isSupabaseNetworkError(new Error("fetch failed")), true);
    assert.equal(
      isSupabaseNetworkError({ cause: { code: "ENOTFOUND" } }),
      true,
    );
    assert.equal(isSupabaseNetworkError(new Error("validation failed")), false);
  });

  it("formats API errors without [object Object]", () => {
    assert.equal(formatApiErrorMessage({ message: "DNS fail" }), "DNS fail");
    assert.notEqual(formatApiErrorMessage({ foo: "bar" }), "[object Object]");
    assert.equal(OFFLINE_DEV_USER_MESSAGE.includes("Offline"), true);
  });

  it("offline profile load/save returns Steve", async () => {
    const { loadOfflineDevProfile, saveOfflineDevProfile } = await import(
      "../lib/devOffline/profile.js"
    );
    const base = await loadOfflineDevProfile();
    assert.equal(base.first_name, "Steve");
    assert.equal(base.last_name, "Charbonneau");
    const saved = await saveOfflineDevProfile({
      ...base,
      phone: "514-555-0100",
    });
    assert.equal(saved.phone, "514-555-0100");
    const reloaded = await loadOfflineDevProfile();
    assert.equal(reloaded.phone, "514-555-0100");
  });

  it("creates offline inspection with dev-steve attribution", async () => {
    const record = await createOfflineInspection({
      clientName: "Client Offline",
      address: "123 rue Test",
      inspectionType: "residential",
      reportPayload: {
        cover_v1: { client_name: "Client Offline", address: "123 rue Test" },
      },
    });
    assert.equal(record.inspector_id, "dev-steve");
    assert.equal(record.inspector_name, "Steve Charbonneau");
    assert.equal(record.sync_status, "local_only");
    assert.ok(record.payload[DEVELOPMENT_DRAFT_PAYLOAD_KEY]);
    const loaded = await getOfflineInspection(record.id);
    assert.equal(loaded?.id, record.id);
  });

  it("development draft stamp shape is sync-compatible", () => {
    const stamp = buildDevelopmentDraftStamp();
    assert.equal(stamp.label, "Development Draft");
    assert.equal(stamp.sync_status, "local_only");
  });

  it("stores offline logo/signature as data URLs", async () => {
    const { storeOfflineAsset } = await import("../lib/devOffline/assets.js");
    const url = await storeOfflineAsset({
      asset_type: "signature",
      mime_type: "image/png",
      buffer: Buffer.from("fake-png-bytes"),
    });
    assert.match(url, /^data:image\/png;base64,/);
  });

  it("development draft HTML includes banner", async () => {
    const { createOfflineInspection } = await import("../lib/devOffline/inspection.js");
    const { buildOfflineDevelopmentDraftHtml } = await import(
      "../lib/devOffline/draftHtml.js"
    );
    const record = await createOfflineInspection({
      clientName: "Draft Client",
      address: "1 Draft St",
      inspectionType: "residential",
      reportPayload: { entries: [] },
    });
    const draft = await buildOfflineDevelopmentDraftHtml(record.id, record.access_token);
    assert.ok(draft?.html.includes("Development Draft"));
    assert.ok(draft?.html.includes("No database synchronization"));
  });

  it("routes wired for offline fallbacks", () => {
    assert.match(read("app/api/inspector-profile/route.ts"), /loadOfflineDevProfile/);
    assert.match(read("app/api/inspector/create-inspection/route.ts"), /runOfflineCreateInspection/);
    assert.match(read("app/api/inspector/create-inspection/route.ts"), /isDevAuthBypass/);
    assert.match(read("app/api/report-content/route.ts"), /tryOfflineReportContentPost/);
    assert.match(read("app/api/professional-asset/upload/route.ts"), /storeOfflineAsset/);
    assert.match(read("app/api/inspector/create-inspection/route.ts"), /withOfflineDevFallback/);
    assert.match(read("app/api/upload-photo/route.ts"), /handleOfflinePhotoUpload/);
    assert.match(read("app/api/report-html-preview/route.ts"), /tryOfflineReportHtmlPreview/);
    assert.match(read("lib/reportViewerServer.ts"), /resolveReportForViewer/);
    assert.match(read("components/DevelopmentDraftBanner.tsx"), /Development Draft/);
    assert.match(read("components/OfflineDevBanner.tsx"), /OFFLINE DEVELOPMENT MODE/);
  });
});

describe("Phase 9E — offline report viewer", () => {
  beforeEach(async () => {
    process.env.NODE_ENV = "development";
    process.env.DEV_AUTH_BYPASS = "true";
    process.env.DEV_SUPABASE_FORCE_OFFLINE = "true";
    resetSupabaseProbeCache();
    await clearDevOfflineTestRoot();
  });

  it("loadOfflineReportForViewer returns local payload with offlineDev flag", async () => {
    const { createOfflineInspection } = await import("../lib/devOffline/inspection.js");
    const { loadOfflineReportForViewer } = await import("../lib/devOffline/reportViewer.js");
    const record = await createOfflineInspection({
      clientName: "Viewer Client",
      address: "99 Viewer Ave",
      inspectionType: "residential",
      reportPayload: { cover_v1: { client_name: "Viewer Client", address: "99 Viewer Ave" } },
    });
    const data = await loadOfflineReportForViewer(record.id, record.access_token);
    assert.equal(data.offlineDev, true);
    assert.equal(data.notFound, undefined);
    assert.ok(data.payload);
    assert.equal(data.status, "development_draft");
  });

  it("resolveReportForViewer skips Supabase when local record exists", async () => {
    const { createOfflineInspection } = await import("../lib/devOffline/inspection.js");
    const { resolveReportForViewer } = await import("../lib/reportViewerServer.js");
    const record = await createOfflineInspection({
      clientName: "Resolve Client",
      address: "1 Resolve Rd",
      inspectionType: "residential",
      reportPayload: { entries: [] },
    });
    const data = await resolveReportForViewer(record.id, record.access_token, {
      offlineQuery: true,
    });
    assert.equal(data.offlineDev, true);
    assert.ok(data.payload);
  });
});

describe("Phase 9E — offline draft API", () => {
  beforeEach(async () => {
    process.env.NODE_ENV = "development";
    process.env.DEV_AUTH_BYPASS = "true";
    await clearDevOfflineTestRoot();
  });

  it("GET offline-report-draft returns valid HTML", async () => {
    const { createOfflineInspection } = await import("../lib/devOffline/inspection.js");
    const { GET } = await import("../app/api/dev/offline-report-draft/route.js");
    const record = await createOfflineInspection({
      clientName: "Draft API",
      address: "2 Draft Ln",
      inspectionType: "residential",
      reportPayload: { entries: [] },
    });
    const res = await GET(new Request(
      `http://localhost/api/dev/offline-report-draft?report_id=${encodeURIComponent(record.id)}&access_token=${encodeURIComponent(record.access_token)}`,
    ) as import("next/server").NextRequest);
    assert.equal(res.status, 200);
    const json = (await res.json()) as { success?: boolean; html?: string };
    assert.equal(json.success, true);
    assert.ok(json.html?.includes("Development Draft"));
    assert.ok(json.html?.includes("No database synchronization"));
  });
});

describe("Phase 9E — offline workflow e2e (forced offline)", () => {
  beforeEach(async () => {
    process.env.NODE_ENV = "development";
    process.env.DEV_AUTH_BYPASS = "true";
    process.env.DEV_SUPABASE_FORCE_OFFLINE = "true";
    process.env.DEV_INSPECTOR_USER_ID = "00000000-0000-4000-8000-devsteve01";
    resetDevInspectorProfileOverrides();
    resetDevSupabaseUserIdCache();
    resetSupabaseProbeCache();
    await clearDevOfflineTestRoot();
  });

  it("profile → create → viewer → draft html", async () => {
    const { loadOfflineDevProfile } = await import("../lib/devOffline/profile.js");
    const { runOfflineCreateInspection } = await import(
      "../lib/devOffline/createInspectionOffline.js"
    );
    const { resolveReportForViewer } = await import("../lib/reportViewerServer.js");
    const { buildOfflineDevelopmentDraftHtml } = await import(
      "../lib/devOffline/draftHtml.js"
    );
    const { tryOfflineReportHtmlPreview } = await import("../lib/devOffline/htmlPreview.js");

    const profile = await loadOfflineDevProfile();
    assert.equal(profile.first_name, "Steve");

    const created = await runOfflineCreateInspection({
      clientName: "E2E Client",
      address: "500 E2E Blvd",
      inspectionType: "residential",
      userId: "00000000-0000-4000-8000-devsteve01",
    });
    assert.equal(created.success, true);
    assert.equal(created.offline_dev, true);
    assert.ok(created.reportId);
    assert.ok(created.reportUrl);

    const viewed = await resolveReportForViewer(
      String(created.reportId),
      created.inspection?.access_token,
      { offlineQuery: true },
    );
    assert.equal(viewed.offlineDev, true);
    assert.ok(viewed.payload);

    const draft = await buildOfflineDevelopmentDraftHtml(
      String(created.reportId),
      created.inspection!.access_token,
    );
    assert.ok(draft?.html.includes("Development Draft"));

    const preview = await tryOfflineReportHtmlPreview({
      reportId: String(created.reportId),
      accessTokenRaw: created.inspection!.access_token,
    });
    assert.ok(preview);
    assert.equal(preview!.status, 200);
    const previewJson = (await preview!.json()) as { html?: string };
    assert.ok(previewJson.html?.includes("Offline Development Mode") || previewJson.html?.includes("Development Draft"));
  });

  it("offline photo upload returns expected shape", async () => {
    const { createOfflineInspection } = await import("../lib/devOffline/inspection.js");
    const { handleOfflinePhotoUpload } = await import("../lib/devOffline/uploadPhoto.js");
    const record = await createOfflineInspection({
      clientName: "Photo Client",
      address: "3 Photo St",
      inspectionType: "residential",
      reportPayload: { entries: [] },
    });
    const file = new File([new Uint8Array([1, 2, 3])], "test.jpg", { type: "image/jpeg" });
    const buffer = Buffer.from(await file.arrayBuffer());
    const res = await handleOfflinePhotoUpload({
      reportId: record.id,
      accessTokenRaw: record.access_token,
      file,
      buffer,
    });
    assert.ok(res);
    assert.equal(res!.status, 200);
    const json = (await res!.json()) as {
      success?: boolean;
      photo_id?: string;
      url?: string;
      offline_dev?: boolean;
    };
    assert.equal(json.success, true);
    assert.ok(json.photo_id);
    assert.ok(json.url);
    assert.equal(json.offline_dev, true);
  });

  it("dashboard home list mapping for offline inspections", async () => {
    const { createOfflineInspection } = await import("../lib/devOffline/inspection.js");
    const { offlineInspectionToHomeListItem } = await import("../lib/devOffline/homeList.js");
    const record = await createOfflineInspection({
      clientName: "Dash Client",
      address: "4 Dash Dr",
      inspectionType: "residential",
      reportPayload: {
        cover_v1: { client_name: "Dash Client", address: "4 Dash Dr" },
      },
    });
    const item = offlineInspectionToHomeListItem(record);
    assert.equal(item.clientName, "Dash Client");
    assert.match(item.reportHref, /offline=1/);
    assert.equal(item.statusLabel, "Development Draft");
  });
});

describe("Phase 9E — withOfflineDevFallback", () => {
  beforeEach(() => {
    process.env.NODE_ENV = "development";
    process.env.DEV_AUTH_BYPASS = "true";
    process.env.DEV_SUPABASE_FORCE_OFFLINE = "true";
    resetSupabaseProbeCache();
  });

  it("runs offline branch when forced offline", async () => {
    const { withOfflineDevFallback } = await import("../lib/devOffline/fallback.js");
    const outcome = await withOfflineDevFallback({
      runOnline: async () => "online",
      runOffline: async () => "offline",
    });
    assert.equal(outcome.kind, "offline");
    if (outcome.kind === "offline") {
      assert.equal(outcome.value, "offline");
    }
  });
});

describe("Phase 9E — offline report content", () => {
  beforeEach(async () => {
    process.env.NODE_ENV = "development";
    process.env.DEV_AUTH_BYPASS = "true";
    await clearDevOfflineTestRoot();
  });

  it("handles offline report content POST", async () => {
    const { createOfflineInspection } = await import("../lib/devOffline/inspection.js");
    const { handleOfflineReportContentPost } = await import(
      "../lib/devOffline/reportContent.js"
    );
    const record = await createOfflineInspection({
      clientName: "C",
      address: "A",
      inspectionType: "residential",
      reportPayload: { entries: [] },
    });
    const res = await handleOfflineReportContentPost({
      report_id: record.id,
      access_token: record.access_token,
      entries: [
        {
          id: "obs_test_001",
          zone: "salon",
          issue: "other",
          severity: "low",
          note: "Test offline",
        },
      ],
    });
    assert.equal(res.status, 200);
    const json = (await res.json()) as { success?: boolean; offline_dev?: boolean };
    assert.equal(json.success, true);
    assert.equal(json.offline_dev, true);
  });
});
