/**
 * Phase 9A — Steve real pilot observability
 * `npm run test:steve-pilot-observability-9a`
 */
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";

import {
  STEVE_PILOT_OBSERVABILITY_KEY,
  buildPilotObservabilitySummary,
  type StevePilotObservationEventType,
} from "@/lib/stevePilotObservability";
import { isPilotObservabilityDashboardEnabled } from "@/lib/pilotObservabilityAccess";

const ROOT = join(process.cwd());

const REQUIRED_EVENTS: StevePilotObservationEventType[] = [
  "inspection_started",
  "documents_imported",
  "ai_suggestion_reviewed",
  "photo_added",
  "pre_delivery_gate_opened",
  "warning_acknowledged",
  "pdf_preview_opened",
  "report_approved",
  "pdf_delivered",
];

const FORBIDDEN_CORE_PATHS = [
  "supabase/functions/reports-pdf/index.ts",
  "lib/report_writer_engine/writeObservation.ts",
  "lib/observation_ai_engine/index.ts",
];

function read(rel: string): string {
  return readFileSync(join(ROOT, rel), "utf8");
}

describe("Phase 9A pilot observability module", () => {
  it("defines all required event types", () => {
    const src = read("lib/stevePilotObservability.ts");
    for (const event of REQUIRED_EVENTS) {
      assert.match(src, new RegExp(`"${event}"`));
    }
    assert.equal(STEVE_PILOT_OBSERVABILITY_KEY, "steve_pilot_observability_v1");
  });

  it("sanitizes metadata — no client PII keys", () => {
    assert.match(read("lib/stevePilotObservability.ts"), /FORBIDDEN_META_KEYS/);
    assert.match(read("lib/stevePilotObservability.ts"), /ALLOWED_META_KEYS/);
    assert.match(read("lib/stevePilotObservability.ts"), /report_ref/);
  });

  it("summary aggregates counters", () => {
    const summary = buildPilotObservabilitySummary();
    assert.equal(typeof summary.inspections_completed, "number");
    assert.equal(typeof summary.average_photos_per_report, "number");
    assert.equal(typeof summary.validation_warnings_total, "number");
    assert.equal(typeof summary.failures_total, "number");
    for (const event of REQUIRED_EVENTS) {
      assert.equal(typeof summary.event_counts[event], "number");
    }
  });
});

describe("Phase 9A wiring (thin hooks only)", () => {
  it("Steve flow components record pilot events", () => {
    assert.match(read("components/InspectorSimpleWorkspace.tsx"), /ensurePilotObservationSession/);
    assert.match(read("components/NewInspectionSheet.tsx"), /queuePilotObservation\("documents_imported"/);
    assert.match(read("components/PreDeliveryConfidenceCheck.tsx"), /warning_acknowledged/);
    assert.match(read("components/StevePreDeliveryGate.tsx"), /report_approved/);
    assert.match(read("components/DeliveryActions.tsx"), /pre_delivery_gate_opened/);
    assert.match(read("components/InspectionDeliveryWorkspace.tsx"), /pdf_delivered/);
  });

  it("dev dashboard gated", () => {
    assert.match(read("app/dev/steve-pilot-summary/page.tsx"), /isPilotObservabilityDashboardEnabled/);
    assert.match(read("lib/pilotObservabilityAccess.ts"), /INSPECTFLOW_PILOT_OBSERVABILITY/);
    if (process.env.NODE_ENV === "test") {
      assert.equal(typeof isPilotObservabilityDashboardEnabled(), "boolean");
    }
  });
});

describe("Phase 9A documentation", () => {
  it("steve pilot feedback template exists", () => {
    assert.ok(existsSync(join(ROOT, "docs/steve-pilot-feedback.md")));
    assert.match(read("docs/steve-pilot-feedback.md"), /Date inspection/);
    assert.match(read("docs/steve-pilot-feedback.md"), /Commentaires libres de Steve/);
    assert.match(read("docs/steve-pilot-feedback.md"), /pdf_delivered/);
  });
});

describe("Phase 9A code freeze", () => {
  it("forbidden cores untouched", () => {
    for (const path of FORBIDDEN_CORE_PATHS) {
      assert.doesNotMatch(read(path), /stevePilotObservability/);
    }
  });
});
