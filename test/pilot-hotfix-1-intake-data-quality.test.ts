/**
 * Pilot Hotfix #1 — intake data quality (address / roof / building OCR cleanup).
 * `npm run test:pilot-hotfix-1-intake`
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

import {
  cleanOcrSeparatorText,
  looksLikeOcrNoiseToken,
  normalizeBuildingValue,
  sanitizeAddressValue,
  stripOcrControlChars,
} from "@/lib/documentIntakeSanitizer";
import { normalizeSteveFieldValue } from "@/lib/steveHandwritingNormalizer";

function read(path: string): string {
  return readFileSync(path, "utf8");
}

describe("Pilot Hotfix #1 — Issue 1: address contamination", () => {
  it("strips trailing OCR-noise fragments so fields are not concatenated", () => {
    assert.equal(
      sanitizeAddressValue("107 Lucio Gundnon GX SER OÙ", 0.7),
      "107 Lucio Gundnon",
    );
  });

  it("preserves civic number, postal code and province code", () => {
    assert.equal(
      sanitizeAddressValue("2144 Rue de la Reine des Prés, Mont-Laurier J9L 0H3", 0.7),
      "2144 Rue de la Reine des Prés, Mont-Laurier J9L 0H3",
    );
    assert.equal(sanitizeAddressValue("100 Rue Principale, Gatineau QC", 0.7), "100 Rue Principale, Gatineau QC");
  });

  it("blanks a low-confidence value still dominated by noise instead of inventing", () => {
    assert.equal(sanitizeAddressValue("GX SER OÙ", 0.3), "");
  });

  it("never invents content — empty stays empty", () => {
    assert.equal(sanitizeAddressValue("", 0.9), "");
  });

  it("recognizes OCR noise tokens but keeps postal / province / numbers", () => {
    assert.equal(looksLikeOcrNoiseToken("GX"), true);
    assert.equal(looksLikeOcrNoiseToken("OÙ"), true);
    assert.equal(looksLikeOcrNoiseToken("J9L"), false);
    assert.equal(looksLikeOcrNoiseToken("QC"), false);
    assert.equal(looksLikeOcrNoiseToken("107"), false);
    assert.equal(looksLikeOcrNoiseToken("Gundnon"), false);
  });

  it("keeps the noisy fixture address normalization intact (no regression)", () => {
    const result = normalizeSteveFieldValue({
      field: "address",
      value: "2404 Rut dada Reine, dea Pui - VPS SEES dal owt3",
      confidence: 0.55,
    });
    assert.match(result.normalized_value, /Rue de la Reine des Prés/i);
    assert.match(result.normalized_value, /Mont-Laurier/i);
    assert.match(result.normalized_value, /J9L\s*0H3/i);
  });
});

describe("Pilot Hotfix #1 — Issue 2: roof field cleanup", () => {
  it("removes :+ / repeated + / stray punctuation and returns readable text", () => {
    assert.equal(
      cleanOcrSeparatorText(":+ dela façade + :+ extérieur + :+"),
      "dela façade, extérieur",
    );
  });

  it("normalizes roof through the field normalizer", () => {
    const result = normalizeSteveFieldValue({
      field: "roof",
      value: "Bardeaux + :+ pente + :+",
      confidence: 0.7,
    });
    assert.equal(result.normalized_value, "Bardeaux, pente");
  });

  it("preserves clean roof text unchanged", () => {
    const result = normalizeSteveFieldValue({ field: "roof", value: "Tôle 2017", confidence: 0.7 });
    assert.equal(result.normalized_value, "Tôle 2017");
  });

  it("strips OCR control characters", () => {
    assert.equal(stripOcrControlChars("Tôle\u0007 2017"), "Tôle 2017");
  });
});

describe("Pilot Hotfix #1 — Issue 3: building normalization", () => {
  it("preserves the original value when confidence is low (never guesses)", () => {
    assert.equal(normalizeBuildingValue("condo: 20\\2", 0.5), "condo: 20\\2");
  });

  it("applies a safe OCR substitution only at high confidence", () => {
    assert.equal(normalizeBuildingValue("condo: 20\\2", 0.9), "condo: 20/2");
  });

  it("routes building_type through the normalizer with confidence gating", () => {
    const low = normalizeSteveFieldValue({ field: "building_type", value: "condo: 20\\2", confidence: 0.5 });
    assert.equal(low.normalized_value, "condo: 20\\2");
    const high = normalizeSteveFieldValue({ field: "building_type", value: "condo: 20\\2", confidence: 0.9 });
    assert.equal(high.normalized_value, "condo: 20/2");
  });
});

describe("Pilot Hotfix #1 — Issue 4 & 5: review UI", () => {
  const source = read("components/DocumentIntakeReview.tsx");

  it("pre-selects the suggested orientation when none is chosen", () => {
    assert.match(source, /suggestedOrientation\?\.suggested_direction/);
  });

  it("still lets the inspector change orientation manually", () => {
    assert.match(source, /setSelectedOrientation\(direction\)/);
  });

  it("highlights fields requiring confirmation with a warning badge", () => {
    assert.match(source, /const confirmBadge/);
    assert.match(source, /bg-amber-100/);
    assert.match(source, /aria-hidden>⚠/);
  });
});
