/**
 * Pilot Hotfix #2 — final intake polish (orientation sync, roof text, building, address).
 * `npm run test:pilot-hotfix-2-intake`
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

import {
  cleanOcrSeparatorText,
  normalizeBuildingValue,
  normalizeFrenchDescriptiveText,
} from "@/lib/documentIntakeSanitizer";
import { normalizeSteveFieldValue } from "@/lib/steveHandwritingNormalizer";

function read(path: string): string {
  return readFileSync(path, "utf8");
}

describe("Pilot Hotfix #2 — Issue 1: orientation suggestion matches selection", () => {
  const source = read("components/DocumentIntakeReview.tsx");

  it("initializes the selected radio from the displayed suggestion", () => {
    assert.match(source, /suggestedOrientation\?\.suggested_direction/);
    assert.match(source, /const initialOrientation: BuildingProfileDirection =/);
  });

  it("keeps selection synced to the suggestion until manually touched", () => {
    assert.match(source, /if \(orientationTouched\) return;/);
    assert.match(source, /setOrientationTouched\(true\)/);
  });
});

describe("Pilot Hotfix #2 — Issue 2: roof text cleanup", () => {
  it("removes orphan colons and duplicate commas", () => {
    assert.equal(cleanOcrSeparatorText("dela facade, :, extérieur"), "dela facade, extérieur");
  });

  it("restores conservative French words (dela → de la, facade → façade)", () => {
    assert.equal(
      normalizeFrenchDescriptiveText("dela facade, extérieur"),
      "de la façade, extérieur",
    );
  });

  it("produces natural French through the roof normalizer", () => {
    const result = normalizeSteveFieldValue({
      field: "roof",
      value: "dela facade, :, extérieur",
      confidence: 0.7,
    });
    assert.equal(result.normalized_value, "de la façade, extérieur");
  });

  it("never invents words — unknown tokens are preserved", () => {
    assert.equal(normalizeFrenchDescriptiveText("Bardeaux, pente"), "Bardeaux, pente");
  });
});

describe("Pilot Hotfix #2 — Issue 3: building normalization", () => {
  it("applies 20\\2 → 20/2 only at confidence ≥ 0.80", () => {
    assert.equal(normalizeBuildingValue("condo • 20\\2", 0.8), "condo • 20/2");
    assert.equal(normalizeBuildingValue("condo • 20\\2", 0.79), "condo • 20\\2");
  });

  it("preserves the original value below the threshold", () => {
    assert.equal(normalizeBuildingValue("condo • 20\\2", 0.5), "condo • 20\\2");
  });
});

describe("Pilot Hotfix #2 — Issue 4: address validation", () => {
  it("does not auto-correct unknown street names, preserving spelling", () => {
    const result = normalizeSteveFieldValue({
      field: "address",
      value: "107 Lucio Gundnon",
      confidence: 0.7,
    });
    assert.equal(result.normalized_value, "107 Lucio Gundnon");
  });

  it("still trims OCR garbage and normalizes spacing", () => {
    const result = normalizeSteveFieldValue({
      field: "address",
      value: "107   Lucio  Gundnon  GX SER OÙ",
      confidence: 0.7,
    });
    assert.equal(result.normalized_value, "107 Lucio Gundnon");
  });
});
