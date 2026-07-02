/**
 * Phase Photo Intelligence étape 1 — sélection photo persistante.
 * `npm run test:report-photo-selection`
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  computeAiPhotoSelectionDecisions,
  dedupePickedByDuplicateGroup,
  type PhotoForSelection,
} from "@/lib/reportPhotoSelection";
import {
  applyInspectorPhotoSelectionPayload,
  applyObservationLinkSyncToDecision,
  mergeAiPhotoSelectionWithExisting,
  OBSERVATION_REMOVED_SELECTION_REASON,
} from "@/lib/reportPhotoSelectionPersist";
import type { ReportPhotoSelectionDecision } from "@/lib/reportPhotoSelectionTypes";
import type { ReportEntryInput } from "@/lib/reportNarrative";
import { createObservationId } from "@/lib/observationIds";

function photo(
  id: string,
  opts: Partial<PhotoForSelection> = {},
): PhotoForSelection {
  return {
    id,
    serverPhotoId: id,
    linked_zone: opts.linked_zone ?? "installation_electrique",
    analysis: opts.analysis ?? null,
    file_hash: opts.file_hash ?? null,
    ai_score: opts.ai_score,
    ...opts,
  };
}

const electricalEntry: ReportEntryInput = {
  id: createObservationId(),
  zone: "installation_electrique",
  issue: "electrical_risk",
  severity: "high",
  note: "Tableau électrique défectueux",
};

describe("computeAiPhotoSelectionDecisions", () => {
  it("sélectionne les photos avec la meilleure analyse / pertinence", () => {
    const photos = [
      photo("p-weak", {
        analysis: { summary: "Vue générale salon." },
        ai_score: 10,
      }),
      photo("p-strong", {
        analysis: {
          summary:
            "Tableau électrique : fils exposés, risque électrique critique, dommage visible.",
        },
        ai_score: 85,
      }),
      photo("p-medium", {
        analysis: { summary: "Câblage électrique partiellement visible." },
        ai_score: 40,
      }),
    ];

    const decisions = computeAiPhotoSelectionDecisions({
      entries: [electricalEntry],
      photos,
      maxPerFinding: 1,
      maxTotal: 2,
    });

    const selected = decisions.filter((d) => d.reportSelected).map((d) => d.photoId);
    assert.ok(selected.includes("p-strong"), "La photo la plus pertinente doit être retenue");
    assert.ok(
      selected.indexOf("p-strong") < selected.indexOf("p-weak") ||
        !selected.includes("p-weak"),
      "La photo faible ne doit pas passer devant la meilleure",
    );

    const strong = decisions.find((d) => d.photoId === "p-strong");
    assert.equal(strong?.aiRecommended, true);
    assert.ok((strong?.relevanceScore ?? 0) > (decisions.find((d) => d.photoId === "p-weak")?.relevanceScore ?? 0));
  });

  it("évite les doublons (même file_hash → une seule photo retenue)", () => {
    const dupHash = "sha256-duplicate-group-a";
    const photos = [
      photo("dup-a", {
        file_hash: dupHash,
        analysis: { summary: "Fissure mur structure movement déformé." },
        ai_score: 30,
      }),
      photo("dup-b", {
        file_hash: dupHash,
        analysis: { summary: "Fissure mur structure movement déformé — meilleure netteté." },
        ai_score: 90,
      }),
      photo("unique", {
        file_hash: "sha256-unique",
        analysis: { summary: "Tableau électrique fils exposés risque électrique." },
        ai_score: 70,
      }),
    ];

    const decisions = computeAiPhotoSelectionDecisions({
      entries: [electricalEntry],
      photos,
      maxPerFinding: 2,
      maxTotal: 4,
    });

    const selectedDup = decisions.filter(
      (d) => d.duplicateGroup === dupHash && d.reportSelected,
    );
    assert.equal(
      selectedDup.length,
      1,
      "Un seul doublon doit être retenu par groupe file_hash",
    );
    assert.equal(selectedDup[0]?.photoId, "dup-b", "Le doublon le mieux scoré doit être retenu");
  });
});

describe("dedupePickedByDuplicateGroup", () => {
  it("retire le doublon le moins bien scoré", () => {
    const photos = [
      photo("a", { file_hash: "g1" }),
      photo("b", { file_hash: "g1" }),
    ];
    const keyToPhoto = new Map(photos.map((p) => [p.id, p]));
    const picked = new Map([
      ["a", { score: 10, priority: 1, reason: { fr: "a", en: "a" } }],
      ["b", { score: 50, priority: 1, reason: { fr: "b", en: "b" } }],
    ]);
    dedupePickedByDuplicateGroup(picked, keyToPhoto);
    assert.deepEqual([...picked.keys()], ["b"]);
  });
});

describe("mergeAiPhotoSelectionWithExisting — priorité inspecteur", () => {
  it("inspecteur retire une photo IA → réanalyse → reste retirée", () => {
    const aiFirst = computeAiPhotoSelectionDecisions({
      entries: [electricalEntry],
      photos: [
        photo("ai-pick", {
          analysis: { summary: "Tableau électrique fils exposés risque électrique critique." },
          ai_score: 95,
        }),
      ],
      maxPerFinding: 1,
      maxTotal: 1,
    });

    assert.equal(aiFirst.find((d) => d.photoId === "ai-pick")?.reportSelected, true);

    const afterInspectorRemove = applyInspectorPhotoSelectionPayload(aiFirst, {
      selectedPhotoIds: [],
      tiersByPhotoId: {},
    });
    const removed = afterInspectorRemove.find((d) => d.photoId === "ai-pick");
    assert.equal(removed?.reportSelected, false);
    assert.equal(removed?.selectionSource, "inspector");

    const aiReRun = computeAiPhotoSelectionDecisions({
      entries: [electricalEntry],
      photos: [
        photo("ai-pick", {
          analysis: { summary: "Tableau électrique fils exposés risque électrique critique." },
          ai_score: 95,
        }),
      ],
      maxPerFinding: 1,
      maxTotal: 1,
    });

    const merged = mergeAiPhotoSelectionWithExisting(afterInspectorRemove, aiReRun);
    const finalRow = merged.find((d) => d.photoId === "ai-pick");
    assert.equal(finalRow?.reportSelected, false, "Le retrait inspecteur ne doit pas être écrasé");
    assert.equal(finalRow?.selectionSource, "inspector");
  });

  it("inspecteur ajoute une photo → réanalyse → reste ajoutée", () => {
    const aiFirst = computeAiPhotoSelectionDecisions({
      entries: [electricalEntry],
      photos: [
        photo("ai-only", {
          analysis: { summary: "Tableau électrique fils exposés." },
          ai_score: 80,
        }),
        photo("inspector-extra", {
          analysis: { summary: "Vue générale peu détaillée." },
          ai_score: 5,
        }),
      ],
      maxPerFinding: 1,
      maxTotal: 1,
    });

    assert.equal(
      aiFirst.find((d) => d.photoId === "inspector-extra")?.reportSelected,
      false,
    );

    const afterInspectorAdd = applyInspectorPhotoSelectionPayload(aiFirst, {
      selectedPhotoIds: ["ai-only", "inspector-extra"],
      tiersByPhotoId: { "inspector-extra": "support" },
    });

    const added = afterInspectorAdd.find((d) => d.photoId === "inspector-extra");
    assert.equal(added?.reportSelected, true);
    assert.equal(added?.selectionSource, "inspector");

    const aiReRun = computeAiPhotoSelectionDecisions({
      entries: [electricalEntry],
      photos: [
        photo("ai-only", {
          analysis: { summary: "Tableau électrique fils exposés." },
          ai_score: 80,
        }),
        photo("inspector-extra", {
          analysis: { summary: "Vue générale peu détaillée." },
          ai_score: 5,
        }),
      ],
      maxPerFinding: 1,
      maxTotal: 1,
    });

    const merged = mergeAiPhotoSelectionWithExisting(afterInspectorAdd, aiReRun);
    const extra = merged.find((d) => d.photoId === "inspector-extra");
    assert.equal(extra?.reportSelected, true, "L’ajout inspecteur ne doit pas être retiré par l’IA");
    assert.equal(extra?.selectionSource, "inspector");
  });
});

describe("applyObservationLinkSyncToDecision — cohérence observation_id", () => {
  function inspectorRow(
    photoId: string,
    observationId: string | null,
  ): ReportPhotoSelectionDecision {
    return {
      photoId,
      observationId,
      reportSelected: true,
      tier: "support",
      selectionSource: "inspector",
      relevanceScore: 10,
      qualityScore: 5,
      duplicateGroup: null,
      selectionReason: null,
      aiRecommended: false,
      aiRank: null,
    };
  }

  it("A) inspecteur inclut photo, déplace constat A → B : inclusion et source inchangées", () => {
    const obsA = createObservationId();
    const obsB = createObservationId();
    const row = inspectorRow("photo-1", obsA);

    const synced = applyObservationLinkSyncToDecision(row, obsB, {
      validObservationIds: new Set([obsA, obsB]),
    });

    assert.equal(synced.reportSelected, true);
    assert.equal(synced.selectionSource, "inspector");
    assert.equal(synced.observationId, obsB);
  });

  it("B) inspecteur inclut photo, supprime constat : photo conservée en banque, exclusion PDF", () => {
    const obsA = createObservationId();
    const row = inspectorRow("photo-1", obsA);

    const synced = applyObservationLinkSyncToDecision(row, null, {
      validObservationIds: new Set(),
      removedObservationIds: new Set([obsA]),
    });

    assert.equal(synced.observationId, null);
    assert.equal(synced.reportSelected, false);
    assert.equal(synced.selectionSource, "inspector");
    assert.equal(synced.selectionReason, OBSERVATION_REMOVED_SELECTION_REASON);
  });
});
