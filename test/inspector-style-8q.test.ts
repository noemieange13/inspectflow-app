/**
 * Phase 8Q — Inspector style calibration
 * `npm run test:inspector-style-8q`
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";

import {
  buildStyleProfileFromAnalysis,
  containsStrippedPii,
  parseStyleFromReportText,
} from "@/lib/inspector_style_calibration";
import { compareCalibratedStyle, meetsStyleMatchThreshold } from "@/lib/inspector_style_matcher";
import {
  applyProfessionalSnapshotToReportPayload,
  normalizeInspectorProfileInput,
} from "@/lib/inspectorProfile";
import {
  INSPECTOR_REPORT_STYLE_V1_KEY,
  INSPECTOR_STYLE_PROFILE_V1_KEY,
  readInspectorReportStyleFromPayload,
  STEVE_REPORT_STYLE_DEFAULTS,
} from "@/lib/inspectorReportStyle";
import { renderEntriesForReportLanguage } from "@/lib/report_generation_engine";
import {
  REPORT_WRITER_NOTE_MARKER,
  writeProfessionalObservation,
} from "@/lib/report_writer_engine";
import type { AIObservationDraft } from "@/lib/observation_ai_engine";
import type { ReportEntryInput } from "@/lib/reportNarrative";

const ROOT = join(process.cwd());

const FORBIDDEN_PATHS = [
  "supabase/functions/reports-pdf/index.ts",
  "lib/observation_ai_engine/index.ts",
  "lib/photoUploadQueueIdb.ts",
];

const STEVE_SAMPLE_REPORT = `
Rapport d'inspection résidentiel
Client : Jean Tremblay
Adresse : 456 rue Sherbrooke, Montréal, QC H2L 1K4
Courriel : jean.tremblay@example.com
Téléphone : 514-555-0199

Observation
Au niveau du revêtement de toiture, des bardeaux liftés ont été observés lors de l'inspection visuelle.
Il est recommandé de faire évaluer la toiture par un couvreur qualifié afin de préserver la performance du bâtiment.

Recommandation
Faire évaluer par un entrepreneur qualifié. Surveillance à court terme recommandée selon les bonnes pratiques.

Observation
Fissure mineure observée au niveau de la fondation. Cela pourrait évoluer avec le temps si non surveillé.

Recommandation
Surveillance et suivi par un spécialiste qualifié selon la norme applicable.
`;

const SAMPLE_DRAFT: AIObservationDraft = {
  draft_id: "style000000001",
  system: "toiture",
  component: "revêtement de toiture",
  title: "Bardeaux liftés",
  observation_text: "Bardeaux liftés visibles au niveau du revêtement.",
  recommendation: "Faire évaluer par un couvreur qualifié.",
  severity: "attention",
  confidence_score: 0.75,
  source_photo_ids: [],
  reasoning_summary: "test",
  linked_zones: ["toiture"],
  normative_references: ["Norme AIBQ"],
  traceability: {
    ai_generated: true,
    model: "test",
    prompt_version: "test",
    created_at: "2026-06-21T10:00:00.000Z",
  },
};

const MACHINE_ENTRY: ReportEntryInput = {
  id: "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee",
  zone: "toiture",
  issue: "roof_wear",
  severity: "medium",
  note: `${REPORT_WRITER_NOTE_MARKER}\nObservation\nBardeaux liftés visibles.\n\nRecommandation\nCouvreur qualifié.`,
};

function read(rel: string): string {
  return readFileSync(join(ROOT, rel), "utf8");
}

describe("Phase 8Q inspector style calibration", () => {
  it("A) Steve report imported → style_profile created with expected fields", () => {
    const analysis = parseStyleFromReportText(STEVE_SAMPLE_REPORT);
    const profile = buildStyleProfileFromAnalysis(analysis, "2026-06-21T12:00:00.000Z");

    assert.equal(profile.version, "1");
    assert.equal(profile.source, "imported_report");
    assert.ok(profile.avg_finding_length > 0);
    assert.ok(profile.frequent_words.length > 0);
    assert.ok(profile.structure_patterns.includes("observation_section"));
    assert.ok(profile.section_labels.some((l) => /observation/i.test(l)));

    const api = read("app/api/inspector-style/calibrate/route.ts");
    assert.match(api, /parseStyleFromReportText/);
    assert.match(api, /buildStyleProfileFromAnalysis/);
    assert.match(api, /inspector_style_profile_v1/);

    const migration = read(
      "supabase/migrations/20260621100000_inspector_profiles_report_style_8q.sql",
    );
    assert.match(migration, /inspector_report_style_v1/);
    assert.match(migration, /inspector_style_profile_v1/);
  });

  it("B) writer context includes inspector_style and respects detail_level", () => {
    const concise = writeProfessionalObservation({
      draft: SAMPLE_DRAFT,
      normative_context: {
        province: "QC",
        language: "fr",
        norme: "Norme AIBQ",
        inspector_style: {
          version: "1",
          detail_level: "concise",
          tone: "direct",
          photo_density: "standard",
          recommendation_style: "short_action",
        },
      },
    });

    const detailed = writeProfessionalObservation({
      draft: SAMPLE_DRAFT,
      normative_context: {
        province: "QC",
        language: "fr",
        norme: "Norme AIBQ",
        inspector_style: {
          version: "1",
          detail_level: "detailed",
          tone: "educational",
          photo_density: "standard",
          recommendation_style: "explanatory",
        },
      },
    });

    assert.equal(concise.text.traceability.inspector_style?.detail_level, "concise");
    assert.equal(detailed.text.traceability.inspector_style?.detail_level, "detailed");
    assert.ok(
      concise.text.recommendation.length <= detailed.text.recommendation.length + 40,
      "concise recommendations should not exceed detailed",
    );

    const writerSrc = read("lib/report_writer_engine/writeObservation.ts");
    assert.match(writerSrc, /inspector_style/);
    assert.match(writerSrc, /adaptWrittenTextForInspectorStyle/);
    assert.doesNotMatch(read("lib/observation_ai_engine/index.ts"), /inspector_style/);
  });

  it("C) PII stripping — client names/addresses never in style_profile", () => {
    const analysis = parseStyleFromReportText(STEVE_SAMPLE_REPORT);
    const profile = buildStyleProfileFromAnalysis(analysis);
    const serialized = JSON.stringify(profile);

    assert.equal(containsStrippedPii(serialized, ["Jean Tremblay"]), false);
    assert.equal(containsStrippedPii(serialized, ["456 rue Sherbrooke"]), false);
    assert.equal(containsStrippedPii(serialized, ["jean.tremblay@example.com"]), false);
    assert.equal(containsStrippedPii(serialized, ["514-555-0199"]), false);
    assert.doesNotMatch(analysis.sanitized_text, /Jean Tremblay/i);
    assert.doesNotMatch(analysis.sanitized_text, /jean\.tremblay@example\.com/i);
  });

  it("D) conformité remains priority — compliance markers preserved", () => {
    const written = writeProfessionalObservation({
      draft: SAMPLE_DRAFT,
      normative_context: {
        province: "QC",
        language: "fr",
        norme: "Norme AIBQ",
        inspector_style: STEVE_REPORT_STYLE_DEFAULTS,
      },
    });

    assert.match(written.text.recommendation, /Réf\.|Norme|qualifié/i);
    assert.match(written.formatted_note, /Observation/);
    assert.match(written.formatted_note, /Recommandation/);

    const languageSrc = read("lib/report_writer_engine/language.ts");
    assert.match(languageSrc, /buildRecommendationText/);
    assert.match(languageSrc, /PROVINCES/);
  });

  it("E) bilingual respects style — fr/en writer context includes style params", () => {
    const style = {
      version: "1" as const,
      detail_level: "detailed" as const,
      tone: "educational" as const,
      photo_density: "standard" as const,
      recommendation_style: "explanatory" as const,
    };

    const fr = writeProfessionalObservation({
      draft: SAMPLE_DRAFT,
      normative_context: { province: "QC", language: "fr", inspector_style: style },
    });
    const en = writeProfessionalObservation({
      draft: SAMPLE_DRAFT,
      normative_context: { province: "ON", language: "en", inspector_style: style },
    });

    assert.equal(fr.text.traceability.inspector_style?.tone, "educational");
    assert.equal(en.text.traceability.inspector_style?.tone, "educational");
    assert.match(fr.text.observation, /revêtement|toiture/i);
    assert.match(en.text.impact, /roof|performance|deterioration|safety|wear/i);

    const payload = {
      [INSPECTOR_REPORT_STYLE_V1_KEY]: style,
      entries: [MACHINE_ENTRY],
      cover_v1: { address: "123 Rue Main" },
    };
    const renderedFr = renderEntriesForReportLanguage([MACHINE_ENTRY], payload, "fr-CA", "ca_qc");
    const renderedEn = renderEntriesForReportLanguage([MACHINE_ENTRY], payload, "en-CA", "ca_qc");
    assert.ok(renderedFr[0]!.note?.length);
    assert.ok(renderedEn[0]!.note?.length);
    assert.match(renderedEn[0]!.note ?? "", /Observation|Recommendation|Possible consequence/i);
  });

  it("payload embeds inspector_report_style_v1 on inspection creation", () => {
    const profile = normalizeInspectorProfileInput({
      display_name: "Steve Last",
      certification_number: "123",
      association: "AIBQ",
      inspector_report_style_v1: STEVE_REPORT_STYLE_DEFAULTS,
    });
    const enriched = applyProfessionalSnapshotToReportPayload({ cover_v1: {} }, profile);
    const style = readInspectorReportStyleFromPayload(enriched);
    assert.equal(style?.detail_level, "detailed");
    assert.equal(style?.tone, "educational");
    assert.deepEqual(enriched[INSPECTOR_REPORT_STYLE_V1_KEY], style);
  });

  it("style matcher — compareCalibratedStyle and threshold", () => {
    const analysis = parseStyleFromReportText(STEVE_SAMPLE_REPORT);
    const profile = buildStyleProfileFromAnalysis(analysis);
    const scores = compareCalibratedStyle(profile, analysis.sanitized_text);
    assert.ok(scores.overallPct >= 70);
    assert.ok(scores.structurePct >= 0);
    assert.ok(meetsStyleMatchThreshold(scores, 70));
    assert.equal(meetsStyleMatchThreshold({ ...scores, overallPct: 50 }, 95), false);
  });

  it("non-regression — forbidden cores untouched; 8P workflow intact", () => {
    for (const rel of FORBIDDEN_PATHS) {
      const src = read(rel);
      assert.doesNotMatch(src, /inspector_style_calibration/);
      assert.doesNotMatch(src, /inspector_report_style_v1/);
    }

    const workflow = read("lib/inspectorWorkflow.ts");
    assert.match(workflow, /buildInspectionWorkflowV1/);
    assert.doesNotMatch(workflow, /inspector_report_style/);

    const postWs = read("components/PostInspectionWorkspace.tsx");
    assert.match(postWs, /fast-report\/generate/);

    const writerOnly = [
      "lib/report_writer_engine/writeObservation.ts",
      "lib/report_writer_engine/inspectorStyle.ts",
      "lib/report_writer_engine/types.ts",
    ];
    for (const f of writerOnly) {
      assert.ok(read(f).includes("inspector_style") || read(f).includes("InspectorReportStyle"));
    }

    const ui = read("components/settings/StyleCalibrationSection.tsx");
    assert.match(ui, /Calibrer avec mon ancien rapport/);
    assert.match(ui, /inspector-style\/calibrate/);
  });
});
