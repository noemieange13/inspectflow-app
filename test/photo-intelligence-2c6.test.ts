/**
 * Phase Photo Intelligence 2C-6 — audit coût IA + budget.
 * `npm run test:photo-intelligence-2c6`
 */
import assert from "node:assert/strict";
import { describe, it, after } from "node:test";

import {
  canAffordVisionCall,
  estimateVisionCostUsd,
  getPhotoAiBudgetLimits,
  inspectionAiUsageWithinBudget,
  PHOTO_VISION_PROMPT_VERSION,
} from "@/lib/photoAiBudget";
import {
  loadInspectionAiUsage,
  pausePendingJobsForBudget,
  recordInspectionDuplicateSkip,
  recordPhotoVisionAudit,
} from "@/lib/photoAiAudit";
import { loadInspectionPhotoProgress } from "@/lib/inspectionPhotoProgress";

describe("estimateVisionCostUsd", () => {
  it("A) 500 photos normales → coût calculé par tokens", () => {
    const perPhoto = estimateVisionCostUsd("gpt-4o-mini", 1200, 350);
    assert.ok(perPhoto > 0);
    const total500 = perPhoto * 500;
    assert.ok(total500 > 0);
    assert.ok(total500 < 50, "500× mini vision reste dans une fourchette raisonnable");
  });
});

describe("recordPhotoVisionAudit + duplicate skip", () => {
  it("B) doublons skipped → aucun coût IA ajouté", async () => {
    const usageRows: Record<string, unknown>[] = [];
    const auditRows: unknown[] = [];

    const supabase = {
      from(table: string) {
        if (table === "inspection_ai_usage") {
          return {
            select() {
              return this;
            },
            eq(_col: string, inspectionId: string) {
              const row = usageRows.find((r) => r.inspection_id === inspectionId);
              return {
                maybeSingle: () =>
                  Promise.resolve({ data: row ?? null, error: null }),
              };
            },
            insert(row: Record<string, unknown>) {
              usageRows.push(row);
              return Promise.resolve({ error: null });
            },
            update(patch: Record<string, unknown>) {
              const row = usageRows[0];
              if (row) Object.assign(row, patch);
              return {
                eq: () => Promise.resolve({ error: null }),
              };
            },
          };
        }
        if (table === "photo_ai_audit") {
          return {
            insert(row: unknown) {
              auditRows.push(row);
              return Promise.resolve({ error: null });
            },
          };
        }
        throw new Error(`unexpected ${table}`);
      },
    };

    await recordInspectionDuplicateSkip(supabase as never, "insp-dup");
    await recordInspectionDuplicateSkip(supabase as never, "insp-dup");

    assert.equal(auditRows.length, 0);
    assert.equal(usageRows[0]?.photos_skipped_duplicate, 2);
    assert.equal(usageRows[0]?.estimated_cost_usd, 0);
    assert.equal(usageRows[0]?.photos_analyzed, 0);
  });

  it("A) enregistrement vision incrémente coût agrégé", async () => {
    const usageRows: Record<string, unknown>[] = [];
    const supabase = {
      from(table: string) {
        if (table === "inspection_ai_usage") {
          return {
            select() {
              return this;
            },
            eq(_c: string, inspectionId: string) {
              const row = usageRows.find((r) => r.inspection_id === inspectionId);
              return {
                maybeSingle: () =>
                  Promise.resolve({ data: row ?? null, error: null }),
              };
            },
            insert(row: Record<string, unknown>) {
              usageRows.push(row);
              return Promise.resolve({ error: null });
            },
            update(patch: Record<string, unknown>) {
              Object.assign(usageRows[0]!, patch);
              return { eq: () => Promise.resolve({ error: null }) };
            },
          };
        }
        if (table === "photo_ai_audit") {
          return { insert: () => Promise.resolve({ error: null }) };
        }
        throw new Error(`unexpected ${table}`);
      },
    };

    const cost = estimateVisionCostUsd("gpt-4o-mini", 800, 200);
    await recordPhotoVisionAudit(supabase as never, {
      inspectionId: "insp-a",
      photoId: "photo-1",
      jobId: "job-1",
      audit: {
        ai_model: "gpt-4o-mini",
        prompt_version: PHOTO_VISION_PROMPT_VERSION,
        input_tokens: 800,
        output_tokens: 200,
        estimated_cost_usd: cost,
        analysis_duration_ms: 1200,
        processed_at: new Date().toISOString(),
      },
    });

    assert.equal(usageRows[0]?.photos_analyzed, 1);
    assert.equal(usageRows[0]?.estimated_cost_usd, cost);
  });
});

