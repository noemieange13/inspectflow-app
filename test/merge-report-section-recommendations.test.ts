/**
 * Garde-fou : recommandations de section personnalisées (QC Copilot) ne doivent
 * pas être écrasées par une régénération / un override partiel.
 * `npm run test:section-reco-merge`
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  applySectionRecommendationOverrides,
  mergeReportSectionRecommendations,
} from "@/lib/mergeReportSectionRecommendations";

const gen = [
  {
    title: "Toiture - Infiltration",
    severity: "Élevée",
    recommendation: "Template reco 0",
    observation: "obs0",
    order: 1,
  },
  {
    title: "Électricité - Panneau",
    severity: "Moyenne",
    recommendation: "Template reco 1",
    observation: "obs1",
    order: 2,
  },
];

describe("mergeReportSectionRecommendations", () => {
  it("preserves prior custom recommendations when title+severity match (autosave wipe)", () => {
    const existing = [
      { ...gen[0], recommendation: "QC custom for section 0" },
      { ...gen[1] },
    ];
    const out = mergeReportSectionRecommendations(gen, existing, undefined);
    assert.equal(out[0]!.recommendation, "QC custom for section 0");
    assert.equal(out[1]!.recommendation, "Template reco 1");
  });

  it("keeps earlier custom reco when a later sparse override is applied", () => {
    const existing = [
      { ...gen[0], recommendation: "QC custom for section 0" },
      { ...gen[1] },
    ];
    const out = mergeReportSectionRecommendations(gen, existing, {
      "1": "QC custom for section 1",
    });
    assert.equal(out[0]!.recommendation, "QC custom for section 0");
    assert.equal(out[1]!.recommendation, "QC custom for section 1");
  });

  it("lets request overrides win over preserved customs", () => {
    const existing = [
      { ...gen[0], recommendation: "old custom 0" },
      { ...gen[1], recommendation: "old custom 1" },
    ];
    const out = mergeReportSectionRecommendations(gen, existing, {
      "0": "new override 0",
    });
    assert.equal(out[0]!.recommendation, "new override 0");
    assert.equal(out[1]!.recommendation, "old custom 1");
  });

  it("drops prior reco when severity changes (identity mismatch)", () => {
    const existing = [
      { ...gen[0], severity: "Faible", recommendation: "stale for old severity" },
      { ...gen[1] },
    ];
    const out = mergeReportSectionRecommendations(gen, existing, undefined);
    assert.equal(out[0]!.recommendation, "Template reco 0");
  });

  it("drops prior reco when title/identity changes", () => {
    const existing = [
      {
        title: "Autre zone - Autre issue",
        severity: "Élevée",
        recommendation: "stale for other finding",
      },
      { ...gen[1] },
    ];
    const out = mergeReportSectionRecommendations(gen, existing, undefined);
    assert.equal(out[0]!.recommendation, "Template reco 0");
  });
});

describe("applySectionRecommendationOverrides", () => {
  it("ignores empty / invalid override entries", () => {
    const out = applySectionRecommendationOverrides(gen, {
      "0": "  ",
      "1": 42,
      "9": "out of range",
      bad: "nope",
    });
    assert.equal(out[0]!.recommendation, "Template reco 0");
    assert.equal(out[1]!.recommendation, "Template reco 1");
  });
});
