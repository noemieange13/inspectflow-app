/**
 * Galerie photos virtualisée — filtres, recherche, badges.
 * `npm run test:inspection-photo-gallery`
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  computePhotoGalleryBadges,
  DEFAULT_GALLERY_FILTERS,
  filterInspectionPhotos,
  galleryTotalHeightPx,
  galleryVisibleRowRange,
  GALLERY_COLUMNS,
  GALLERY_ROW_HEIGHT_PX,
  photoHasAnalysis,
  photoHasDetectedProblem,
  photoIsDuplicate,
  type InspectionPhotoGalleryItem,
} from "@/lib/inspectionPhotoGallery";

function photo(partial: Partial<InspectionPhotoGalleryItem> & { id: string }): InspectionPhotoGalleryItem {
  return {
    id: partial.id,
    name: partial.name ?? partial.id,
    url: partial.url ?? "https://example.com/p.jpg",
    uploading: partial.uploading ?? false,
    ...partial,
  };
}

const validObs = new Set(["obs-1"]);
const isSelected = (p: InspectionPhotoGalleryItem) =>
  !!p.observation_id && validObs.has(p.observation_id) && p.report_tier !== "excluded";

describe("filterInspectionPhotos", () => {
  const base = [
    photo({
      id: "a",
      observation_id: "obs-1",
      report_tier: "support",
      analysis: { summary: "ok" },
      analysis_status: "complete",
    }),
    photo({ id: "b", analysis_status: "pending" }),
    photo({
      id: "c",
      duplicate_of_photo_id: "leader",
      analysis_status: "skipped",
    }),
    photo({
      id: "d",
      linked_zone: "installation_electrique",
      analysis: { summary: "panneau electrique" },
      analysis_status: "complete",
    }),
  ];

  it("filtre non analysées", () => {
    const out = filterInspectionPhotos(base, {
      filter: "not_analyzed",
      search: "",
      validObservationIds: validObs,
      isSelectedForReport: isSelected,
    });
    assert.deepEqual(out.map((x) => x.id), ["b"]);
  });

  it("filtre doublons", () => {
    const out = filterInspectionPhotos(base, {
      filter: "duplicates",
      search: "",
      validObservationIds: validObs,
      isSelectedForReport: isSelected,
    });
    assert.deepEqual(out.map((x) => x.id), ["c"]);
  });

  it("recherche électricité", () => {
    const out = filterInspectionPhotos(base, {
      filter: "all",
      search: "electricity",
      validObservationIds: validObs,
      isSelectedForReport: isSelected,
    });
    assert.deepEqual(out.map((x) => x.id), ["d"]);
  });

  it("recherche humidité par texte analyse", () => {
    const humid = photo({
      id: "h",
      analysis: { summary: "infiltration d eau sous sol", severity_hint: "low" },
      analysis_status: "complete",
    });
    const out = filterInspectionPhotos([humid], {
      filter: "all",
      search: "humidity",
      validObservationIds: validObs,
      isSelectedForReport: isSelected,
    });
    assert.equal(out.length, 1);
  });
});

describe("computePhotoGalleryBadges", () => {
  it("badges analysée, liée, rapport, problème", () => {
    const badges = computePhotoGalleryBadges(
      photo({
        id: "x",
        observation_id: "obs-1",
        report_tier: "support",
        analysis: {
          defects_or_risks: ["fissure"],
          severity_hint: "high",
        },
        analysis_status: "complete",
      }),
      { validObservationIds: validObs, isSelectedForReport: isSelected },
    );
    assert.deepEqual(badges, ["analyzed", "linked_finding", "report_selection", "problem"]);
  });
});

describe("photo helpers", () => {
  it("photoHasAnalysis via status skipped", () => {
    assert.equal(photoHasAnalysis(photo({ id: "s", analysis_status: "skipped" })), true);
  });

  it("photoIsDuplicate", () => {
    assert.equal(photoIsDuplicate(photo({ id: "d", duplicate_of_photo_id: "lead" })), true);
  });

  it("photoHasDetectedProblem medium severity", () => {
    assert.equal(
      photoHasDetectedProblem(
        photo({ id: "p", analysis: { severity_hint: "medium", defects_or_risks: [] } }),
      ),
      true,
    );
  });
});

describe("galleryVisibleRowRange", () => {
  it("500 photos → fenêtre visible bornée", () => {
    const count = 500;
    const range = galleryVisibleRowRange(0, 420, count);
    assert.equal(range.startRow, 0);
    assert.ok(range.endRow < galleryTotalHeightPx(count) / GALLERY_ROW_HEIGHT_PX);
    assert.ok((range.endRow - range.startRow) * GALLERY_COLUMNS < count);
  });

  it("total height 500 photos en grille 3 colonnes", () => {
    const h = galleryTotalHeightPx(500);
    assert.equal(h, Math.ceil(500 / GALLERY_COLUMNS) * GALLERY_ROW_HEIGHT_PX);
  });
});

describe("2C-2 — filtres galerie 500 photos", () => {
  const validObs = new Set(["obs-linked"]);
  const isSelectedForReport = (p: InspectionPhotoGalleryItem) =>
    p.report_tier === "critical" || (p.report_tier === "support" && !!p.observation_id);

  function build500(): InspectionPhotoGalleryItem[] {
    return Array.from({ length: 500 }, (_, i) =>
      photo({
        id: `p-${i}`,
        observation_id: i % 5 === 0 ? "obs-linked" : null,
        report_tier: i % 7 === 0 ? "critical" : "excluded",
        analysis_status:
          i % 11 === 0 ? "failed" : i % 13 === 0 ? "pending" : "complete",
        linked_zone: i % 17 === 0 ? "installation_electrique" : "autre",
        analysis:
          i % 19 === 0
            ? { defects_or_risks: ["fissure"], severity_hint: "high" as const }
            : i % 17 === 0
              ? { summary: "panneau electrique visible" }
              : { summary: "vue generale" },
      }),
    );
  }

  it("A) 500 photos, filtre non liées → sans observation_id valide", () => {
    const all = build500();
    const out = filterInspectionPhotos(all, {
      filters: { ...DEFAULT_GALLERY_FILTERS, association: "unlinked" },
      validObservationIds: validObs,
      isSelectedForReport,
    });
    assert.equal(out.length, 400);
    for (const p of out) {
      assert.ok(!p.observation_id || !validObs.has(p.observation_id));
    }
  });

  it("B) filtre PDF → utilise isSelectedForReport (report_selected)", () => {
    const all = build500();
    const out = filterInspectionPhotos(all, {
      filters: { ...DEFAULT_GALLERY_FILTERS, report: "in_pdf" },
      validObservationIds: validObs,
      isSelectedForReport,
    });
    assert.ok(out.length > 0);
    for (const p of out) {
      assert.equal(isSelectedForReport(p), true);
    }
  });

  it("C) filtre erreur → analysis_status failed", () => {
    const all = build500();
    const out = filterInspectionPhotos(all, {
      filters: { ...DEFAULT_GALLERY_FILTERS, status: "failed" },
      validObservationIds: validObs,
      isSelectedForReport,
    });
    assert.ok(out.length > 0);
    for (const p of out) {
      assert.equal(p.analysis_status, "failed");
    }
  });

  it("D) combinaison filtres → intersection (électricité + non liées + anomalies)", () => {
    const samples = [
      photo({
        id: "match",
        observation_id: null,
        linked_zone: "installation_electrique",
        analysis: { defects_or_risks: ["risque electrique"] },
        analysis_status: "complete",
      }),
      photo({
        id: "linked-wrong",
        observation_id: "obs-linked",
        linked_zone: "installation_electrique",
        analysis: { defects_or_risks: ["risque"] },
        analysis_status: "complete",
        report_tier: "support",
      }),
      photo({
        id: "no-anomaly",
        observation_id: null,
        linked_zone: "installation_electrique",
        analysis: { summary: "panneau electrique ok" },
        analysis_status: "complete",
      }),
    ];
    const out = filterInspectionPhotos(samples, {
      filters: {
        ...DEFAULT_GALLERY_FILTERS,
        association: "unlinked",
        ai: "with_anomaly",
        system: "electricite",
      },
      validObservationIds: validObs,
      isSelectedForReport,
    });
    assert.deepEqual(out.map((x) => x.id), ["match"]);
  });

  it("E) aucun filtre → 500 visibles", () => {
    const all = build500();
    const out = filterInspectionPhotos(all, {
      filters: DEFAULT_GALLERY_FILTERS,
      validObservationIds: validObs,
      isSelectedForReport,
    });
    assert.equal(out.length, 500);
  });
});
