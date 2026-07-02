/**
 * Phase 5C — system_monitoring
 * `npm run test:system-monitoring-5c`
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  buildSystemSignals,
  evaluateSystemHealth,
  getAiCostDailyLimits,
  recordSystemHealthEvent,
} from "@/lib/system_monitoring";

describe("evaluateSystemHealth", () => {
  it("A) 100 jobs pending vieux de 2h → critical photo_pipeline", () => {
    const health = evaluateSystemHealth(
      buildSystemSignals({
        photo: {
          pending_jobs: 100,
          oldest_pending_job_age_minutes: 120,
          failed_jobs_24h: 0,
          completed_jobs_24h: 400,
        },
        audit: { events_24h: 10, last_event_at: new Date().toISOString() },
      }),
    );

    assert.equal(health.status, "critical");
    assert.equal(health.checks.photo_pipeline, false);
    assert.ok(health.issues.some((i) => i.source === "photo_pipeline"));
  });

  it("B) jobs failed > seuil → warning", () => {
    const health = evaluateSystemHealth(
      buildSystemSignals({
        photo: {
          pending_jobs: 0,
          oldest_pending_job_age_minutes: 0,
          failed_jobs_24h: 10,
          completed_jobs_24h: 100,
        },
        audit: { events_24h: 5, last_event_at: new Date().toISOString() },
      }),
    );

    assert.equal(health.status, "warning");
    assert.ok(health.issues.some((i) => i.message.includes("échec jobs")));
  });

  it("C) coût IA dépasse limite → warning", () => {
    const limits = getAiCostDailyLimits();
    const health = evaluateSystemHealth(
      buildSystemSignals({
        ai: {
          total_cost_today: limits.warning + 1,
          vision_calls_today: 200,
          average_cost_per_inspection: 0.5,
          failed_ai_jobs: 0,
        },
        audit: { events_24h: 3, last_event_at: new Date().toISOString() },
      }),
    );

    assert.equal(health.status, "warning");
    assert.equal(health.checks.ai_usage, false);
  });

  it("D) PDF failures élevés → warning", () => {
    const health = evaluateSystemHealth(
      buildSystemSignals({
        pdf: { pdf_generated_24h: 90, pdf_failed_24h: 10 },
        audit: { events_24h: 8, last_event_at: new Date().toISOString() },
      }),
    );

    assert.equal(health.status, "warning");
    assert.ok(health.issues.some((i) => i.source === "pdf"));
  });

  it("E) tout normal → healthy", () => {
    const health = evaluateSystemHealth(
      buildSystemSignals({
        photo: {
          pending_jobs: 0,
          oldest_pending_job_age_minutes: 0,
          failed_jobs_24h: 1,
          completed_jobs_24h: 500,
        },
        ai: {
          total_cost_today: 1.5,
          vision_calls_today: 40,
          average_cost_per_inspection: 0.02,
          failed_ai_jobs: 1,
        },
        pdf: { pdf_generated_24h: 12, pdf_failed_24h: 0 },
        audit: { events_24h: 30, last_event_at: new Date().toISOString() },
      }),
    );

    assert.equal(health.status, "healthy");
    assert.equal(health.issues.length, 0);
    assert.equal(health.checks.photo_pipeline, true);
    assert.equal(health.checks.ai_usage, true);
    assert.equal(health.checks.pdf_generation, true);
    assert.equal(health.checks.audit_pipeline, true);
  });
});

describe("recordSystemHealthEvent", () => {
  it("E bis) erreur DB → ne lève pas", async () => {
    const mock = {
      from: () => ({
        insert: () => ({
          select: () => ({
            single: async () => ({ data: null, error: { message: "connection failed" } }),
          }),
        }),
      }),
    };
    const result = await recordSystemHealthEvent(mock as never, {
      event_type: "health_snapshot",
      severity: "info",
      source: "system",
    });
    assert.equal(result.recorded, false);
  });
});
