/**
 * Phase 8W — Steve real report clone validation
 * `npm run test:steve-report-clone-validation-8w`
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";

import {
  compareSteveReports,
  DEFAULT_LEGACY_PHOTO_MAPPINGS,
  STEVE_PRODUCTION_THRESHOLD,
  steveSystemOrderLabels,
} from "@/lib/reportComparison";
import {
  buildSampleSteveValidationPayload,
  SAMPLE_LEGACY_STEVE_TEXT,
} from "@/lib/reportComparison/sampleSteveValidationPayload";
import {
  buildProfessionalReportTemplate,
  renderProfessionalReportHtml,
} from "@/lib/report_template_engine";

const ROOT = join(process.cwd());

function read(rel: string): string {
  return readFileSync(join(ROOT, rel), "utf8");
}

function buildInspectFlowReport(): { payload: Record<string, unknown>; html: string } {
  const payload = buildSampleSteveValidationPayload();
  const template = buildProfessionalReportTemplate(payload, { locale: "fr-CA" });
  assert.ok(template);
  const html = renderProfessionalReportHtml(template!, "fr-CA");
  return { payload, html };
}

describe("Phase 8W steveReportComparator", () => {
  it("system order matches Steve inspection sequence", () => {
    const labels = steveSystemOrderLabels();
    assert.deepEqual(
      labels,
      [
        "STRUCTURE",
        "EXTÉRIEUR",
        "TOITURE",
        "PLOMBERIE",
        "ÉLECTRICITÉ",
        "CHAUFFAGE / CLIMATISATION",
        "INTÉRIEUR",
      ],
    );
  });

  it("structure: all mandatory sections present", () => {
    const { payload, html } = buildInspectFlowReport();
    const score = compareSteveReports({ text: SAMPLE_LEGACY_STEVE_TEXT }, { payload, html });

    const required = score.structure_checks.filter((c) => c.required);
    assert.ok(required.every((c) => c.status !== "manquant"));
    assert.match(html, /data-block="conclusion"/);
    assert.match(html, /data-block="attestation"/);
    assert.match(html, /data-block="reader_notice"/);
  });

  it("observations and commentaires are separated in component blocks", () => {
    const { payload, html } = buildInspectFlowReport();
    const score = compareSteveReports({}, { payload, html });
    assert.equal(score.observation_comment_separated, true);
    assert.match(html, /Observations/);
    assert.match(html, /Commentaires/);
  });

  it("locked clauses present and not AI-modifiable", () => {
    const { payload, html } = buildInspectFlowReport();
    const score = compareSteveReports({}, { payload, html });

    assert.equal(score.locked_clauses_ok, true);
    assert.ok(score.locked_clauses.every((c) => c.ai_modifiable === false));
    assert.ok(score.locked_clauses.some((c) => c.clause_id === "reader_notice" && c.present));
    assert.ok(score.locked_clauses.some((c) => c.clause_id === "attestation" && c.present));
    assert.ok(score.locked_clauses.some((c) => c.clause_id === "orientation" && c.present));
    assert.ok(score.locked_clauses.some((c) => c.clause_id === "co" && c.present));
    assert.ok(score.locked_clauses.some((c) => c.clause_id === "nb" && c.present));

    assert.doesNotMatch(read("lib/report_writer_engine/writeObservation.ts"), /readerNotice/);
    assert.doesNotMatch(read("lib/observation_ai_engine/index.ts"), /AVIS AU LECTEUR/);
  });

  it("photos mapped to electric panel and interior floors", () => {
    const { payload, html } = buildInspectFlowReport();
    const score = compareSteveReports(
      { text: SAMPLE_LEGACY_STEVE_TEXT, photo_mappings: [...DEFAULT_LEGACY_PHOTO_MAPPINGS] },
      { payload, html },
    );

    const panel = score.photo_mapping_results.find((p) => /panneau/i.test(p.legacy_label));
    const floor = score.photo_mapping_results.find((p) => /plancher/i.test(p.legacy_label));
    assert.equal(panel?.status, "conforme");
    assert.equal(floor?.status, "conforme");
    assert.match(html, /panel\.jpg/);
    assert.match(html, /floor\.jpg/);
  });

  it("system order in HTML follows Steve model", () => {
    const { payload, html } = buildInspectFlowReport();
    const score = compareSteveReports({}, { payload, html });
    assert.equal(score.system_order_match, true);

    const order = ["structure", "exterieur", "toiture", "plomberie", "electricite", "interieur"];
    let last = -1;
    for (const id of order) {
      const idx = html.indexOf(`data-system-id="${id}"`);
      if (idx >= 0) {
        assert.ok(idx > last, id);
        last = idx;
      }
    }
  });

  it("overall Steve score >= 95% ready for client", () => {
    const { payload, html } = buildInspectFlowReport();
    const score = compareSteveReports({ text: SAMPLE_LEGACY_STEVE_TEXT }, { payload, html });

    assert.ok(score.overall_score >= STEVE_PRODUCTION_THRESHOLD, `score=${score.overall_score}`);
    assert.equal(score.ready_for_client, true);
    assert.ok(score.structure_match >= 90);
    assert.ok(score.content_match >= 85);
  });
});

describe("Phase 8W non-regression", () => {
  it("production pipeline files untouched", () => {
    assert.doesNotMatch(read("app/api/report-pdf/route.ts"), /steveReportComparator/);
    assert.doesNotMatch(read("lib/reportComparison/steveReportComparator.ts"), /reports-pdf/);
  });

  it("dev validation route is dev-gated", () => {
    assert.match(read("app/api/dev/steve-validation/route.ts"), /NODE_ENV !== "development"/);
    assert.match(read("app/dev/steve-validation/page.tsx"), /notFound/);
  });

  it("comparator module exists", () => {
    assert.match(read("lib/reportComparison/steveReportComparator.ts"), /SteveReportScore/);
  });
});
