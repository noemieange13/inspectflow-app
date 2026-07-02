import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";

const root = join(import.meta.dirname, "..");

function read(rel: string): string {
  return readFileSync(join(root, rel), "utf8");
}

describe("Phase 9C — DEV_INSPECTOR global integration", () => {
  it("single source of truth in devInspectorMode", () => {
    const mod = read("lib/devInspectorMode.ts");
    assert.match(mod, /export const DEV_INSPECTOR/);
    assert.match(mod, /id: "dev-steve"/);
    assert.match(mod, /last_name: "Charbonneau"/);
    assert.match(mod, /DEV_AUTH_BYPASS/);
    assert.match(mod, /stampDevInspectorAttribution/);
    assert.match(mod, /enrichDevInspectorAuditMetadata/);
  });

  it("auth bypass wired through resolveBearerUserId and resolveRequestAuth", () => {
    assert.match(read("lib/supabaseAuthFromRequest.ts"), /isDevAuthBypass/);
    assert.match(read("lib/supabaseAuthFromRequest.ts"), /resolveDevSupabaseUserId/);
    assert.match(read("lib/supabaseRequestAuth.ts"), /isDevAuthBypass/);
    assert.match(read("lib/supabaseRequestAuth.ts"), /resolveDevSupabaseUserId/);
  });

  it("inspector-profile and embed use dev profile store", () => {
    assert.match(read("app/api/inspector-profile/route.ts"), /buildDevInspectorProfileInput/);
    assert.match(read("lib/embedInspectorProfileInReportPayload.ts"), /buildDevInspectorProfileInput/);
    assert.match(read("lib/devInspectorProfileStore.ts"), /DEV_INSPECTOR/);
  });

  it("creation and attribution stamp dev inspector on payloads", () => {
    assert.match(read("app/api/inspector/create-inspection/route.ts"), /stampDevInspectorAttribution/);
    assert.match(read("lib/services/pipeline.ts"), /inspectorAttribution/);
    assert.match(read("lib/inspection_audit_trail/index.ts"), /enrichDevInspectorAuditMetadata/);
  });

  it("UI loads profile and creates inspection without token in dev mode", () => {
    const home = read("components/InspectorHome.tsx");
    const sheet = read("components/NewInspectionSheet.tsx");
    assert.match(home, /devDashboardMode/);
    assert.match(home, /inspector-profile/);
    assert.match(sheet, /devDashboardMode/);
    assert.match(sheet, /useDevApi/);
    assert.match(sheet, /\/api\/inspector\/create-inspection/);
  });

  it("document learning resolves dev-steve without JWT", () => {
    assert.match(read("lib/inspectorLearning.ts"), /resolveDevInspectorLearningId/);
  });
});
