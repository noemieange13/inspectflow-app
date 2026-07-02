/**
 * Phase 8J — Inspector Profile & Company (One-Time Setup)
 * `npm run test:inspector-profile-8j`
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";

import {
  applyProfessionalSnapshotToReportPayload,
  buildInspectionDefaultsV1,
  buildReportProfessionalSnapshotV1,
  flattenReportProfessionalSnapshot,
  INSPECTION_DEFAULTS_V1_KEY,
  isInspectorProfileConfigured,
  isSnapshotStored8J,
  normalizeInspectorProfileInput,
  parseReportProfessionalSnapshotV1,
  protectedNamesFromSnapshot,
  REPORT_PROFESSIONAL_SNAPSHOT_KEY,
  resolveProfileDefaultReportLocale,
  resolveProfileUiLocale,
  snapshotsAreLegallyDistinct,
  storedSnapshotsAreLegallyDistinct,
  toInspectorProfileV1FromSnapshot,
} from "@/lib/inspectorProfile";
import { INSPECTOR_PROFILE_PAYLOAD_KEY } from "@/lib/inspectionCoverPayload";
import { mergeProtectedTerms } from "@/lib/report_translation_engine/neverTranslate";
import { toWriterLanguage } from "@/lib/reportLocale";

const ROOT = join(process.cwd());

const SAMPLE_PROFILE = normalizeInspectorProfileInput({
  company_name: "InspectPro Inc.",
  logo_url: "data:image/png;base64,LOGO8J",
  display_name: "Steve Last",
  first_name: "Steve",
  last_name: "Last",
  professional_title: "Inspecteur en bâtiment",
  association: "AIBQ",
  certification_number: "123",
  phone: "514-555-0100",
  email: "steve@inspectpro.ca",
  city: "Montréal",
  province: "QC",
  postal_code: "H2X 1Y4",
  signature_image_url: "data:image/png;base64,SIG8J",
  preferred_ui_language: "fr-CA",
  default_client_report_language: "en-CA",
  include_weather_default: true,
});

function read(rel: string): string {
  return readFileSync(join(ROOT, rel), "utf8");
}

describe("Phase 8J inspector profile & company", () => {
  it("A) new inspector setup → profile saved (API + configured check)", () => {
    assert.ok(isInspectorProfileConfigured(SAMPLE_PROFILE));
    const api = read("app/api/inspector-profile/route.ts");
    assert.match(api, /resolveActiveOrganizationId/);
    assert.match(api, /organization_id/);
    const wizard = read("components/onboarding/InspectorSetupWizard.tsx");
    assert.match(wizard, /InspectorSetupWizard/);
    assert.match(wizard, /\/api\/inspector-profile/);
    assert.match(wizard, /Votre espace InspectFlow est prêt/);
  });

  it("B) new inspection → inspection_defaults_v1 + 8J snapshot injected", () => {
    const orgId = "11111111-2222-3333-4444-555555555555";
    const basePayload = {
      cover_v1: { client_name: "Jean", address: "123 rue Test", language: "fr" },
    };
    const enriched = applyProfessionalSnapshotToReportPayload(
      basePayload,
      SAMPLE_PROFILE,
      "2026-06-19T10:00:00.000Z",
      orgId,
    );

    const defaults = enriched[INSPECTION_DEFAULTS_V1_KEY] as {
      version: string;
      report_language: string;
      include_weather: boolean;
      organization_id: string;
    };
    assert.equal(defaults.version, "1");
    assert.equal(defaults.report_language, "en-CA");
    assert.equal(defaults.include_weather, true);
    assert.equal(defaults.organization_id, orgId);

    const stored = enriched[REPORT_PROFESSIONAL_SNAPSHOT_KEY];
    assert.ok(isSnapshotStored8J(stored));
    const snap8j = stored as {
      version: string;
      inspector: { name: string; certifications: string };
      company: { logo: string };
    };
    assert.equal(snap8j.version, "8J");
    assert.equal(snap8j.inspector.name, "Steve Last");
    assert.equal(snap8j.inspector.certifications, "AIBQ #123");
    assert.equal(snap8j.company.logo, "data:image/png;base64,LOGO8J");

    const flat = parseReportProfessionalSnapshotV1(stored);
    assert.ok(flat);
    assert.equal(flat!.inspector, "Steve Last");

    const createRoute = read("app/api/inspector/create-inspection/route.ts");
    assert.match(createRoute, /embedInspectorProfileInReportPayload/);
    assert.match(createRoute, /resolveProfileDefaultReportLocale|embedInspectorProfileInReportPayload/);
  });

  it("C) profile change after report → old snapshot unchanged", () => {
    const oldPayload = applyProfessionalSnapshotToReportPayload(
      {},
      SAMPLE_PROFILE,
      "2026-06-01T10:00:00.000Z",
    );
    const oldStored = oldPayload[REPORT_PROFESSIONAL_SNAPSHOT_KEY] as ReturnType<
      typeof buildReportProfessionalSnapshotV1
    >;

    const newProfile = normalizeInspectorProfileInput({
      ...SAMPLE_PROFILE,
      display_name: "Marie Dupont",
      certification_number: "999",
    });
    const newStored = buildReportProfessionalSnapshotV1(newProfile, "2026-06-19T12:00:00.000Z");

    assert.ok(storedSnapshotsAreLegallyDistinct(oldStored, newStored));
    assert.equal(oldStored.inspector.name, "Steve Last");
    assert.equal(newStored.inspector.name, "Marie Dupont");
    assert.notEqual(
      parseReportProfessionalSnapshotV1(oldStored)!.inspector,
      parseReportProfessionalSnapshotV1(newStored)!.inspector,
    );
  });

  it("D) UI FR + report EN via locale helpers and neverTranslate names", () => {
    assert.equal(resolveProfileUiLocale(SAMPLE_PROFILE), "fr-CA");
    assert.equal(resolveProfileDefaultReportLocale(SAMPLE_PROFILE), "en-CA");
    assert.equal(toWriterLanguage(resolveProfileDefaultReportLocale(SAMPLE_PROFILE)), "en");

    const stored = buildReportProfessionalSnapshotV1(SAMPLE_PROFILE);
    const flat = flattenReportProfessionalSnapshot(stored);
    const names = protectedNamesFromSnapshot(flat);
    assert.ok(names.includes("Steve Last"));
    assert.ok(names.includes("InspectPro Inc."));

    const observation = `Inspection réalisée par Steve Last pour InspectPro Inc.`;
    const protectedSpans = mergeProtectedTerms(observation, names);
    assert.ok(protectedSpans.includes("Steve Last"));
    assert.ok(protectedSpans.includes("InspectPro Inc."));
  });

  it("E) org with 2 inspectors → profile keyed by user_id", () => {
    const migration = read("supabase/migrations/20260618200000_inspector_profiles.sql");
    assert.match(migration, /user_id uuid primary key/);
    const migration8j = read("supabase/migrations/20260619100000_inspector_profile_8j.sql");
    assert.match(migration8j, /organization_id uuid/);
    assert.doesNotMatch(migration8j, /drop column/i);
    const lib = read("lib/inspectorProfile.ts");
    assert.match(lib, /loadInspectorProfileByUserId/);
    assert.match(lib, /\.eq\("user_id", userId\)/);
  });

  it("F) team assistant cannot modify owner profile (RLS + API source check)", () => {
    const migration = read("supabase/migrations/20260618200000_inspector_profiles.sql");
    assert.match(migration, /inspector_profiles_update_own/);
    assert.match(migration, /auth\.uid\(\) = user_id/);
    const api = read("app/api/inspector-profile/route.ts");
    assert.match(api, /resolveBearerUserId/);
    assert.match(api, /user_id: userId/);
    assert.doesNotMatch(api, /target_user_id|owner_user_id/);
  });

  it("8J snapshot backward compat — parse legacy 8I flat snapshot", () => {
    const legacy = {
      schema_version: 1,
      captured_at: "2026-06-01T10:00:00.000Z",
      company: "Legacy Co",
      inspector: "Jean Legacy",
      certification: "AIBQ #1",
      logo: null,
      signature: null,
      phone: "",
      email: "",
    };
    const parsed = parseReportProfessionalSnapshotV1(legacy);
    assert.ok(parsed);
    assert.equal(parsed!.source_version, "8I");
    assert.equal(parsed!.inspector, "Jean Legacy");
    const legacyPdf = toInspectorProfileV1FromSnapshot(parsed!);
    assert.equal(legacyPdf.compagnie, "Legacy Co");
  });

  it("buildInspectionDefaultsV1 respects include_weather_default false", () => {
    const profile = normalizeInspectorProfileInput({
      ...SAMPLE_PROFILE,
      include_weather_default: false,
    });
    const defaults = buildInspectionDefaultsV1(profile, "org-1");
    assert.equal(defaults.include_weather, false);
  });

  it("storage upload route and migration exist", () => {
    assert.match(read("app/api/professional-asset/upload/route.ts"), /professional-assets/);
    assert.match(read("supabase/migrations/20260619100000_inspector_profile_8j.sql"), /professional-assets/);
    assert.match(read("docs/ux-audit-before-8j-inspector-profile.md"), /Phase 8J/);
  });

  it("PDF path uses snapshot parse only — Edge unchanged", () => {
    const payload = {
      [REPORT_PROFESSIONAL_SNAPSHOT_KEY]: buildReportProfessionalSnapshotV1(SAMPLE_PROFILE),
    };
    assert.ok(parseReportProfessionalSnapshotV1(payload[REPORT_PROFESSIONAL_SNAPSHOT_KEY]));
    const ensureHtml = read("lib/ensureReportPayloadHtml.ts");
    assert.match(ensureHtml, /ensureLegacyInspectorPayloadFromSnapshot/);
    const edge = read("supabase/functions/reports-pdf/index.ts");
    assert.doesNotMatch(edge, /inspection_defaults_v1/);
  });
});
