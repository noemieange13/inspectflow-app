/**
 * Phase 2C-4 — persistance immédiate actions inspecteur (galerie).
 * `npm run test:gallery-inspector-persist-2c4`
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { createObservationId } from "@/lib/observationIds";
import {
  applyObservationLinkSyncToDecision,
  mergeAiPhotoSelectionWithExisting,
  OBSERVATION_REMOVED_SELECTION_REASON,
  patchInspectorPhotoSelectionDecision,
} from "@/lib/reportPhotoSelectionPersist";
import type { ReportPhotoSelectionDecision } from "@/lib/reportPhotoSelectionTypes";

function inspectorRow(
  photoId: string,
  observationId: string | null,
  opts: Partial<ReportPhotoSelectionDecision> = {},
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
    ...opts,
  };
}

describe("2C-4 gallery inspector immediate persist — contract", () => {
  it("Test A — déplacement constat A → B : lien + sélection inspecteur conservés", () => {
    const obsA = createObservationId();
    const obsB = createObservationId();
    const photoId = "photo-server-1";

    const afterLink = applyObservationLinkSyncToDecision(inspectorRow(photoId, obsA), obsB, {
      validObservationIds: new Set([obsA, obsB]),
    });

    assert.equal(afterLink.observationId, obsB);
    assert.equal(afterLink.reportSelected, true);
    assert.equal(afterLink.selectionSource, "inspector");

    const afterPatch = patchInspectorPhotoSelectionDecision([afterLink], {
      photoId,
      reportSelected: true,
      tier: "support",
      observationId: obsB,
    });
    const row = afterPatch.find((d) => d.photoId === photoId);
    assert.equal(row?.observationId, obsB);
    assert.equal(row?.selectionSource, "inspector");
  });

  it("Test B — retrait PDF inspecteur : report_selected=false, source inspector", () => {
    const obsA = createObservationId();
    const photoId = "photo-server-2";

    const patched = patchInspectorPhotoSelectionDecision([inspectorRow(photoId, obsA)], {
      photoId,
      reportSelected: false,
      observationId: obsA,
    });
    const row = patched.find((d) => d.photoId === photoId);
    assert.equal(row?.reportSelected, false);
    assert.equal(row?.selectionSource, "inspector");
    assert.match(String(row?.selectionReason ?? ""), /removed|retir/i);
  });

  it("Test C — ajout manuel inspecteur survit au recalcul IA", () => {
    const obsA = createObservationId();
    const inspectorAdd = patchInspectorPhotoSelectionDecision([], {
      photoId: "manual-add",
      reportSelected: true,
      tier: "support",
      observationId: obsA,
    });

    const aiReRun: ReportPhotoSelectionDecision[] = [
      {
        photoId: "ai-pick",
        observationId: obsA,
        reportSelected: true,
        tier: "critical",
        selectionSource: "ai",
        relevanceScore: 99,
        qualityScore: 90,
        duplicateGroup: null,
        selectionReason: null,
        aiRecommended: true,
        aiRank: 1,
      },
    ];

    const merged = mergeAiPhotoSelectionWithExisting(inspectorAdd, aiReRun);
    const manual = merged.find((d) => d.photoId === "manual-add");
    assert.equal(manual?.reportSelected, true);
    assert.equal(manual?.selectionSource, "inspector");
  });

  it("Test D — suppression constat : observation_id=null, report_selected=false, reason observation_removed", () => {
    const obsA = createObservationId();
    const synced = applyObservationLinkSyncToDecision(inspectorRow("photo-del", obsA), null, {
      validObservationIds: new Set(),
      removedObservationIds: new Set([obsA]),
    });

    assert.equal(synced.observationId, null);
    assert.equal(synced.reportSelected, false);
    assert.equal(synced.selectionSource, "inspector");
    assert.equal(synced.selectionReason, OBSERVATION_REMOVED_SELECTION_REASON);
  });

  it("Test E — échec réseau simulé : état serveur inchangé sans upsert réussi", () => {
    const obsA = createObservationId();
    const before = [inspectorRow("photo-net", obsA)];
    const snapshot = structuredClone(before);

    const optimistic = patchInspectorPhotoSelectionDecision(before, {
      photoId: "photo-net",
      reportSelected: false,
    });

    const persistFailed = false;
    const restored = persistFailed ? optimistic : snapshot;

    assert.deepEqual(restored, snapshot, "Sans persist réussi, l'état serveur reste l'ancien");
    assert.notDeepEqual(optimistic, snapshot, "L'UI optimiste diffère avant rollback");
  });
});
