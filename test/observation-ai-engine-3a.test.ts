/**
 * Phase 3A — observation_ai_engine
 * `npm run test:observation-ai-engine-3a`
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  generateObservationDrafts,
  identifyInspectorLockedEntryIds,
  mergeObservationDraftsOnRerun,
  OBSERVATION_AI_ENGINE_PROMPT_VERSION,
  type AIObservationDraft,
} from "@/lib/observation_ai_engine";
import { proposeQcEntryDraftsFromPhotoRows } from "@/lib/proposeQcEntryDraftsFromPhotoRows";

const crackAnalysis = {
  summary: "Fissure horizontale visible sur la fondation",
  observations: ["Fissure en maçonnerie", "Joints ouverts"],
  defects_or_risks: ["Fissure fondation", "fissure horizontale"],
  severity_hint: "medium" as const,
  suggested_building_zone: "fondation",
};

describe("generateObservationDrafts", () => {
  const context = {
    province: "QC",
    norme: "Norme pratique AIBQ",
    building_type: "Unifamiliale",
    construction_year: 1985,
    language: "fr" as const,
  };

  it("A) 5 photos même défaut → 1 constat, 5 photos liées", () => {
    const photos = Array.from({ length: 5 }, (_, i) => ({
      id: `photo-crack-${i}`,
      observation_id: null,
      analysis: crackAnalysis,
      linked_zone: "fondation",
    }));

    const result = generateObservationDrafts({ photos, context });
    assert.equal(result.drafts.length, 1);
    assert.equal(result.drafts[0]?.source_photo_ids.length, 5);
    assert.equal(result.drafts[0]?.traceability.ai_generated, true);
    assert.equal(result.drafts[0]?.traceability.prompt_version, OBSERVATION_AI_ENGINE_PROMPT_VERSION);
  });

  it("B) photo normale panneau électrique → aucune anomalie créée", () => {
    const result = generateObservationDrafts({
      photos: [
        {
          id: "panel-ok",
          analysis: {
            summary: "Panneau électrique conforme, étiquetage lisible",
            observations: ["Couverture intacte", "Aucun signe de surchauffe"],
            defects_or_risks: [],
            severity_hint: "low",
            suggested_building_zone: "installation_electrique",
          },
          linked_zone: "installation_electrique",
        },
      ],
      context,
    });
    assert.equal(result.drafts.length, 0);
    assert.deepEqual(result.skipped_normal_photos, ["panel-ok"]);
  });

  it("D) défaut sécurité → severity safety", () => {
    const result = generateObservationDrafts({
      photos: [
        {
          id: "elec-risk",
          analysis: {
            summary: "Fil dénudé au panneau — risque électrique immédiat",
            observations: ["Conducteurs exposés"],
            defects_or_risks: ["risque électrique sécurité"],
            severity_hint: "high",
            suggested_building_zone: "installation_electrique",
          },
        },
      ],
      context,
    });
    assert.equal(result.drafts[0]?.severity, "safety");
    assert.ok(result.drafts[0]?.normative_references.length > 0);
  });
});

describe("protection inspecteur + relance IA", () => {
  it("C) constat modifié inspecteur → verrouillé", () => {
    const locked = identifyInspectorLockedEntryIds([
      {
        id: "entry-inspector-1",
        note: "Libellé corrigé par l'inspecteur sur le terrain.",
      },
    ]);
    assert.ok(locked.has("entry-inspector-1"));
  });

  it("E) relance IA → mise à jour seulement des brouillons IA non verrouillés", () => {
    const prev: AIObservationDraft[] = [
      {
        draft_id: "aaa111",
        system: "structure",
        component: "fondation",
        title: "Ancien brouillon",
        observation_text: "Texte A",
        recommendation: "Rec A",
        severity: "attention",
        confidence_score: 0.7,
        source_photo_ids: ["p1"],
        reasoning_summary: "old",
        linked_zones: ["fondation"],
        normative_references: ["Norme QC"],
        traceability: {
          ai_generated: true,
          model: "observation-engine-v1",
          prompt_version: "observation-draft-v1",
          created_at: "2026-01-01T00:00:00.000Z",
        },
      },
      {
        draft_id: "bbb222",
        system: "electricite",
        component: "panneau",
        title: "Brouillon verrouillé",
        observation_text: "Texte B inspecteur",
        recommendation: "Rec B",
        severity: "safety",
        confidence_score: 0.9,
        source_photo_ids: ["p2"],
        reasoning_summary: "locked",
        linked_zones: ["installation_electrique"],
        normative_references: ["Norme QC"],
        traceability: {
          ai_generated: true,
          model: "observation-engine-v1",
          prompt_version: "observation-draft-v1",
          created_at: "2026-01-01T00:00:00.000Z",
        },
      },
    ];

    const next: AIObservationDraft[] = [
      {
        ...prev[0]!,
        title: "Brouillon mis à jour",
        observation_text: "Texte A v2",
        confidence_score: 0.85,
        traceability: {
          ...prev[0]!.traceability,
          created_at: "2026-06-15T12:00:00.000Z",
        },
      },
      {
        ...prev[1]!,
        title: "Tentative écrasement",
        observation_text: "Ne doit pas remplacer",
      },
    ];

    const merged = mergeObservationDraftsOnRerun(prev, next, {
      inspector_locked_draft_ids: new Set(["bbb222"]),
    });

    const a = merged.find((d) => d.draft_id === "aaa111");
    const b = merged.find((d) => d.draft_id === "bbb222");
    assert.equal(a?.observation_text, "Texte A v2");
    assert.equal(b?.observation_text, "Texte B inspecteur");
  });
});

describe("proposeQcEntryDraftsFromPhotoRows — adaptateur QC", () => {
  it("ne propose rien sans anomalie (grille QC complète)", () => {
    const entries = proposeQcEntryDraftsFromPhotoRows(
      [
        { zone: "toiture", note: "OK" },
        { zone: "fondation", note: "OK" },
        { zone: "installation_electrique", note: "OK" },
        { zone: "plomberie", note: "OK" },
        { zone: "sous_sol", note: "OK" },
        { zone: "grenier", note: "OK" },
        { zone: "salon", note: "OK" },
      ],
      [
        {
          id: "p-normal",
          analysis: {
            summary: "Vue générale sans défaut",
            defects_or_risks: [],
            severity_hint: "low",
          },
        },
      ],
      "fr",
    );
    assert.equal(entries.length, 0);
  });
});