describe("budget limits", () => {
  const prevPhotos = process.env.MAX_AI_PHOTOS_PER_INSPECTION;
  const prevCost = process.env.MAX_AI_COST_PER_INSPECTION;

  after(() => {
    if (prevPhotos === undefined) delete process.env.MAX_AI_PHOTOS_PER_INSPECTION;
    else process.env.MAX_AI_PHOTOS_PER_INSPECTION = prevPhotos;
    if (prevCost === undefined) delete process.env.MAX_AI_COST_PER_INSPECTION;
    else process.env.MAX_AI_COST_PER_INSPECTION = prevCost;
  });

  it("C) budget photos atteint → pause pending jobs en paused_budget", async () => {
    process.env.MAX_AI_PHOTOS_PER_INSPECTION = "3";
    const updates: Record<string, unknown>[] = [];

    const supabase = {
      from(table: string) {
        if (table === "photo_analysis_jobs") {
          return {
            update(patch: Record<string, unknown>) {
              updates.push(patch);
              return {
                eq: () => ({
                  eq: () => ({
                    select: () =>
                      Promise.resolve({
                        data: [{ id: "j1" }, { id: "j2" }],
                        error: null,
                      }),
                  }),
                }),
              };
            },
          };
        }
        throw new Error(`unexpected ${table}`);
      },
    };

    const paused = await pausePendingJobsForBudget(supabase as never, "insp-cap", "job-cur");
    assert.equal(paused, 2);
    assert.equal(updates[0]?.status, "paused_budget");
  });

  it("D) worker ne dépasse jamais la limite photos", () => {
    process.env.MAX_AI_PHOTOS_PER_INSPECTION = "400";
    const limits = getPhotoAiBudgetLimits();
    let analyzed = 0;
    let cost = 0;

    for (let i = 0; i < 500; i += 1) {
      const usage = {
        photos_analyzed: analyzed,
        photos_skipped_duplicate: 0,
        total_tokens: 0,
        estimated_cost_usd: cost,
      };
      if (!inspectionAiUsageWithinBudget(usage, limits)) break;
      const nextCost = estimateVisionCostUsd("gpt-4o-mini", 500, 150);
      if (!canAffordVisionCall(usage, nextCost, limits)) break;
      analyzed += 1;
      cost += nextCost;
    }

    assert.equal(analyzed, 400);
  });
});

describe("loadInspectionPhotoProgress — rétrocompatibilité", () => {
  it("E) inspection sans données coût → ai null, progression inchangée", async () => {
    const supabase = {
      from(table: string) {
        if (table === "photos") {
          return {
            select() {
              return this;
            },
            eq() {
              return Promise.resolve({
                data: [{ analysis_status: "complete" }],
                error: null,
              });
            },
          };
        }
        if (table === "photo_analysis_jobs") {
          return {
            select(_c?: unknown, opts?: { head?: boolean }) {
              if (opts?.head) {
                return {
                  eq() {
                    return Promise.resolve({ count: 0, error: null });
                  },
                };
              }
              return this;
            },
            eq() {
              return this;
            },
            in() {
              return this;
            },
            not() {
              return this;
            },
            order() {
              return this;
            },
            limit() {
              return this;
            },
            maybeSingle() {
              return Promise.resolve({ data: null, error: null });
            },
          };
        }
        if (table === "inspection_ai_usage") {
          return {
            select() {
              return this;
            },
            eq() {
              return {
                maybeSingle: () => Promise.resolve({ data: null, error: null }),
              };
            },
          };
        }
        if (table === "photo_upload_batches") {
          return {
            select() {
              return this;
            },
            eq() {
              return this;
            },
            order() {
              return this;
            },
            limit() {
              return this;
            },
            maybeSingle() {
              return Promise.resolve({ data: null, error: null });
            },
          };
        }
        throw new Error(`unexpected ${table}`);
      },
    };

    const progress = await loadInspectionPhotoProgress(supabase as never, "legacy-insp");
    assert.equal(progress.analysis.done, 1);
    assert.equal(progress.ai, null);
  });

  it("loadInspectionAiUsage absent → null", async () => {
    const supabase = {
      from() {
        return {
          select() {
            return this;
          },
          eq() {
            return {
              maybeSingle: () => Promise.resolve({ data: null, error: { code: "42P01" } }),
            };
          },
        };
      },
    };
    const row = await loadInspectionAiUsage(supabase as never, "x");
    assert.equal(row, null);
  });
});
