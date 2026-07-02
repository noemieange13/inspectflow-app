/**
 * Phase 3B — report_writer_engine
 * `npm run test:report-writer-engine-3b`
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";

import type { AIObservationDraft } from "@/lib/observation_ai_engine";
import {
  containsInventedCause,
  mergeProfessionalNoteWithExisting,
  REPORT_WRITER_PROMPT_VERSION,
  shouldPreserveInspectorEntryNote,
  writeProfessionalObservation,
} from "@/lib/report_writer_engine";

function baseDraft(
  partial: Partial<AIObservationDraft> & Pick<AIObservationDraft, "severity" | "system">,
): AIObservationDraft {
  return {
    draft_id: "draft-test-001",
    component: partial.component ?? "revêtement",
    title: partial.title ?? "Constat test",
    observation_text: partial.observation_text ?? "Signes visibles",
    recommendation: partial.recommendation ?? "Suivi",
    confidence_score: partial.confidence_score ?? 0.75,
    source_photo_ids: partial.source_photo_ids ?? ["p1"],
    reasoning_summary: partial.reasoning_summary ?? "test",
    linked_zones: partial.linked_zones ?? ["toiture"],
    normative_references: partial.normative_references ?? ["Norme pratique AIBQ"],
    traceability: {
      ai_generated: true,
      model: "observation-engine-v1",
      prompt_version: "observation-draft-v1",
      created_at: "2026-06-15T10:00:00.000Z",
    },
    ...partial,
  };
}

describe("writeProfessionalObservation", () => {
  it("A) défaut toiture — observation factuelle, aucune cause inventée", () => {
    const { text } = writeProfessionalObservation({
      draft: baseDraft({
        system: "toiture",
        component: "revêtement de toiture",
        severity: "major",
        observation_text:
          "La fuite provient du toit — bardeaux liftés et traces d'humidité visibles",
      }),
      normative_context: { province: "QC", language: "fr", norme: "Norme AIBQ" },
    });

    assert.match(text.observation, /inspection visuelle|À l'inspection/i);
    assert.equal(containsInventedCause(text.observation), false);
    assert.match(text.observation, /compatible avec|observ/i);
    assert.ok(text.impact.length > 0);
    assert.ok(text.recommendation.length > 0);
    assert.notEqual(text.observation, text.recommendation);
  });

  it("B) défaut électrique safety — recommandation spécialiste", () => {
    const { text } = writeProfessionalObservation({
      draft: baseDraft({
        system: "electricite",
        component: "panneau électrique",
        severity: "safety",
        observation_text: "Conducteurs exposés au panneau",
        confidence_score: 0.92,
      }),
      normative_context: { province: "QC", language: "fr" },
    });

    assert.match(text.recommendation, /spécialiste qualifié|specialist/i);
    assert.equal(text.traceability.prompt_version, REPORT_WRITER_PROMPT_VERSION);
  });

  it("C) maintenance mineure — pas de langage alarmiste", () => {
    const { text } = writeProfessionalObservation({
      draft: baseDraft({
        system: "toiture",
        severity: "maintenance",
        observation_text: "Usure légère des bardeaux",
        confidence_score: 0.6,
      }),
      normative_context: { province: "QC", language: "fr" },
    });

    assert.match(text.recommendation, /entretien courant|routine maintenance/i);
    assert.doesNotMatch(text.impact, /urgence|emergency|évacuation/i);
    assert.doesNotMatch(text.recommendation, /urgence|emergency|évacuation/i);
  });

  it("D) FR / EN — vocabulaire approprié", () => {
    const draft = baseDraft({
      system: "structure",
      component: "fondation",
      severity: "attention",
      observation_text: "Fissure horizontale visible",
    });

    const fr = writeProfessionalObservation({
      draft,
      normative_context: { province: "QC", language: "fr" },
    });
    const en = writeProfessionalObservation({
      draft,
      normative_context: { province: "ON", language: "en" },
    });

    assert.match(fr.formatted_note, /Conséquence possible/);
    assert.match(en.formatted_note, /Possible consequence/);
    assert.match(fr.text.recommendation, /court terme|suivi/i);
    assert.match(en.text.recommendation, /short term|follow-up|maintenance/i);
  });
});

describe("protectInspector", () => {
  it("E) texte inspecteur modifié → jamais remplacé", () => {
    const inspectorNote = "Constat rédigé et validé par l'inspecteur sur place.";
    assert.equal(shouldPreserveInspectorEntryNote(inspectorNote), true);

    const merged = mergeProfessionalNoteWithExisting(
      inspectorNote,
      "Brouillon IA qui ne doit pas écraser.",
    );
    assert.equal(merged, inspectorNote);
  });
});
