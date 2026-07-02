/**
 * Phase 6C — team_collaboration
 * `npm run test:team-collaboration-6c`
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";

import {
  buildAccessContext,
  canEditInspection,
  canGeneratePdf,
  canViewInspection,
  hasInspectionAssignment,
} from "@/lib/access_control";

const USER_ADMIN = "cccccccc-cccc-cccc-cccc-cccccccccccc";
const USER_INSPECTOR = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
const USER_ASSIST = "dddddddd-dddd-dddd-dddd-dddddddddddd";
const USER_OWNER = "ffffffff-ffff-ffff-ffff-ffffffffffff";
const ORG = "22222222-2222-2222-2222-222222222222";
const REPORT = "33333333-3333-3333-3333-333333333333";

function teamCtx(
  userId: string,
  orgRole: "owner" | "admin" | "inspector" | "assistant",
  ownerUserId: string,
  assignment?: { role: "lead_inspector" | "assistant"; status: "active" | "removed" } | null,
) {
  return buildAccessContext(
    {
      id: userId,
      membership: {
        organization_id: ORG,
        role: orgRole,
        status: "active",
      },
    },
    {
      report_id: REPORT,
      inspection_id: null,
      organization_id: ORG,
      owner_user_id: ownerUserId,
    },
    assignment ?? null,
  );
}

describe("Phase 6C team collaboration", () => {
  it("A) admin assigne inspecteur → accès OK via lead_inspector", () => {
    const c = teamCtx(USER_INSPECTOR, "inspector", USER_ADMIN, {
      role: "lead_inspector",
      status: "active",
    });
    assert.equal(hasInspectionAssignment(c), true);
    assert.equal(canViewInspection(c), true);
    assert.equal(canEditInspection(c), true);
    assert.equal(canGeneratePdf(c), true);
  });

  it("B) inspecteur non assigné → accès refusé", () => {
    const c = teamCtx(USER_INSPECTOR, "inspector", USER_ADMIN, null);
    assert.equal(hasInspectionAssignment(c), false);
    assert.equal(canViewInspection(c), false);
    assert.equal(canEditInspection(c), false);
  });

  it("C) assistant assigné → brouillon OK, PDF interdit", () => {
    const c = teamCtx(USER_ASSIST, "assistant", USER_ADMIN, {
      role: "assistant",
      status: "active",
    });
    assert.equal(canViewInspection(c), true);
    assert.equal(canEditInspection(c), true);
    assert.equal(canGeneratePdf(c), false);
  });

  it("D) retrait assignation → accès retiré", () => {
    const c = teamCtx(USER_INSPECTOR, "inspector", USER_ADMIN, {
      role: "lead_inspector",
      status: "removed",
    });
    assert.equal(hasInspectionAssignment(c), false);
    assert.equal(canViewInspection(c), false);
  });

  it("E) ancien rapport solo sans org → propriétaire OK", () => {
    const c = buildAccessContext(
      { id: USER_OWNER, membership: null },
      {
        report_id: REPORT,
        inspection_id: null,
        organization_id: null,
        owner_user_id: USER_OWNER,
      },
      null,
    );
    assert.equal(hasInspectionAssignment(c), false);
    assert.equal(canViewInspection(c), true);
    assert.equal(canEditInspection(c), true);
    assert.equal(canGeneratePdf(c), true);
  });
});

describe("Phase 6C non-régression", () => {
  const root = join(process.cwd());

  it("6A permissions — owner/admin inchangés", () => {
    const admin = teamCtx(USER_ADMIN, "admin", USER_OWNER, null);
    assert.equal(canViewInspection(admin), true);
    assert.equal(canGeneratePdf(admin), true);
  });

  it("6B usage_control — inchangé", () => {
    const usage = readFileSync(join(root, "lib/usage_control/constants.ts"), "utf8");
    assert.match(usage, /USAGE_MONITOR_ONLY/);
    assert.doesNotMatch(
      readFileSync(join(root, "lib/usage_control/trackUsage.ts"), "utf8"),
      /inspection_assignments/,
    );
  });

  it("PDF pipeline — reports-pdf intact", () => {
    const pdf = readFileSync(join(root, "supabase/functions/reports-pdf/index.ts"), "utf8");
    assert.doesNotMatch(pdf, /inspection_assignments/);
  });

  it("photos pipeline — schema inchangé", () => {
    const upload = readFileSync(join(root, "app/api/upload-photo/route.ts"), "utf8");
    assert.doesNotMatch(upload, /inspection_assignments/);
  });

  it("IA — analyzeInspectionPhoto intact", () => {
    const ia = readFileSync(join(root, "lib/analyzeInspectionPhoto.ts"), "utf8");
    assert.doesNotMatch(ia, /team_collaboration/);
  });

  it("audit — inspection_assigned / unassigned", () => {
    const types = readFileSync(join(root, "lib/inspection_audit_trail/types.ts"), "utf8");
    assert.match(types, /inspection_assigned/);
    assert.match(types, /inspection_unassigned/);
  });
});
