/**
 * Phase 3C — inspection_knowledge_engine
 * `npm run test:inspection-knowledge-engine-3c`
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  evaluateInspectionKnowledge,
  filterUnknownReferences,
  INSPECTION_KNOWLEDGE_BASE_VERSION,
  isKnownReferenceId,
  stableKnowledgeSnapshot,
} from "@/lib/inspection_knowledge_engine";

const baseContext = {
  system: "electricite",
  component: "panneau électrique",
  building_age: 35,
  norm_version: "1.0.0",
};

describe("evaluateInspectionKnowledge", () => {
  it("A) défaut électrique sécurité QC → spécialiste requis", () => {
    const result = evaluateInspectionKnowledge({
      context: {
        ...baseContext,
        province: "QC",
        norm_body: "AIBQ",
        severity: "safety",
        language: "fr",
      },
      draft_confidence: 0.9,
    });

    assert.equal(result.specialist_required, true);
    assert.equal(result.urgency_level, "immediate");
    assert.match(result.recommended_action, /spécialiste qualifié/i);
    assert.ok(result.applicable_references.every((r) => isKnownReferenceId(r.id)));
    assert.equal(result.knowledge_base_version, INSPECTION_KNOWLEDGE_BASE_VERSION);
  });

  it("B) entretien mineur → pas de spécialiste obligatoire", () => {
    const result = evaluateInspectionKnowledge({
      context: {
        ...baseContext,
        province: "QC",
        norm_body: "AIBQ",
        severity: "maintenance",
        system: "toiture",
        component: "bardeaux",
        language: "fr",
      },
    });

    assert.equal(result.specialist_required, false);
    assert.equal(result.urgency_level, "routine");
    assert.match(result.recommended_action, /entretien courant/i);
  });

  it("C) province sans règles détaillées → recommandation générale seulement", () => {
    const result = evaluateInspectionKnowledge({
      context: {
        ...baseContext,
        province: "MB",
        norm_body: "CAHPI",
        severity: "attention",
        language: "en",
      },
    });

    assert.equal(result.applicable_references.length, 1);
    assert.equal(result.applicable_references[0]?.id, "ca:general:visual");
    assert.match(result.recommended_action, /follow-up|short term/i);
  });

  it("D) référence inconnue → jamais inventée", () => {
    assert.deepEqual(filterUnknownReferences(["aibq:sop:electrical", "fake:code:999"]), [
      "aibq:sop:electrical",
    ]);

    const result = evaluateInspectionKnowledge({
      context: {
        ...baseContext,
        province: "QC",
        norm_body: "AIBQ",
        severity: "major",
        language: "fr",
      },
      draft_reference_hints: [
        "Code inventé XYZ-999 — interdit",
        "Norme imaginaire province fictive",
      ],
    });

    for (const ref of result.applicable_references) {
      assert.ok(isKnownReferenceId(ref.id));
      assert.doesNotMatch(ref.label, /XYZ-999|imaginaire|fictive/i);
      assert.doesNotMatch(ref.source_url, /xyz-999/i);
    }
  });

  it("E) relance moteur → résultat stable versionné", () => {
    const input = {
      context: {
        ...baseContext,
        province: "ON",
        norm_body: "OAHI" as const,
        severity: "major" as const,
        language: "en" as const,
      },
      draft_confidence: 0.8,
    };

    const a = stableKnowledgeSnapshot(evaluateInspectionKnowledge(input));
    const b = stableKnowledgeSnapshot(evaluateInspectionKnowledge(input));

    assert.deepEqual(a, b);
    assert.equal(a.knowledge_base_version, INSPECTION_KNOWLEDGE_BASE_VERSION);
  });
});
