/**
 * Pilot #0.37 — globalLockRight crash hardening
 * `npm run test:global-lock-right-pilot-037`
 */
import assert from "node:assert/strict";
import { execSync } from "node:child_process";
import { describe, it } from "node:test";

import { analyzeDocumentText } from "@/lib/document-intelligence";
import {
  buildDetectedFieldBuckets,
  setFieldBucketTraceCollectorForTests,
} from "@/lib/document_parsers/steveFieldBuckets";
import { applySteveCompleteExtraction } from "@/lib/steveCompleteExtraction";
import {
  runIsolatedFieldExtraction,
  resolveLayoutLockRight,
} from "@/lib/steveFieldExtractionGuard";
import type { SteveFieldSheetIntelligenceV1 } from "@/lib/steveFieldSemantics";
import {
  STEVE_COMPLETE_TEMPLATE_PILOT_031_BLOCKS,
  STEVE_COMPLETE_TEMPLATE_PILOT_031_TEXT,
} from "@/test/fixtures/steveCompleteTemplatePilot031Blocks";

function emptyIntelligence(): SteveFieldSheetIntelligenceV1 {
  return {
    schema_version: 1,
    client: { name: null, email: null, phone: null },
    property: {
      address: null,
      building_type: null,
      construction_year: null,
      facade_orientation: null,
    },
    inspection: { date: null, weather: null, temperature: null },
    contacts: { broker_name: null, buyer_email: null },
    systems: {
      roof: null,
      heating: null,
      electrical_panel: null,
      water_heater: null,
      foundation: null,
    },
    notes: { raw_notes: [] },
  };
}

describe("Pilot #0.37 globalLockRight crash fix", () => {
  it("has zero globalLockRight references in source", () => {
    const output = execSync(
      'rg -n "globalLockRight" lib test --glob "!test/global-lock-right-pilot-037.test.ts" || true',
      { cwd: process.cwd(), encoding: "utf8" },
    ).trim();
    assert.equal(output, "");
  });

  it("resolves lockRight from explicit layout bounds only", () => {
    const lockRight = resolveLayoutLockRight(
      { text: "2. Adresse:", x: 30, y: 112, width: 78, height: 12, confidence: 0.98 },
      150,
    );
    assert.ok(Number.isFinite(lockRight));
    assert.ok(lockRight >= 108);
  });

  it("isolates per-field extraction failures", () => {
    const value = runIsolatedFieldExtraction(
      "property.address",
      () => {
        throw new ReferenceError("globalLockRight is not defined");
      },
      "fallback-value",
    );
    assert.equal(value, "fallback-value");
  });

  it("completes Steve parse without ReferenceError and emits field buckets", () => {
    let sawBuckets = false;
    setFieldBucketTraceCollectorForTests((buckets) => {
      sawBuckets = buckets.address_candidates.length > 0;
    });

    const analysis = analyzeDocumentText(STEVE_COMPLETE_TEMPLATE_PILOT_031_TEXT, {
      documentType: "steve_field_notes",
      layoutBlocks: STEVE_COMPLETE_TEMPLATE_PILOT_031_BLOCKS,
    });

    assert.ok(analysis.field_sheet_v1);
    assert.match(analysis.field_sheet_v1?.property.address?.value ?? "", /2404 Rue de la Reine des Prés/i);
    assert.match(analysis.field_sheet_intelligence_v1?.client.name?.value ?? "", /Christian Tremblay/i);
    assert.equal(analysis.field_sheet_form_v1?.property.construction_year?.value, "2003");
    assert.match(analysis.field_sheet_form_v1?.roof.covering?.value ?? "", /Bardeaux/i);
    assert.ok(sawBuckets);

    const buckets = buildDetectedFieldBuckets(STEVE_COMPLETE_TEMPLATE_PILOT_031_BLOCKS);
    assert.ok(buckets.address_candidates.length > 0);
    assert.ok(buckets.construction_candidates.length > 0);
    assert.ok(buckets.roof_candidates.length > 0);

    setFieldBucketTraceCollectorForTests(null);
  });

  it("continues complete extraction when one checklist field throws", () => {
    const blocks = STEVE_COMPLETE_TEMPLATE_PILOT_031_BLOCKS;
    const poisoned = blocks.map((block) =>
      block.text === "5. Toiture:" ? { ...block, text: "5. Toiture:" } : block,
    );

    const result = applySteveCompleteExtraction({
      blocks: poisoned,
      intelligence: emptyIntelligence(),
      contact: {
        schema_version: 1,
        client_name: null,
        email: null,
        phone: null,
      },
      consumedBlocks: new Set(),
      preserveAddress: "2404 Rue de la Reine des Prés Mont-Laurier J9L 0H3",
    });

    assert.match(result.intelligence.property.address?.value ?? "", /2404 Rue de la Reine des Prés/i);
  });
});
