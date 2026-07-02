/**
 * Phase 7C — billing UX
 * `npm run test:billing-ux-7c`
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";

import {
  buildAccessContext,
  canManageOrganization,
} from "@/lib/access_control";
import {
  computeLimitUxState,
  getPlanDisplayInfo,
  mapDisplaySubscriptionStatus,
  resolveBillingAccessFromContext,
} from "@/lib/billing";
import type { OrganizationBillingSnapshot } from "@/lib/billing/types";
import { computeUsagePercent } from "@/lib/usage_control";

const ORG = "22222222-2222-2222-2222-222222222222";
const OWNER = "ffffffff-ffff-ffff-ffff-ffffffffffff";
const ADMIN = "cccccccc-cccc-cccc-cccc-cccccccccccc";
const INSPECTOR = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";

function snapshot(partial: Partial<OrganizationBillingSnapshot>): OrganizationBillingSnapshot {
  const limits = {
    inspections_per_month: 50,
    ai_photos_per_month: 100,
    members: 10,
    storage_gb: 5,
  };
  const usageCounters = {
    inspections_created: 0,
    photos_uploaded: 0,
    ai_photos_processed: 0,
    pdf_generated: 0,
    storage_used_mb: 0,
  };
  const usage = {
    organization_id: ORG,
    plan: "team" as const,
    limits,
    usage_period: "month" as const,
    period_start: "2026-06-01T00:00:00.000Z",
    period_end: "2026-04-15T00:00:00.000Z",
    usage: usageCounters,
    usage_percent: computeUsagePercent(limits, usageCounters),
  };
  return {
    organization_id: ORG,
    monitor_only: true,
    current_plan: "team",
    billing_status: "active",
    computed_billing_status: "active",
    billing_provider: "stripe",
    days_remaining_trial: null,
    trial_ends_at: null,
    usage_percentage: null,
    upgrade_recommended: false,
    usage,
    ...partial,
  };
}

describe("Phase 7C billing UX", () => {
  it("A — trial actif : jours restants", () => {
    const snap = snapshot({
      billing_status: "trial",
      computed_billing_status: "trial",
      days_remaining_trial: 9,
      trial_ends_at: "2026-03-24T00:00:00.000Z",
      current_plan: "trial",
    });
    assert.equal(mapDisplaySubscriptionStatus(snap), "trialing");
    assert.equal(snap.days_remaining_trial, 9);
  });

  it("B — subscription active : plan + prix + renouvellement", () => {
    const snap = snapshot({
      billing_status: "active",
      computed_billing_status: "active",
      current_plan: "team",
    });
    assert.equal(mapDisplaySubscriptionStatus(snap), "active");
    const display = getPlanDisplayInfo("team");
    assert.match(display.name, /Pro/);
    assert.match(display.priceLabel, /149/);
    assert.ok(snap.usage.period_end);
  });

  it("C — past_due : statut alerte", () => {
    const snap = snapshot({
      billing_status: "past_due",
      computed_billing_status: "past_due",
    });
    assert.equal(mapDisplaySubscriptionStatus(snap), "past_due");
  });

  it("D — usage 85 % : warning upgrade", () => {
    const state = computeLimitUxState(85);
    assert.equal(state.limitApproaching, true);
    assert.equal(state.limitReached, false);
  });

  it("E — inspector : accès billing refusé", () => {
    const ctx = buildAccessContext(
      {
        id: INSPECTOR,
        membership: { organization_id: ORG, role: "inspector", status: "active" },
      },
      {
        report_id: "",
        inspection_id: null,
        organization_id: ORG,
        owner_user_id: OWNER,
      },
      null,
    );
    const access = resolveBillingAccessFromContext(ctx);
    assert.equal(access.canView, false);
    assert.equal(access.canManage, false);
    assert.equal(canManageOrganization(ctx), false);
  });

  it("F — portal endpoint 7B inchangé", () => {
    const route = readFileSync(
      join(process.cwd(), "app/api/billing/create-portal-session/route.ts"),
      "utf8",
    );
    assert.match(route, /create-portal-session/);
    assert.match(route, /createPortalSession/);
    assert.doesNotMatch(route, /stripe\.webhooks/);
  });
});

describe("Phase 7C permissions owner vs admin", () => {
  it("owner manage, admin view only", () => {
    const owner = resolveBillingAccessFromContext(
      buildAccessContext(
        {
          id: OWNER,
          membership: { organization_id: ORG, role: "owner", status: "active" },
        },
        {
          report_id: "",
          inspection_id: null,
          organization_id: ORG,
          owner_user_id: OWNER,
        },
        null,
      ),
    );
    const admin = resolveBillingAccessFromContext(
      buildAccessContext(
        {
          id: ADMIN,
          membership: { organization_id: ORG, role: "admin", status: "active" },
        },
        {
          report_id: "",
          inspection_id: null,
          organization_id: ORG,
          owner_user_id: OWNER,
        },
        null,
      ),
    );
    assert.equal(owner.canView, true);
    assert.equal(owner.canManage, true);
    assert.equal(admin.canView, true);
    assert.equal(admin.canManage, false);
  });
});

describe("Phase 7C non-régression", () => {
  const root = join(process.cwd());

  it("7B webhooks inchangés", () => {
    assert.doesNotMatch(
      readFileSync(join(root, "lib/stripe/webhooks.ts"), "utf8"),
      /BillingPage/,
    );
  });

  it("6B usage_control inchangé", () => {
    assert.doesNotMatch(
      readFileSync(join(root, "lib/usage_control/checkUsageLimit.ts"), "utf8"),
      /billingUx/,
    );
  });

  it("6A permissions inchangées", () => {
    assert.doesNotMatch(
      readFileSync(join(root, "lib/access_control/permissions.ts"), "utf8"),
      /billingUx/,
    );
  });
});
