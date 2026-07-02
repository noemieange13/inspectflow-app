/**
 * Phase 7B — Stripe integration
 * `npm run test:stripe-integration-7b`
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";

import { fallbackBillingAccount } from "@/lib/billing/plans";
import {
  buildAccessContext,
  canManageOrganization,
} from "@/lib/access_control";
import {
  applyPaymentFailed,
  applySubscriptionActive,
  applySubscriptionCancelled,
  isStripeCheckoutPlan,
  mapStripeSubscriptionStatus,
  resolveOrganizationIdFromStripeObject,
} from "@/lib/stripe";

const ORG = "22222222-2222-2222-2222-222222222222";
const OWNER = "ffffffff-ffff-ffff-ffff-ffffffffffff";
const ASSIST = "dddddddd-dddd-dddd-dddd-dddddddddddd";

type Row = Record<string, unknown>;

function mockSupabase() {
  const billingAccounts: Row[] = [];
  const billingEvents: Row[] = [];
  const organizationPlans: Row[] = [];

  return {
    billingAccounts,
    billingEvents,
    client: {
      from(table: string) {
        if (table === "billing_accounts") {
          return {
            upsert: async (payload: Row) => {
              const idx = billingAccounts.findIndex(
                (r) => r.organization_id === payload.organization_id,
              );
              if (idx >= 0) billingAccounts[idx] = { ...billingAccounts[idx], ...payload };
              else billingAccounts.push(payload);
              return { error: null };
            },
            select: () => ({
              eq: () => ({
                maybeSingle: async () => ({ data: null, error: null }),
              }),
            }),
          };
        }
        if (table === "billing_events") {
          return {
            insert: (payload: Row) => ({
              select: () => ({
                single: async () => {
                  billingEvents.push(payload);
                  return { data: { id: "ev-1", ...payload }, error: null };
                },
              }),
            }),
          };
        }
        if (table === "organization_plans") {
          return {
            select: () => ({
              eq: () => ({
                maybeSingle: async () => ({
                  data: organizationPlans[0] ?? { plan: "trial" },
                  error: null,
                }),
              }),
            }),
            upsert: async (payload: Row) => {
              organizationPlans[0] = payload;
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

describe("Phase 7B Stripe integration", () => {
  it("A) checkout autorisé pour owner/admin (canManageOrganization)", () => {
    const ownerCtx = buildAccessContext(
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
    );
    assert.equal(canManageOrganization(ownerCtx), true);
    assert.equal(isStripeCheckoutPlan("team"), true);
  });

  it("B) assistant interdit", () => {
    const ctx = buildAccessContext(
      {
        id: ASSIST,
        membership: { organization_id: ORG, role: "assistant", status: "active" },
      },
      {
        report_id: "",
        inspection_id: null,
        organization_id: ORG,
        owner_user_id: OWNER,
      },
      null,
    );
    assert.equal(canManageOrganization(ctx), false);
  });

  it("C) webhook active subscription → billing_status active", async () => {
    const mock = mockSupabase();
    await applySubscriptionActive(mock.client as never, {
      organization_id: ORG,
      target_plan: "team",
      stripe_customer_id: "cus_test",
      stripe_subscription_id: "sub_test",
    });
    assert.equal(mock.billingAccounts[0]?.billing_status, "active");
    assert.equal(mock.billingAccounts[0]?.billing_provider, "stripe");
    assert.equal(mock.organizationPlans[0]?.plan, "team");
  });

  it("D) paiement échoué → past_due", async () => {
    const mock = mockSupabase();
    await applyPaymentFailed(mock.client as never, ORG, { stripe_invoice_id: "in_test" });
    assert.equal(mock.billingAccounts[0]?.billing_status, "past_due");
    assert.equal(
      mock.billingEvents.some((e) => e.event_type === "payment_failed"),
      true,
    );
  });

  it("E) annulation → cancelled", async () => {
    const mock = mockSupabase();
    await applySubscriptionCancelled(mock.client as never, ORG, {
      stripe_subscription_id: "sub_test",
    });
    assert.equal(mock.billingAccounts[0]?.billing_status, "cancelled");
    assert.equal(
      mock.billingEvents.some((e) => e.event_type === "subscription_cancelled"),
      true,
    );
  });
});

describe("Phase 7B helpers", () => {
  it("resolveOrganizationIdFromStripeObject metadata", () => {
    assert.equal(
      resolveOrganizationIdFromStripeObject({
        metadata: { organization_id: ORG },
      }),
      ORG,
    );
  });

  it("mapStripeSubscriptionStatus", () => {
    assert.equal(mapStripeSubscriptionStatus("active"), "active");
    assert.equal(mapStripeSubscriptionStatus("past_due"), "past_due");
    assert.equal(mapStripeSubscriptionStatus("canceled"), "cancelled");
  });
});

describe("Phase 7B non-régression", () => {
  const root = join(process.cwd());

  it("7A fallback intact", () => {
    const fb = fallbackBillingAccount(ORG);
    assert.equal(fb.billing_provider, "manual");
  });

  it("6A access_control intact", () => {
    assert.doesNotMatch(
      readFileSync(join(root, "lib/access_control/permissions.ts"), "utf8"),
      /stripe/,
    );
  });

  it("6B usage_control intact", () => {
    assert.doesNotMatch(
      readFileSync(join(root, "lib/usage_control/trackUsage.ts"), "utf8"),
      /createCheckoutSession/,
    );
  });

  it("photos/PDF/IA intacts", () => {
    assert.doesNotMatch(
      readFileSync(join(root, "app/api/upload-photo/route.ts"), "utf8"),
      /lib\/stripe/,
    );
    assert.doesNotMatch(
      readFileSync(join(root, "supabase/functions/reports-pdf/index.ts"), "utf8"),
      /stripe/,
    );
    assert.doesNotMatch(
      readFileSync(join(root, "lib/analyzeInspectionPhoto.ts"), "utf8"),
      /stripe/,
    );
  });
});
