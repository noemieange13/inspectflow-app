/**
 * Phase Photo Intelligence 2C-3 — dashboard analyse + retry failed.
 * `npm run test:photo-intelligence-2c`
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  derivePhotoAnalysisDashboardState,
  photoAnalysisDashboardStateLabel,
} from "@/lib/photoAnalysisDashboard";
import { loadInspectionPhotoProgress } from "@/lib/inspectionPhotoProgress";
import { retryFailedPhotoAnalysisJobs } from "@/lib/photoAnalysisJobs";

function mockJobsTable(opts: {
  pendingCount?: number;
  lastCompletedAt?: string | null;
}) {
  return {
    select(_cols?: unknown, selOpts?: { count?: string; head?: boolean }) {
      if (selOpts?.head) {
        return {
          eq() {
            return this;
          },
          then(resolve: (v: unknown) => void) {
            resolve({
              count: opts.pendingCount ?? 0,
              error: null,
            });
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
      return Promise.resolve({
        data: opts.lastCompletedAt ? { completed_at: opts.lastCompletedAt } : null,
        error: null,
      });
    },
    update() {
      return this;
    },
  };
}

describe("derivePhotoAnalysisDashboardState", () => {
  it("A) 480 complete + 20 pending → analyse en cours", () => {
    const state = derivePhotoAnalysisDashboardState({
      done: 480,
      pending: 20,
      processing: 0,
      failed: 0,
      skipped: 0,
      total: 500,
    });
    assert.equal(state, "in_progress");
    assert.equal(photoAnalysisDashboardStateLabel(state, "fr"), "Analyse en cours");
  });

  it("B) 497 complete + 3 failed → action requise (bouton retry)", () => {
    const analysis = {
      done: 497,
      pending: 0,
      processing: 0,
      failed: 3,
      skipped: 0,
      total: 500,
    };
    assert.equal(derivePhotoAnalysisDashboardState(analysis), "action_required");
    assert.ok(analysis.failed > 0);
  });

  it("analyse terminée sans pending ni failed", () => {
    const state = derivePhotoAnalysisDashboardState({
      done: 490,
      pending: 0,
      processing: 0,
      failed: 0,
      skipped: 10,
      total: 500,
    });
    assert.equal(state, "complete");
    assert.equal(photoAnalysisDashboardStateLabel(state, "fr"), "Analyse terminée");
  });
});

describe("loadInspectionPhotoProgress worker stats", () => {
  it("expose last_analysis_at et remaining_pending", async () => {
    const supabase = {
      rpc(fn: string) {
        if (fn === "count_photos_for_inspection") {
          return Promise.resolve({ data: 500, error: null });
        }
        if (fn === "count_photos_analysis_status") {
          return Promise.resolve({
            data: [
              { analysis_status: "complete", cnt: 480 },
              { analysis_status: "pending", cnt: 20 },
            ],
            error: null,
          });
        }
        return Promise.resolve({ data: null, error: { message: "unknown" } });
      },
      from(table: string) {
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
              return Promise.resolve({ data: { expected_count: 500 }, error: null });
            },
          };
        }
        if (table === "photo_analysis_jobs") {
          return mockJobsTable({
            pendingCount: 20,
            lastCompletedAt: "2026-06-15T18:00:00.000Z",
          });
        }
        throw new Error(`unexpected table ${table}`);
      },
    };

    const progress = await loadInspectionPhotoProgress(supabase as never, "insp-500");
    assert.equal(progress.analysis.done, 480);
    assert.equal(progress.analysis.pending, 20);
    assert.equal(progress.worker.remaining_pending, 20);
    assert.equal(progress.worker.last_analysis_at, "2026-06-15T18:00:00.000Z");
    assert.equal(derivePhotoAnalysisDashboardState(progress.analysis), "in_progress");
  });
});

describe("retryFailedPhotoAnalysisJobs", () => {
  it("C) failed jobs → pending avec attempt_count reset", async () => {
    const jobUpdates: Record<string, unknown>[] = [];
    const photoUpdates: { id: string; patch: Record<string, unknown> }[] = [];

    const supabase = {
      from(table: string) {
        if (table === "photo_analysis_jobs") {
          return {
            select() {
              return this;
            },
            eq(_col: string, val: unknown) {
              if (val === "failed") {
                return Promise.resolve({
                  data: [
                    { id: "job-1", photo_id: "photo-1" },
                    { id: "job-2", photo_id: "photo-2" },
                  ],
                  error: null,
                });
              }
              return this;
            },
            update(patch: Record<string, unknown>) {
              jobUpdates.push(patch);
              return {
                eq() {
                  return this;
                },
                select() {
                  return this;
                },
                maybeSingle() {
                  return Promise.resolve({ data: { id: "job-1" }, error: null });
                },
              };
            },
          };
        }
        if (table === "photos") {
          return {
            select() {
              return this;
            },
            eq(_col: string, val: unknown) {
              if (val === "photo-1" || val === "photo-2") {
                return {
                  maybeSingle() {
                    return Promise.resolve({
                      data: { analysis_status: "failed" },
                      error: null,
                    });
                  },
                };
              }
              return this;
            },
            update(patch: Record<string, unknown>) {
              return {
                eq(_c: string, photoId: string) {
                  return {
                    in() {
                      photoUpdates.push({ id: photoId, patch });
                      return Promise.resolve({ error: null });
                    },
                  };
                },
              };
            },
          };
        }
        throw new Error(table);
      },
    };

    const result = await retryFailedPhotoAnalysisJobs(supabase as never, "insp-1");
    assert.equal(result.retried, 2);
    assert.equal(result.skipped, 0);
    assert.equal(jobUpdates.length, 2);
    assert.equal(jobUpdates[0]?.status, "pending");
    assert.equal(jobUpdates[0]?.attempt_count, 0);
    assert.equal(photoUpdates.length, 2);
    assert.equal(photoUpdates[0]?.patch.analysis_status, "pending");
  });

  it("D) ne touche pas complete/skipped (pas de coût IA)", async () => {
    let jobUpdateCalls = 0;
    const touchedPhotoIds: string[] = [];

    const supabase = {
      from(table: string) {
        if (table === "photo_analysis_jobs") {
          return {
            select() {
              return this;
            },
            eq(_col: string, val: unknown) {
              if (val === "failed") {
                return Promise.resolve({
                  data: [
                    { id: "job-failed", photo_id: "photo-failed" },
                    { id: "job-complete", photo_id: "photo-complete" },
                    { id: "job-skipped", photo_id: "photo-skipped" },
                  ],
                  error: null,
                });
              }
              if (val === "completed" || val === "skipped") {
                jobUpdateCalls += 1;
              }
              return this;
            },
            update() {
              jobUpdateCalls += 1;
              return {
                eq() {
                  return this;
                },
                select() {
                  return this;
                },
                maybeSingle() {
                  return Promise.resolve({ data: { id: "x" }, error: null });
                },
              };
            },
          };
        }
        if (table === "photos") {
          return {
            select() {
              return this;
            },
            eq(_col: string, photoId: string) {
              return {
                maybeSingle() {
                  const status =
                    photoId === "photo-complete"
                      ? "complete"
                      : photoId === "photo-skipped"
                        ? "skipped"
                        : "failed";
                  return Promise.resolve({ data: { analysis_status: status }, error: null });
                },
              };
            },
            update() {
              return {
                eq(_c: string, photoId: string) {
                  return {
                    in() {
                      touchedPhotoIds.push(photoId);
                      return Promise.resolve({ error: null });
                    },
                  };
                },
              };
            },
          };
        }
        throw new Error(table);
      },
    };

    const result = await retryFailedPhotoAnalysisJobs(supabase as never, "insp-2");
    assert.equal(result.retried, 1);
    assert.equal(result.skipped, 2);
    assert.deepEqual(touchedPhotoIds, ["photo-failed"]);
    assert.equal(jobUpdateCalls, 1);
  });
});
