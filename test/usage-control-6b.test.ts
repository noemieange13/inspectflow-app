/**
 * Phase 6B — usage_control (plans & usage)
 * `npm run test:usage-control-6b`
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";

import {
  buildAccessContext,
  canEditInspection,
  canGeneratePdf,
  canUploadPhotos,
  canViewInspection,
} from "@/lib/access_control";
import {
  DEFAULT_PLAN_LIMITS,
  checkUsageLimit,
  getUsagePeriodBounds,
  isSameUsagePeriod,
  loadOrganizationPlan,
  resolvePlanLimits,
  trackUsage,
  USAGE_MONITOR_ONLY,
} from "@/lib/usage_control";

const ORG_ID = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";

type UsageRow = {
  id: string;
  organization_id: string;
  period_start: string;
  period_end: string;
  inspections_created: number;
  photos_uploaded: number;
  ai_photos_processed: number;
  pdf_generated: number;
  storage_used_mb: number;
};

function createUsageMock(initial?: Partial<UsageRow>) {
  const usageRows: UsageRow[] = [];
  const planRows: Array<{
    organization_id: string;
    plan: string;
    limits: Record<string, unknown>;
    usage_period: string;
  }> = [];

  if (initial) {
    usageRows.push({
      id: "usage-1",
      organization_id: ORG_ID,
      period_start: initial.period_start ?? getUsagePeriodBounds().period_start,
      period_end: initial.period_end ?? getUsagePeriodBounds().period_end,
      inspections_created: initial.inspections_created ?? 0,
      photos_uploaded: initial.photos_uploaded ?? 0,
      ai_photos_processed: initial.ai_photos_processed ?? 0,
      pdf_generated: initial.pdf_generated ?? 0,
      storage_used_mb: initial.storage_used_mb ?? 0,
    });
  }

  const supabase = {
    from(table: string) {
      if (table === "organization_plans") {
        return {
          select: () => ({
            eq: (_col: string, orgId: string) => ({
              maybeSingle: async () => {
                const row = planRows.find((p) => p.organization_id === orgId);
                return row
                  ? { data: row, error: null }
                  : { data: null, error: null };
              },
            }),
          }),
        };
      }

      if (table === "organization_usage") {
        return {
          select: () => ({
            eq: (col: string, val: string) => {
              const filters: Record<string, string> = { [col]: val };
              return {
                eq: (col2: string, val2: string) => {
                  filters[col2] = val2;
                  return {
                    maybeSingle: async () => {
                      const row = usageRows.find(
                        (r) =>
                          r.organization_id === filters.organization_id &&
                          r.period_start === filters.period_start,
                      );
                      return row
                        ? { data: row, error: null }
                        : { data: null, error: null };
                    },
                  };
                },
              };
            },
          }),
          insert: (payload: Record<string, unknown>) => ({
            then: undefined,
            catch: undefined,
            finally: undefined,
            [Symbol.toStringTag]: "Promise",
            thenResolve: async () => {
              usageRows.push({
                id: `usage-${usageRows.length + 1}`,
                organization_id: String(payload.organization_id),
                period_start: String(payload.period_start),
                period_end: String(payload.period_end),
                inspections_created: Number(payload.inspections_created ?? 0),
                photos_uploaded: Number(payload.photos_uploaded ?? 0),
                ai_photos_processed: Number(payload.ai_photos_processed ?? 0),
                pdf_generated: Number(payload.pdf_generated ?? 0),
                storage_used_mb: Number(payload.storage_used_mb ?? 0),
              });
              return { error: null };
            },
          }),
          update: (payload: Record<string, unknown>) => ({
            eq: (_col: string, id: string) => ({
              then: undefined,
              [Symbol.toStringTag]: "Promise",
              thenResolve: async () => {
                const row = usageRows.find((r) => r.id === id);
                if (row) {
                  for (const [k, v] of Object.entries(payload)) {
                    if (k !== "updated_at") {
                      (row as Record<string, unknown>)[k] = v;
                    }
                  }
                }
                return { error: null };
              },
            }),
          }),
        };
      }

      throw new Error(`unexpected table ${table}`);
    },
  };

  // Patch insert/update to return proper promises
  const usageTable = supabase.from("organization_usage") as {
    insert: (payload: Record<string, unknown>) => Promise<{ error: null }>;
    update: (payload: Record<string, unknown>) => {
      eq: (col: string, id: string) => Promise<{ error: null }>;
    };
  };

  const origInsert = usageTable.insert.bind(usageTable);
  usageTable.insert = (payload: Record<string, unknown>) =>
    (origInsert(payload) as { thenResolve: () => Promise<{ error: null }> }).thenResolve();

  const origUpdate = usageTable.update.bind(usageTable);
  usageTable.update = (payload: Record<string, unknown>) => ({
    eq: (_col: string, id: string) =>
      (origUpdate(payload).eq(_col, id) as { thenResolve: () => Promise<{ error: null }> })
        .thenResolve(),
  });

  return {
    supabase: supabase as never,
    usageRows,
    planRows,
  };
}

describe("Phase 6B checkUsageLimit", () => {
  it("A) trial 10 inspections — limite atteinte → allowed false", () => {
    const limits = resolvePlanLimits("trial", DEFAULT_PLAN_LIMITS.trial);
    const result = checkUsageLimit({
      limits,
      usage: {
        inspections_created: 10,
        photos_uploaded: 0,
        ai_photos_processed: 0,
        pdf_generated: 0,
        storage_used_mb: 0,
      },
      metric: "inspections_created",
    });
    assert.equal(result.allowed, false);
    if (!result.allowed) {
      assert.equal(result.reason, "limit_reached");
      assert.equal(result.metric, "inspections_created");
      assert.equal(result.limit, 10);
    }
  });

  it("B) enterprise unlimited → allowed true", () => {
    const limits = resolvePlanLimits("enterprise", DEFAULT_PLAN_LIMITS.enterprise);
    const result = checkUsageLimit({
      limits,
      usage: {
        inspections_created: 99999,
        photos_uploaded: 99999,
        ai_photos_processed: 99999,
        pdf_generated: 99999,
        storage_used_mb: 999999,
      },
      metric: "inspections_created",
    });
    assert.equal(result.allowed, true);
  });
});

describe("Phase 6B trackUsage", () => {
  it("C) upload photo incrémente photos_uploaded", async () => {
    const mock = createUsageMock();
    const ref = new Date("2026-06-15T12:00:00.000Z");

    const first = await trackUsage(mock.supabase, {
      organizationId: ORG_ID,
      metric: "photos_uploaded",
      amount: 1,
      referenceDate: ref,
    });
    assert.equal(first.tracked, true);
    assert.equal(mock.usageRows.length, 1);
    assert.equal(mock.usageRows[0]?.photos_uploaded, 1);

    const second = await trackUsage(mock.supabase, {
      organizationId: ORG_ID,
      metric: "photos_uploaded",
      amount: 1,
      referenceDate: ref,
    });
    assert.equal(second.tracked, true);
    assert.equal(mock.usageRows[0]?.photos_uploaded, 2);
  });

  it("D) changement de mois — nouvelle période (compteur repart à zéro)", async () => {
    const june = new Date("2026-06-28T12:00:00.000Z");
    const july = new Date("2026-07-02T12:00:00.000Z");
    const junePeriod = getUsagePeriodBounds(june);
    const julyPeriod = getUsagePeriodBounds(july);

    assert.notEqual(junePeriod.period_start, julyPeriod.period_start);
    assert.equal(isSameUsagePeriod(junePeriod.period_start, june), true);
    assert.equal(isSameUsagePeriod(junePeriod.period_start, july), false);

    const mock = createUsageMock({
      period_start: junePeriod.period_start,
      period_end: junePeriod.period_end,
      inspections_created: 7,
    });

    await trackUsage(mock.supabase, {
      organizationId: ORG_ID,
      metric: "inspections_created",
      amount: 1,
      referenceDate: july,
    });

    assert.equal(mock.usageRows.length, 2);
    const julyRow = mock.usageRows.find((r) => r.period_start === julyPeriod.period_start);
    assert.ok(julyRow);
    assert.equal(julyRow?.inspections_created, 1);
  });

  it("E) org sans plan en base → fallback solo", async () => {
    const mock = createUsageMock();
    const plan = await loadOrganizationPlan(mock.supabase, ORG_ID);
    assert.equal(plan.plan, "solo");
    assert.equal(plan.limits.inspections_per_month, DEFAULT_PLAN_LIMITS.solo.inspections_per_month);
  });
});

describe("Phase 6B configuration", () => {
  it("monitor_only actif globalement", () => {
    assert.equal(USAGE_MONITOR_ONLY, true);
  });
});

describe("Phase 6B non-régression", () => {
  const root = join(process.cwd());

  it("6A permissions — permissions.ts inchangé (fonctions exportées)", () => {
    const perms = readFileSync(join(root, "lib/access_control/permissions.ts"), "utf8");
    assert.match(perms, /export function canViewInspection/);
    assert.match(perms, /export function canEditInspection/);
    assert.match(perms, /export function canUploadPhotos/);
    assert.match(perms, /export function canGeneratePdf/);
    assert.match(perms, /export function canManageOrganization/);
    assert.doesNotMatch(perms, /usage_control/);
  });

  it("6A permissions — comportement solo owner intact", () => {
    const USER = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
    const ORG = "11111111-1111-1111-1111-111111111111";
    const c = buildAccessContext(
      {
        id: USER,
        membership: { organization_id: ORG, role: "owner", status: "active" },
      },
      {
        report_id: "33333333-3333-3333-3333-333333333333",
        inspection_id: null,
        organization_id: ORG,
        owner_user_id: USER,
      },
    );
    assert.equal(canViewInspection(c), true);
    assert.equal(canUploadPhotos(c), true);
    assert.equal(canGeneratePdf(c), true);
    assert.equal(canEditInspection(c), true);
  });

  it("PDF pipeline — reports-pdf non modifié par 6B", () => {
    const pdf = readFileSync(join(root, "supabase/functions/reports-pdf/index.ts"), "utf8");
    assert.match(pdf, /claim_report_lock/);
    assert.doesNotMatch(pdf, /usage_control/);
    const trigger = readFileSync(join(root, "app/api/trigger-inspection/route.ts"), "utf8");
    assert.match(trigger, /invokeReportsPdf/);
    assert.doesNotMatch(trigger, /checkUsageLimit.*403/);
  });

  it("IA pipeline — analyzeInspectionPhoto non modifié par 6B", () => {
    const ia = readFileSync(join(root, "lib/analyzeInspectionPhoto.ts"), "utf8");
    assert.doesNotMatch(ia, /usage_control/);
    const jobs = readFileSync(join(root, "lib/photoAnalysisJobs.ts"), "utf8");
    assert.match(jobs, /analyzeInspectionPhotoVision/);
    assert.match(jobs, /trackUsageSafe/);
  });

  it("photos pipeline — schéma upload inchangé (assertReportResourceAccess)", () => {
    const upload = readFileSync(join(root, "app/api/upload-photo/route.ts"), "utf8");
    assert.match(upload, /assertReportResourceAccess/);
    assert.match(upload, /MAX_PHOTOS_PER_INSPECTION/);
    assert.doesNotMatch(upload, /403.*usage/);
  });
});
