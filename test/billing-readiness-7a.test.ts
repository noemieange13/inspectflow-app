/**
 * Phase 7A — billing readiness
 * `npm run test:billing-readiness-7a`
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";

import {
  BILLING_MONITOR_ONLY,
  changeOrganizationPlan,
  computeDaysRemainingTrial,
  computeEffectiveBillingStatus,
  computeUpgradeRecommended,
  ensureBillingAccount,
  fallbackBillingAccount,
  recordBillingEvent,
} from "@/lib/billing";
import { computeUsagePercent } from "@/lib/usage_control";
import type { OrganizationUsageSnapshot } from "@/lib/usage_control/types";

const ORG = "22222222-2222-2222-2222-222222222222";
const ORG_LEGACY = "11111111-1111-1111-1111-111111111111";

type Row = Record<string, unknown>;

function mockSupabase() {
  const billingAccounts: Row[] = [];
  const billingEvents: Row[] = [];
  const organizationPlans: Row[] = [{ organization_id: ORG, plan: "solo" }];
  let idSeq = 0;

  return {
    billingAccounts,
    billingEvents,
    organizationPlans,
    client: {
      from(table: string) {
        if (table === "billing_accounts") {
          return {
            select: () => ({
              eq: (_col: string, orgId: string) => ({
                maybeSingle: async () => {
                  const row = billingAccounts.find((r) => r.organization_id === orgId);
                  return { data: row ?? null, error: null };
                },
              }),
            }),
            insert: (payload: Row) => ({
              select: () => ({
                single: async () => {
                  idSeq += 1;
                  const row = {
                    ...payload,
                    id: `bill-${idSeq}`,
                    created_at: new Date().toISOString(),
                    updated_at: new Date().toISOString(),
                  };
                  billingAccounts.push(row);
                  return { data: row, error: null };
                },
              }),
            }),
            update: (patch: Row) => ({
              eq: () => ({ error: null, then: async () => ({ error: null }) }),
            }),
          };
        }
        if (table === "billing_events") {
          return {
            insert: (payload: Row) => ({
              select: () => ({
                single: async () => {
                  idSeq += 1;
                  const row = { ...payload, id: `bev-${idSeq}`, created_at: new Date().toISOString() };
                  billingEvents.push(row);
                  return { data: row, error: null };
                },
              }),
            }),
          };
        }
        if (table === "organization_plans") {
          return {
            select: () => ({
              eq: (_c: string, orgId: string) => ({
                maybeSingle: async () => {
                  const row = organizationPlans.find((p) => p.organization_id === orgId);
                  return { data: row ?? null, error: null };
                },
              }),
            }),
            upsert: async (payload: Row) => {
              const idx = organizationPlans.findIndex(
                (p) => p.organization_id === payload.organization_id,
              );
              if (idx >= 0) organizationPlans[idx] = { ...organizationPlans[idx], ...payload };
              else organizationPlans.push(payload);
              return { error: null };
            },
          };
        }
        if (table === "reports") {
          return {
            select: () => ({
              eq: () => ({
                order: () => ({
                  limit: () => ({
                    maybeSingle: async () => ({ data: null, error: null }),
                  }),
                }),
              }),
            }),
          };
        }
        return {};
      },
    },
  };
}

function usageSnapshot(overrides?: Partial<OrganizationUsageSnapshot>): OrganizationUsageSnapshot {
  const limits = {
    inspections_per_month: 10,
    ai_photos_per_month: 20,
    members: 1,
    storage_gb: 1,
  };
  const usage = {
    inspections_created: 0,
    photos_uploaded: 0,
    ai_photos_processed: 0,
    pdf_generated: 0,
    storage_used_mb: 0,
  };
  const base: OrganizationUsageSnapshot = {
    organization_id: ORG,
    plan: "trial",
    limits,
    usage_period: "month",
    period_start: "2026-06-01T00:00:00.000Z",
    period_end: "2026-07-01T00:00:00.000Z",
    usage,
    usage_percent: computeUsagePercent(limits, usage),
  };
  return { ...base, ...overrides };
}

describe("Phase 7A billing readiness", () => {
  it("A) nouvelle org → trial automatique", async () => {
    const mock = mockSupabase();
    const account = await ensureBillingAccount(mock.client as never, ORG);
    assert.equal(account.billing_status, "trial");
    assert.ok(account.trial_ends_at);
    assert.equal(mock.billingEvents.some((e) => e.event_type === "trial_started"), true);
    assert.equal(BILLING_MONITOR_ONLY, true);
  });

  it("B) changement plan → event créé", async () => {
    const mock = mockSupabase();
    mock.organizationPlans[0] = { organization_id: ORG, plan: "trial" };
    const result = await changeOrganizationPlan(mock.client as never, {
      organization_id: ORG,
      new_plan: "team",
    });
    assert.equal(result.ok, true);
    if (!result.ok) return;
    assert.equal(result.new_plan, "team");
    assert.equal(
      mock.billingEvents.some(
        (e) =>
          e.event_type === "plan_changed" &&
          (e.metadata as Row)?.new_plan === "team",
      ),
      true,
    );
  });

  it("C) fin trial → status calculé past_due", () => {
    const account = fallbackBillingAccount(ORG);
    account.billing_status = "trial";
    account.trial_ends_at = new Date(Date.now() - 86400000).toISOString();
    assert.equal(
      computeEffectiveBillingStatus(account, new Date()),
      "past_due",
    );
    assert.equal(computeDaysRemainingTrial(account.trial_ends_at, new Date()), 0);
  });

  it("D) usage dépasse limite → upgrade recommandé seulement", () => {
    const snap = usageSnapshot({
      usage: {
        inspections_created: 9,
        photos_uploaded: 0,
        ai_photos_processed: 0,
        pdf_generated: 0,
        storage_used_mb: 0,
      },
      usage_percent: { inspections_per_month: 90 },
    });
    assert.equal(computeUpgradeRecommended(snap), true);
  });

  it("E) ancienne org sans billing → fallback OK", () => {
    const legacy = fallbackBillingAccount(ORG_LEGACY);
    assert.equal(legacy.billing_status, "active");
    assert.equal(legacy.billing_provider, "manual");
    assert.equal(legacy.trial_ends_at, null);
    assert.equal(legacy.id, "");
  });
});

describe("Phase 7A billing events", () => {
  it("recordBillingEvent append-only shape", async () => {
    const mock = mockSupabase();
    const evt = await recordBillingEvent(mock.client as never, {
      organization_id: ORG,
      event_type: "payment_failed",
      metadata: { reason: "test" },
    });
    assert.ok(evt?.id);
    assert.equal(evt?.event_type, "payment_failed");
  });
});

describe("Phase 7A non-régression", () => {
  const root = join(process.cwd());

  it("6A access_control intact", () => {
    const p = readFileSync(join(root, "lib/access_control/permissions.ts"), "utf8");
    assert.doesNotMatch(p, /billing_accounts/);
  });

  it("6B usage_control intact", () => {
    const t = readFileSync(join(root, "lib/usage_control/trackUsage.ts"), "utf8");
    assert.match(t, /USAGE_MONITOR_ONLY/);
    assert.doesNotMatch(t, /billing_events/);
  });

  it("6C assignments intact", () => {
    assert.doesNotMatch(
      readFileSync(join(root, "lib/team_collaboration/assignments.ts"), "utf8"),
      /billing/,
    );
  });

  it("6D invitations intact", () => {
    assert.doesNotMatch(
      readFileSync(join(root, "lib/organization_invitations/invitations.ts"), "utf8"),
      /billing/,
    );
  });

  it("inspection pipeline intact", () => {
    assert.doesNotMatch(
      readFileSync(join(root, "supabase/functions/reports-pdf/index.ts"), "utf8"),
      /billing/,
    );
    assert.doesNotMatch(
      readFileSync(join(root, "app/api/upload-photo/route.ts"), "utf8"),
      /billing/,
    );
  });
});
