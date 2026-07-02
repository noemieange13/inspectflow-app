/**
 * Phase 6A — access_control
 * `npm run test:access-control-6a`
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";

import {
  buildAccessContext,
  canEditInspection,
  canGeneratePdf,
  canManageOrganization,
  canUploadPhotos,
  canViewInspection,
} from "@/lib/access_control";

const USER_A = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
const USER_B = "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb";
const USER_ADMIN = "cccccccc-cccc-cccc-cccc-cccccccccccc";
const USER_ASSIST = "dddddddd-dddd-dddd-dddd-dddddddddddd";
const USER_DISABLED = "eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee";
const ORG_PERSONAL = "11111111-1111-1111-1111-111111111111";
const ORG_COMPANY = "22222222-2222-2222-2222-222222222222";
const REPORT = "33333333-3333-3333-3333-333333333333";

function ctx(
  userId: string,
  role: "owner" | "admin" | "inspector" | "assistant",
  status: "active" | "invited" | "disabled",
  orgId: string,
  ownerUserId: string,
) {
  return buildAccessContext(
    {
      id: userId,
      membership: {
        organization_id: orgId,
        role,
        status,
      },
    },
    {
      report_id: REPORT,
      inspection_id: null,
      organization_id: orgId,
      owner_user_id: ownerUserId,
    },
  );
}

describe("Phase 6A access_control", () => {
  it("A) utilisateur solo — org personal owner conserve l'accès", () => {
    const c = ctx(USER_A, "owner", "active", ORG_PERSONAL, USER_A);
    assert.equal(canViewInspection(c), true);
    assert.equal(canEditInspection(c), true);
    assert.equal(canUploadPhotos(c), true);
    assert.equal(canGeneratePdf(c), true);
  });

  it("B) inspecteur A hors organisation B — cannot view", () => {
    const c = ctx(USER_A, "inspector", "active", ORG_PERSONAL, USER_B);
    c.inspection.organization_id = ORG_COMPANY;
    c.user.membership!.organization_id = ORG_PERSONAL;
    assert.equal(canViewInspection(c), false);
  });

  it("C) admin organisation — peut voir inspections équipe", () => {
    const c = ctx(USER_ADMIN, "admin", "active", ORG_COMPANY, USER_A);
    assert.equal(canViewInspection(c), true);
    assert.equal(canEditInspection(c), true);
    assert.equal(canGeneratePdf(c), true);
  });

  it("D) assistant — upload + brouillon, pas PDF", () => {
    const own = ctx(USER_ASSIST, "assistant", "active", ORG_COMPANY, USER_ASSIST);
    assert.equal(canUploadPhotos(own), true);
    assert.equal(canEditInspection(own), true);
    assert.equal(canGeneratePdf(own), false);

    const team = ctx(USER_ASSIST, "assistant", "active", ORG_COMPANY, USER_A);
    assert.equal(canViewInspection(team), false);
    assert.equal(canGeneratePdf(team), false);
  });

  it("E) utilisateur disabled — aucun accès", () => {
    const c = ctx(USER_DISABLED, "owner", "disabled", ORG_PERSONAL, USER_DISABLED);
    assert.equal(canViewInspection(c), false);
    assert.equal(canEditInspection(c), false);
    assert.equal(canUploadPhotos(c), false);
    assert.equal(canGeneratePdf(c), false);
    assert.equal(canManageOrganization(c), false);
  });

  it("F) owner — toutes permissions", () => {
    const c = ctx(USER_A, "owner", "active", ORG_COMPANY, USER_A);
    assert.equal(canViewInspection(c), true);
    assert.equal(canEditInspection(c), true);
    assert.equal(canUploadPhotos(c), true);
    assert.equal(canGeneratePdf(c), true);
    assert.equal(canManageOrganization(c), true);
  });
});

describe("Phase 6A non-régression (fichiers protégés inchangés)", () => {
  const root = join(process.cwd());

  it("photos pipeline — pas de organization_id sur photos", () => {
    const upload = readFileSync(join(root, "app/api/upload-photo/route.ts"), "utf8");
    assert.match(upload, /assertReportResourceAccess/);
    assert.doesNotMatch(upload, /photos\.organization_id/);
  });

  it("observation_id — inchangé", () => {
    const obs = readFileSync(join(root, "lib/observationIds.ts"), "utf8");
    assert.match(obs, /export function isObservationId/);
  });

  it("report_photo_selection — inchangé", () => {
    const sel = readFileSync(join(root, "lib/reportPhotoSelectionPayload.ts"), "utf8");
    assert.match(sel, /report_photo_selection/);
  });

  it("PDF pipeline — reports-pdf non modifié par 6A", () => {
    const pdf = readFileSync(join(root, "supabase/functions/reports-pdf/index.ts"), "utf8");
    assert.match(pdf, /claim_report_lock/);
    assert.doesNotMatch(pdf, /organization_id/);
  });

  it("audit 5B enrichi — access_denied", () => {
    const types = readFileSync(join(root, "lib/inspection_audit_trail/types.ts"), "utf8");
    assert.match(types, /access_denied/);
    const mig = readFileSync(
      join(root, "supabase/migrations/20260439120000_organizations_access_control.sql"),
      "utf8",
    );
    assert.match(mig, /access_denied/);
  });

  it("monitoring 5C — inchangé", () => {
    const mon = readFileSync(join(root, "lib/system_monitoring/index.ts"), "utf8");
    assert.doesNotMatch(mon, /access_control/);
  });
});
