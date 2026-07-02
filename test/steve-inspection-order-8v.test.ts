/**
 * Phase 8V — Steve inspection order + finding architecture
 * `npm run test:steve-inspection-order-8v`
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";

import {
  buildConformeFinding,
  parseSteveFindingV1,
  shouldHideSteveFindingSection,
  validateSteveFinding,
} from "@/lib/findingSchema";
import {
  applyProfessionalSnapshotToReportPayload,
  normalizeInspectorProfileInput,
} from "@/lib/inspectorProfile";
import {
  adaptWriterOutputToSteveFinding,
  renderSteveFindingHtml,
} from "@/lib/steveFindingAdapter";
import {
  attachPhotoToSteveComponent,
  photosForSteveComponent,
} from "@/lib/stevePhotoContext";
import {
  buildProfessionalReportTemplate,
  renderProfessionalReportHtml,
} from "@/lib/report_template_engine";
import { writeProfessionalObservation } from "@/lib/report_writer_engine";
import {
  compareSteveComponentOrder,
  STEVE_COMPONENT_COUNT,
  STEVE_INSPECTION_COMPONENTS,
  STEVE_INSPECTION_ORDER,
  steveReportDocumentOrder,
} from "@/lib/steveInspectionOrder";
import {
  assertSteveComponentOrder,
  buildSteveFindingsHtmlFromPayload,
  sortSteveFindings,
} from "@/lib/steveReportPresentation";
import {
  containsSteveForbiddenPhrase,
  defaultSteveNoAnomalyComment,
  sanitizeSteveWriting,
} from "@/lib/steveWritingStyle";

const ROOT = join(process.cwd());

function read(rel: string): string {
  return readFileSync(join(ROOT, rel), "utf8");
}

describe("Phase 8V Steve inspection order", () => {
  it("defines 42 components in fixed order", () => {
    assert.equal(STEVE_COMPONENT_COUNT, 42);
    assert.equal(STEVE_INSPECTION_ORDER.length, 42);
    assert.equal(STEVE_INSPECTION_COMPONENTS[0]?.id, "structure_fondation");
    assert.equal(STEVE_INSPECTION_COMPONENTS[41]?.id, "interieur_grilles");
    assert.equal(STEVE_INSPECTION_COMPONENTS[41]?.order, 42);
  });

  it("report document order includes admin, legal, components, final", () => {
    const order = steveReportDocumentOrder();
    assert.ok(order.indexOf("informations_inspection") < order.indexOf("structure_fondation"));
    assert.ok(order.indexOf("declaration_proprietaire") < order.indexOf("structure_fondation"));
    assert.ok(order.indexOf("interieur_grilles") < order.indexOf("conclusion"));
  });

  it("sorts findings by Steve component order", () => {
    const sorted = sortSteveFindings([
      buildConformeFinding({
        component_id: "toiture_revetement",
        section: "Toiture",
        component: "Revêtement toiture",
        observation: "Obs toiture",
        commentaire: defaultSteveNoAnomalyComment("fr"),
      }),
      buildConformeFinding({
        component_id: "structure_fondation",
        section: "Structure",
        component: "Fondation",
        observation: "Obs fondation",
        commentaire: defaultSteveNoAnomalyComment("fr"),
      }),
    ]);
    assert.equal(sorted[0]?.component_id, "structure_fondation");
    assert.ok(assertSteveComponentOrder(sorted.map((f) => f.component_id)));
  });
});

describe("Phase 8V finding schema", () => {
  it("requires observation and commentaire", () => {
    const invalid = validateSteveFinding({
      schema_version: 1,
      component_id: "structure_fondation",
      section: "Structure",
      component: "Fondation",
      observation: "",
      commentaire: "",
      severity: "none",
      photos: [],
    });
    assert.equal(invalid.valid, false);
    assert.ok(invalid.errors.some((e) => e.includes("observation")));
    assert.ok(invalid.errors.some((e) => e.includes("commentaire")));
  });

  it("recommendation remains optional", () => {
    const finding = buildConformeFinding({
      component_id: "structure_poutres_colonnes",
      section: "Structure",
      component: "Poutres et colonnes",
      observation:
        "La poutre centrale structurale a été identifiée au plafond de la salle mécanique.",
      commentaire:
        "La poutre était en acier reposant sur les murs de fondation. Aucun indice d'affaissement n'a été constaté.",
    });
    assert.equal(finding.recommandation_optional, undefined);
    assert.equal(validateSteveFinding(finding).valid, true);
  });

  it("NA sections are hideable", () => {
    const finding = parseSteveFindingV1({
      schema_version: 1,
      component_id: "interieur_garage",
      section: "Intérieur",
      component: "Garage",
      observation: "—",
      commentaire: "—",
      severity: "none",
      photos: [],
      status: "na",
    });
    assert.ok(finding);
    assert.equal(shouldHideSteveFindingSection(finding!), true);
  });
});

describe("Phase 8V writer adapter layer", () => {
  it("maps writer output to observation + commentaire without mixing", () => {
    const writer = writeProfessionalObservation({
      draft: {
        draft_id: "d1",
        title: "Fissure béton",
        observation_text: "Fissure verticale visible sur le mur de fondation.",
        component: "Fondation",
        system: "structure",
        severity: "maintenance",
        confidence_score: 0.9,
        normative_references: [],
      },
      normative_context: { language: "fr", province: "QC" },
    });

    const finding = adaptWriterOutputToSteveFinding({
      component_id: "structure_fondation",
      writerText: writer.text,
      language: "fr",
    });

    assert.match(finding.observation, /Fissure verticale/i);
    assert.ok(finding.commentaire.length > 0);
    assert.notEqual(finding.observation, finding.commentaire);
    assert.doesNotMatch(finding.observation, /probablement/i);
  });

  it("uses default no-anomaly comment when conforme", () => {
    const finding = adaptWriterOutputToSteveFinding({
      component_id: "structure_dalle_beton",
      rawObservation: "Nous avons observé au niveau de Dalle béton : dalle visible.",
      language: "fr",
      severity: "none",
      status: "conforme",
    });
    assert.match(finding.commentaire, /Aucune anomalie apparente/i);
  });

  it("renders Observation before Commentaires in HTML", () => {
    const html = renderSteveFindingHtml(
      buildConformeFinding({
        component_id: "structure_fondation",
        section: "Structure",
        component: "Fondation",
        observation: "Fait visible.",
        commentaire: defaultSteveNoAnomalyComment("fr"),
      }),
    );
    const obsIdx = html.indexOf("Observations");
    const comIdx = html.indexOf("Commentaires");
    assert.ok(obsIdx >= 0);
    assert.ok(comIdx > obsIdx);
    assert.doesNotMatch(html, /Commentaires[\s\S]*Observations/);
  });
});

describe("Phase 8V photo context", () => {
  it("associates photos to Steve component", () => {
    const ctx = attachPhotoToSteveComponent({
      photo_id: "photo-123",
      component_id: "structure_fondation",
      inspection_section: "Structure",
      component: "Fondation",
      defect_candidate: "fissure_beton",
    });
    const urls = photosForSteveComponent([ctx], "structure_fondation");
    assert.deepEqual(urls, ["photo-123"]);
  });
});

describe("Phase 8V Steve writing style", () => {
  it("blocks forbidden speculative phrases", () => {
    assert.equal(containsSteveForbiddenPhrase("Cela semble être un problème"), true);
    assert.equal(sanitizeSteveWriting("Probablement une fissure"), "une fissure");
  });
});

describe("Phase 8V PDF presentation layer", () => {
  it("renders steve findings block before legacy sections", () => {
    const profile = normalizeInspectorProfileInput({
      company_name: "InspectPro",
      display_name: "Steve",
      certification_number: "AIBQ-1",
      preferred_ui_language: "fr-CA",
      default_client_report_language: "fr-CA",
    });
    const payload = applyProfessionalSnapshotToReportPayload(
      {
        cover_v1: {
          schema_version: 1,
          address: "123 Rue Test",
          propriete: { adresse: "123 Rue Test", client_nom: "Client" },
          inspecteur_nom: "Steve",
          inspecteur_numero_certification: "AIBQ-1",
          compagnie: "InspectPro",
          date_heure_affichage: "2026-06-18",
        },
        sections: [
          {
            id: "obs-1",
            title: "Toiture",
            observation: "Test",
            zone: "toiture",
            severity: "medium",
          },
        ],
        entries: [{ id: "obs-1", zone: "toiture", issue: "roof_wear", severity: "medium", note: "Test" }],
        steve_findings_v1: {
          schema_version: 1,
          findings: [
            {
              schema_version: 1,
              component_id: "structure_fondation",
              section: "Structure",
              component: "Fondation",
              observation: "Fait visible fondation.",
              commentaire: defaultSteveNoAnomalyComment("fr"),
              severity: "none",
              photos: [],
              approved: true,
              status: "conforme",
            },
          ],
        },
      },
      profile,
    );

    const html = renderProfessionalReportHtml(
      buildProfessionalReportTemplate(payload, { locale: "fr-CA" })!,
    );
    const steveIdx = html.indexOf("Constats d'inspection (ordre Steve)");
    const toitureIdx = html.indexOf("Toiture");
    assert.ok(steveIdx >= 0);
    assert.ok(toitureIdx > steveIdx);
    assert.match(html, /Observations/);
    assert.match(html, /Commentaires/);
  });
});

describe("Phase 8V non-regression", () => {
  it("report_writer_engine core file untouched by steve order modules", () => {
    assert.match(read("lib/report_writer_engine/writeObservation.ts"), /writeProfessionalObservation/);
    assert.doesNotMatch(read("lib/report_writer_engine/writeObservation.ts"), /steveInspectionOrder/);
  });

  it("PDF route core untouched", () => {
    assert.doesNotMatch(read("app/api/report-pdf/route.ts"), /steveInspectionOrder/);
  });

  it("field UI wired with tour component", () => {
    assert.match(read("components/SteveFieldScreen.tsx"), /SteveInspectionTour/);
    assert.match(read("components/SteveInspectionTour.tsx"), /Conforme/);
  });

  it("compareSteveComponentOrder is stable", () => {
    assert.ok(compareSteveComponentOrder("structure_fondation", "toiture_revetement") < 0);
    assert.ok(compareSteveComponentOrder("interieur_grilles", "structure_fondation") > 0);
  });

  it("buildSteveFindingsHtmlFromPayload respects order", () => {
    const payload = {
      steve_findings_v1: {
        schema_version: 1,
        findings: [
          buildConformeFinding({
            component_id: "electricite_panneau",
            section: "Électricité",
            component: "Panneau distribution",
            observation: "Obs",
            commentaire: "Com",
          }),
          buildConformeFinding({
            component_id: "structure_fondation",
            section: "Structure",
            component: "Fondation",
            observation: "Obs",
            commentaire: "Com",
          }),
        ],
      },
    };
    const html = buildSteveFindingsHtmlFromPayload(payload, "fr-CA");
    assert.ok(html.indexOf("Fondation") < html.indexOf("Panneau distribution"));
  });
});
