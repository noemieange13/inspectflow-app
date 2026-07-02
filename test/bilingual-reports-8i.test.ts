/**
 * Phase 8I — Bilingual Professional Reports (native writer)
 * `npm run test:bilingual-reports-8i`
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";

import {
  buildReportProfessionalSnapshotV1,
  normalizeInspectorProfileInput,
} from "@/lib/inspectorProfile";
import {
  buildManualRevisionsForModifiedEntries,
  buildInspectorEditedNote,
  modifyFindingEntry,
} from "@/lib/findingsReview";
import {
  normalizeReportLocale,
  toWriterLanguage,
  localeFromProvince,
} from "@/lib/reportLocale";
import {
  MANUAL_REVISIONS_PAYLOAD_KEY,
  REPORT_LANGUAGE_PAYLOAD_KEY,
  resolvePayloadReportLocale,
} from "@/lib/reportLanguage";
import {
  renderEntriesForReportLanguage,
} from "@/lib/report_generation_engine";
import { buildInspectionPdfFilename } from "@/lib/report_generation_engine/addressSlug";
import { translateManualRevision } from "@/lib/report_translation_engine/translateManualRevision";
import { sortedInspectionTerms } from "@/lib/report_translation_engine/inspection_terms";
import { REPORT_WRITER_NOTE_MARKER } from "@/lib/report_writer_engine";
import type { ReportEntryInput } from "@/lib/reportNarrative";

const ROOT = join(process.cwd());

const FORBIDDEN_PATHS = [
  "supabase/functions/reports-pdf/index.ts",
  "lib/observation_ai_engine/index.ts",
  "lib/photoUploadQueueIdb.ts",
];

function read(rel: string): string {
  return readFileSync(join(ROOT, rel), "utf8");
}

const FR_MACHINE_ENTRY: ReportEntryInput = {
  id: "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee",
  zone: "toiture",
  issue: "roof_wear",
  severity: "medium",
  note: `${REPORT_WRITER_NOTE_MARKER}\nObservation\nBardeaux liftés visibles au niveau du revêtement de toiture.\n\nRecommandation\nFaire évaluer par un couvreur qualifié.`,
};

describe("Phase 8I bilingual reports", () => {
  it("A) FR inspection → EN report via native writer (not full-doc translate)", () => {
    const payload = {
      cover_v1: { client_name: "Jean Tremblay", address: "123 Rue Main, Montréal" },
      entries: [FR_MACHINE_ENTRY],
    };
    const rendered = renderEntriesForReportLanguage(
      [FR_MACHINE_ENTRY],
      payload,
      "en-CA",
      "ca_qc",
    );
    assert.equal(rendered.length, 1);
    assert.equal(rendered[0]!.id, FR_MACHINE_ENTRY.id);
    const note = rendered[0]!.note ?? "";
    assert.match(note, /roof|shingle|covering|visual inspection/i);
    assert.doesNotMatch(note, /revêtement de toiture/i);
    const ensureHtml = read("lib/ensureReportPayloadHtml.ts");
    assert.doesNotMatch(ensureHtml, /translateReportContent\s*\(\s*sectionsRaw/);
    assert.match(ensureHtml, /renderSectionsForReportLanguage/);
  });

  it("B) same photos/observation_ids in both locale renders", () => {
    const entries = [
      FR_MACHINE_ENTRY,
      { ...FR_MACHINE_ENTRY, id: "bbbbbbbb-cccc-dddd-eeee-ffffffffffff", zone: "fondation" as const },
    ];
    const payload = { entries, cover_v1: { address: "123 Rue Main" } };
    const fr = renderEntriesForReportLanguage(entries, payload, "fr-CA", "ca_qc");
    const en = renderEntriesForReportLanguage(entries, payload, "en-CA", "ca_qc");
    assert.deepEqual(
      fr.map((e) => e.id),
      en.map((e) => e.id),
    );
  });

  it("C) client name never translated (neverTranslate)", () => {
    const clientName = "Jean Tremblay";
    const revision = {
      language: "fr-CA",
      observation: `Fissure observée près de la fondation pour ${clientName}.`,
      recommendation: "Surveillance.",
      revised_at: "2026-06-18T12:00:00.000Z",
    };
    const translated = translateManualRevision(revision, "en-CA", [clientName]);
    assert.match(translated.observation, new RegExp(clientName));
    assert.match(translated.observation, /foundation|fissure|crack/i);
  });

  it("D) inspection_terms glossary contains professional pairs", () => {
    const terms = sortedInspectionTerms();
    assert.ok(terms.length >= 10);
    const roof = terms.find((t) => t.fr === "revêtement de toiture");
    assert.ok(roof);
    assert.equal(roof!.en, "roof covering");
    const translated = translateManualRevision(
      {
        language: "fr-CA",
        observation: "Infiltration d'eau au niveau du revêtement de toiture.",
        recommendation: "Entrepreneur qualifié.",
        revised_at: "2026-06-18T12:00:00.000Z",
      },
      "en-CA",
    );
    assert.match(translated.observation, /water infiltration/i);
    assert.match(translated.observation, /roof covering/i);
  });

  it("E) old report snapshot language_preferences immutable shape preserved on parse", () => {
    const legacySnap = {
      schema_version: 1,
      captured_at: "2026-06-01T10:00:00.000Z",
      company: "Test Co",
      inspector: "Steve Last",
      certification: "AIBQ #123",
      logo: null,
      signature: null,
      phone: "",
      email: "",
      language_preferences: { default: "fr", report: "fr" },
    };
    const profile = normalizeInspectorProfileInput({});
    const newSnap = buildReportProfessionalSnapshotV1(profile);
    assert.equal(newSnap.languages.ui, "fr-CA");
    assert.equal(newSnap.languages.report, "fr-CA");
    assert.equal(
      (legacySnap.language_preferences as { default: string }).default,
      "fr",
    );
  });

  it("F) manual_revision_v1 only translated when target lang differs", () => {
    const obsId = "cccccccc-dddd-eeee-ffff-000000000001";
    const entries = modifyFindingEntry(
      [{ ...FR_MACHINE_ENTRY, id: obsId }],
      obsId,
      {
        observation: "Fissure au solage.",
        recommendation: "Surveillance annuelle.",
      },
      "fr",
    );
    const payload = {
      [MANUAL_REVISIONS_PAYLOAD_KEY]: buildManualRevisionsForModifiedEntries(
        entries,
        {},
        "fr-CA",
      ),
    };
    const sameLang = renderEntriesForReportLanguage(entries, payload, "fr-CA", "ca_qc");
    assert.match(sameLang[0]!.note ?? "", /Fissure au solage/);

    const otherLang = renderEntriesForReportLanguage(entries, payload, "en-CA", "ca_qc");
    assert.doesNotMatch(otherLang[0]!.note ?? "", /Fissure au solage/);
    assert.match(otherLang[0]!.note ?? "", /crack|sill|monitor/i);
  });

  it("reportLocale helpers accept legacy fr/en", () => {
    assert.equal(normalizeReportLocale("fr"), "fr-CA");
    assert.equal(normalizeReportLocale("en"), "en-CA");
    assert.equal(toWriterLanguage("en-CA"), "en");
    assert.equal(localeFromProvince("ca_qc", "fr"), "fr-CA");
    assert.equal(
      resolvePayloadReportLocale({ [REPORT_LANGUAGE_PAYLOAD_KEY]: "en" }),
      "en-CA",
    );
  });

  it("PDF filename standard Inspection_{slug}_FR|EN.pdf", () => {
    assert.equal(
      buildInspectionPdfFilename("123 Rue Main, Montréal", "fr-CA"),
      "Inspection_123_Rue_Main_Montreal_FR.pdf",
    );
    assert.equal(
      buildInspectionPdfFilename("123 Rue Main", "en-CA"),
      "Inspection_123_Rue_Main_EN.pdf",
    );
  });

  it("non-regression — forbidden areas unchanged", () => {
    for (const rel of FORBIDDEN_PATHS) {
      const src = read(rel);
      assert.doesNotMatch(src, /renderEntriesForReportLanguage/);
      assert.doesNotMatch(src, /manual_revisions_v1/);
    }
    const billing = read("app/api/billing/summary/route.ts");
    assert.doesNotMatch(billing, /report_generation_engine/);
  });

  it("delivery UI and trigger route wired for bilingual", () => {
    assert.match(read("components/InspectionDeliveryWorkspace.tsx"), /Langue du rapport|Report language/);
    assert.match(read("components/InspectionDeliveryWorkspace.tsx"), /Générer les deux versions|Generate both versions/);
    assert.match(read("app/api/trigger-inspection/route.ts"), /generate_both/);
    assert.match(read("app/api/trigger-inspection/route.ts"), /report_language/);
    assert.match(read("docs/bilingual-reports-architecture-8i.md"), /native writer/);
  });
});
