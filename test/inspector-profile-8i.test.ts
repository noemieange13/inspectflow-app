/**
 * Phase 8I — Inspector Profile + Final Report Alignment
 * `npm run test:inspector-profile-8i`
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";

import {
  applyProfessionalSnapshotToReportPayload,
  buildReportProfessionalSnapshotV1,
  ensureLegacyInspectorPayloadFromSnapshot,
  formatCertificationLabel,
  hasReportProfessionalSnapshot,
  normalizeInspectorProfileInput,
  parseReportProfessionalSnapshotV1,
  REPORT_PROFESSIONAL_SNAPSHOT_KEY,
  resolveDeliveryProfileGate,
  snapshotsAreLegallyDistinct,
  toCoverInspectorFieldsFromSnapshot,
  toInspectorProfileV1FromSnapshot,
} from "@/lib/inspectorProfile";
import { INSPECTOR_PROFILE_PAYLOAD_KEY } from "@/lib/inspectionCoverPayload";

const ROOT = join(process.cwd());

const FORBIDDEN_PATHS = [
  "supabase/functions/reports-pdf/index.ts",
  "lib/observation_ai_engine/index.ts",
  "lib/photoUploadQueueIdb.ts",
];

const SAMPLE_PROFILE = normalizeInspectorProfileInput({
  company_name: "InspectPro Inc.",
  logo_url: "data:image/png;base64,LOGO8I",
  first_name: "Steve",
  last_name: "Last",
  association: "AIBQ",
  certification_number: "123",
  phone: "514-555-0100",
  email: "steve@inspectpro.ca",
  signature_image_url: "data:image/png;base64,SIG8I",
});

function read(rel: string): string {
  return readFileSync(join(ROOT, rel), "utf8");
}

describe("Phase 8I inspector profile", () => {
  it("A) create profile → new inspection prefilled with snapshot", () => {
    const basePayload = {
      cover_v1: { client_name: "Jean", address: "123 rue Test", language: "fr" },
    };
    const enriched = applyProfessionalSnapshotToReportPayload(basePayload, SAMPLE_PROFILE);
    assert.ok(hasReportProfessionalSnapshot(enriched));
    const stored = enriched[REPORT_PROFESSIONAL_SNAPSHOT_KEY];
    const snap = parseReportProfessionalSnapshotV1(stored)!;
    assert.equal(snap.inspector, "Steve Last");
    assert.equal(snap.certification, "AIBQ #123");
    assert.equal(snap.logo, "data:image/png;base64,LOGO8I");

    const legacy = enriched[INSPECTOR_PROFILE_PAYLOAD_KEY] as { nom: string; logo_data_url: string };
    assert.equal(legacy.nom, "Steve Last");
    assert.equal(legacy.logo_data_url, "data:image/png;base64,LOGO8I");

    const createRoute = read("app/api/inspector/create-inspection/route.ts");
    assert.match(createRoute, /embedInspectorProfileInReportPayload/);
    const embed = read("lib/embedInspectorProfileInReportPayload.ts");
    assert.match(embed, /applyProfessionalSnapshotToReportPayload/);
  });

  it("B) modify profile → old report snapshot unchanged (immutability)", () => {
    const oldProfile = { ...SAMPLE_PROFILE };
    const oldPayload = applyProfessionalSnapshotToReportPayload({}, oldProfile, "2026-06-01T10:00:00.000Z");
    const oldSnap = parseReportProfessionalSnapshotV1(
      oldPayload[REPORT_PROFESSIONAL_SNAPSHOT_KEY],
    )!;
    const newProfile = normalizeInspectorProfileInput({
      ...SAMPLE_PROFILE,
      display_name: "Marie Last",
      first_name: "Marie",
      certification_number: "999",
    });
    const newSnap = parseReportProfessionalSnapshotV1(
      buildReportProfessionalSnapshotV1(newProfile, "2026-06-18T12:00:00.000Z"),
    )!;

    assert.ok(snapshotsAreLegallyDistinct(oldSnap, newSnap));
    assert.equal(oldSnap.inspector, "Steve Last");
    assert.equal(newSnap.inspector, "Marie Last");
    assert.notEqual(oldSnap.inspector, newSnap.inspector);
  });

  it("C) logo in snapshot maps to legacy inspector_profile_v1", () => {
    const snap = parseReportProfessionalSnapshotV1(buildReportProfessionalSnapshotV1(SAMPLE_PROFILE))!;
    const legacy = toInspectorProfileV1FromSnapshot(snap);
    assert.equal(legacy.logo_data_url, "data:image/png;base64,LOGO8I");
    assert.match(legacy.logo_data_url!, /^data:image/);
  });

  it("D) signature preserved through snapshot → legacy mapping", () => {
    const snap = parseReportProfessionalSnapshotV1(buildReportProfessionalSnapshotV1(SAMPLE_PROFILE))!;
    assert.equal(snap.signature, "data:image/png;base64,SIG8I");
    const legacy = toInspectorProfileV1FromSnapshot(snap);
    assert.equal(legacy.signature_data_url, "data:image/png;base64,SIG8I");
  });

  it("E) report without profile → delivery asks configuration", () => {
    const gateNoProfile = resolveDeliveryProfileGate({}, { userHasProfile: false });
    assert.equal(gateNoProfile.blocked, true);
    if (gateNoProfile.blocked) {
      assert.equal(gateNoProfile.reason, "no_profile");
    }

    const gateNeedsAttach = resolveDeliveryProfileGate({}, { userHasProfile: true });
    assert.equal(gateNeedsAttach.blocked, true);
    if (gateNeedsAttach.blocked) {
      assert.equal(gateNeedsAttach.reason, "no_snapshot");
      assert.equal(gateNeedsAttach.canAttachSnapshot, true);
    }

    const delivery = read("components/InspectionDeliveryWorkspace.tsx");
    assert.match(delivery, /InspectorProfileDeliveryPrompt/);
    assert.match(delivery, /deliveryBlocked/);
    assert.match(delivery, /Complétons votre profil professionnel|InspectorProfileDeliveryPrompt/);

    const actions = read("components/DeliveryActions.tsx");
    assert.match(actions, /deliveryBlocked/);
  });

  it("PDF path derives legacy keys from snapshot without Edge change", () => {
    const payload = {
      [REPORT_PROFESSIONAL_SNAPSHOT_KEY]: buildReportProfessionalSnapshotV1(SAMPLE_PROFILE),
    };
    const derived = ensureLegacyInspectorPayloadFromSnapshot(payload);
    assert.ok(derived[INSPECTOR_PROFILE_PAYLOAD_KEY]);
    const ensureHtml = read("lib/ensureReportPayloadHtml.ts");
    assert.match(ensureHtml, /ensureLegacyInspectorPayloadFromSnapshot/);
    const buildHtml = read("lib/buildInspectionReportHtml.ts");
    assert.match(buildHtml, /ensureLegacyInspectorPayloadFromSnapshot/);
    const edge = read("supabase/functions/reports-pdf/index.ts");
    assert.doesNotMatch(edge, /report_professional_snapshot_v1/);
  });

  it("cover inspector fields derived from snapshot", () => {
    const snap = parseReportProfessionalSnapshotV1(buildReportProfessionalSnapshotV1(SAMPLE_PROFILE))!;
    const cover = toCoverInspectorFieldsFromSnapshot(snap);
    assert.equal(cover.inspecteur_nom, "Steve Last");
    assert.equal(cover.inspecteur_numero_certification, formatCertificationLabel(SAMPLE_PROFILE));
    assert.equal(cover.compagnie, "InspectPro Inc.");
  });

  it("non-regression — forbidden areas unchanged", () => {
    for (const rel of FORBIDDEN_PATHS) {
      const src = read(rel);
      assert.doesNotMatch(src, /inspector_profiles/);
      assert.doesNotMatch(src, /report_professional_snapshot_v1/);
    }
    const billing = read("app/api/billing/summary/route.ts");
    assert.doesNotMatch(billing, /inspector_profiles/);
    const org = read("supabase/migrations/20260439120000_organizations_access_control.sql");
    assert.doesNotMatch(org, /inspector_profiles/);
  });

  it("settings UI and API routes exist", () => {
    assert.match(read("app/api/inspector-profile/route.ts"), /resolveBearerUserId/);
    assert.match(read("app/dashboard/settings/profile/page.tsx"), /Profil inspecteur/);
    assert.match(read("components/InspectorNav.tsx"), /settings\/profile/);
    assert.match(read("supabase/migrations/20260618200000_inspector_profiles.sql"), /inspector_profiles/);
    assert.match(read("supabase/migrations/20260619100000_inspector_profile_8j.sql"), /organization_id/);
  });
});
