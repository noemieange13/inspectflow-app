/**
 * Phase 8U-FIX — Seller disclosure report section
 * `npm run test:seller-disclosure-8u`
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";

import { analyzeDocumentText } from "@/lib/document-intelligence";
import { fuseDocuments, type FusionDocumentInput } from "@/lib/documentFusionEngine";
import {
  applyProfessionalSnapshotToReportPayload,
  normalizeInspectorProfileInput,
} from "@/lib/inspectorProfile";
import {
  buildProfessionalReportTemplate,
  renderProfessionalReportHtml,
} from "@/lib/report_template_engine";
import {
  buildSellerDisclosureComments,
  buildSellerDisclosureSectionHtml,
  readSellerDisclosureV1FromPayload,
  SELLER_DISCLOSURE_INTRO_FR,
  SELLER_DISCLOSURE_SECTION_TITLE,
} from "@/lib/report_template_engine/sellerDisclosureSection";
import { OWNER_DISCLOSURE_DEFAULT_INTRO_FR } from "@/lib/report_legal_sections_engine";

const ROOT = join(process.cwd());

function read(rel: string): string {
  return readFileSync(join(ROOT, rel), "utf8");
}

const SAMPLE_PROFILE = normalizeInspectorProfileInput({
  company_name: "InspectPro Inc.",
  logo_url: "data:image/png;base64,LOGO8U",
  display_name: "Steve Last",
  professional_title: "Inspecteur en bâtiment",
  certification_number: "AIBQ-123",
  phone: "514-555-0100",
  email: "steve@inspectpro.ca",
  signature_image_url: "data:image/png;base64,SIG8U",
  preferred_ui_language: "fr-CA",
  default_client_report_language: "fr-CA",
});

function baseReportPayload(extra?: Record<string, unknown>): Record<string, unknown> {
  return applyProfessionalSnapshotToReportPayload(
    {
      cover_v1: {
        schema_version: 1,
        address: "123 Rue Example",
        propriete: {
          adresse: "123 Rue Example, Montréal QC",
          client_nom: "Jean Client",
        },
        inspecteur_nom: "Steve Last",
        inspecteur_numero_certification: "AIBQ-123",
        compagnie: "InspectPro Inc.",
        date_heure_affichage: "2026-06-18 14:00",
        orientation_facade: "est",
      },
      sections: [
        {
          id: "obs-001",
          title: "Toiture — usure",
          observation: "Bardeaux vieillis.",
          zone: "toiture",
          severity: "medium",
        },
      ],
      entries: [
        {
          id: "obs-001",
          zone: "toiture",
          issue: "roof_wear",
          severity: "medium",
          note: "Bardeaux vieillis.",
        },
      ],
      report_language: "fr-CA",
      ...extra,
    },
    SAMPLE_PROFILE,
    "2026-06-18T10:00:00.000Z",
  );
}

function docInput(text: string): FusionDocumentInput {
  return {
    document_type: "seller_disclosure",
    fileName: "dv.pdf",
    documentId: "dv-test",
    analysis: analyzeDocumentText(text, { documentType: "seller_disclosure" }),
    confidence: 0.9,
    needsReview: false,
  };
}

describe("Phase 8U-FIX seller disclosure extraction", () => {
  it("A) DV number detected → DV 26877 in generated comment", () => {
    const text = `
Déclaration du vendeur DV 26877
Adresse : 456 rue Sherbrooke, Montréal
Le vendeur a acquis l'immeuble en 2005.
`;
    const analysis = analyzeDocumentText(text, { documentType: "seller_disclosure" });
    assert.equal(analysis.seller_disclosure_v1?.dv_number, "26877");
    assert.equal(analysis.seller_disclosure_v1?.seller_acquisition_year, 2005);
    assert.equal(analysis.seller_disclosure_v1?.received_before_inspection, true);

    const comments = buildSellerDisclosureComments(analysis.seller_disclosure_v1!);
    assert.match(comments, /DV 26877/);
    assert.match(comments, /acquis l'immeuble en 2005/);
  });

  it("B) acquisition year detected → acquired property sentence generated", () => {
    const text = `
Divulgation propriétaire vendeur 12345
Propriétaire depuis 1998.
`;
    const analysis = analyzeDocumentText(text, { documentType: "seller_disclosure" });
    assert.equal(analysis.seller_disclosure_v1?.seller_acquisition_year, 1998);
    const comments = buildSellerDisclosureComments(analysis.seller_disclosure_v1!);
    assert.match(comments, /acquis l'immeuble en 1998/);
  });

  it("C) missing DV number → generic sentence only", () => {
    const text = `
Déclaration du vendeur
Adresse : 456 rue Sherbrooke
Propriétaire depuis 2010.
`;
    const analysis = analyzeDocumentText(text, { documentType: "seller_disclosure" });
    assert.equal(analysis.seller_disclosure_v1?.dv_number, undefined);
    const comments = buildSellerDisclosureComments(analysis.seller_disclosure_v1!);
    assert.match(comments, /Une déclaration du vendeur nous a été remise avant l'inspection\./);
    assert.doesNotMatch(comments, /\bDV\b/);
    assert.match(comments, /acquis l'immeuble en 2010/);
  });

  it("D) no DV document → section omitted", () => {
    const analysis = analyzeDocumentText("Courriel client sans DV.", {
      documentType: "client_email",
    });
    assert.equal(analysis.seller_disclosure_v1, undefined);
    assert.equal(buildSellerDisclosureSectionHtml(null), "");
    const payload = baseReportPayload();
    assert.equal(readSellerDisclosureV1FromPayload(payload), null);
    const template = buildProfessionalReportTemplate(payload, { locale: "fr-CA" });
    assert.ok(template);
    const html = renderProfessionalReportHtml(template!);
    assert.doesNotMatch(html, new RegExp(SELLER_DISCLOSURE_SECTION_TITLE));
  });
});

describe("Phase 8U-FIX seller disclosure report section", () => {
  it("renders legacy intro + commentaires after building description", () => {
    const dvText = `
Déclaration vendeur 26877
Le vendeur a acquis l'immeuble en 2005.
`;
    const fusion = fuseDocuments([docInput(dvText)]);
    const payload = baseReportPayload({
      document_fusion_v1: { version: 1, schema_version: 1, fusion },
      building_profile_v1: {
        schema_version: 1,
        type: "jumelé",
        year_built: "1990",
        exterior: { front_material: "Canexel" },
        roof: { covering: "Bardeaux" },
        foundation: { type: "Béton coulé" },
        structure: { type: "Bois" },
        heating: { type: "Plinthes électriques" },
        orientation: {
          facade_direction: "est",
          confidence: 1,
          source: "inspector",
          inspector_confirmed: true,
        },
      },
    });

    const sd = readSellerDisclosureV1FromPayload(payload);
    assert.ok(sd);
    assert.equal(sd?.dv_number, "26877");

    const template = buildProfessionalReportTemplate(payload, { locale: "fr-CA" })!;
    const html = renderProfessionalReportHtml(template);

    const buildingIdx = html.indexOf("Description sommaire du bâtiment");
    const sellerIdx = html.indexOf(SELLER_DISCLOSURE_SECTION_TITLE);
    const orientIdx = html.indexOf("LECTURE DU RAPPORT FACE AUX ORIENTATIONS");

    assert.ok(buildingIdx >= 0, "building description present");
    assert.ok(sellerIdx > buildingIdx, "seller section after building description");
    assert.ok(orientIdx > sellerIdx, "orientation section after seller disclosure");
    assert.match(html, new RegExp(escapeRegex(OWNER_DISCLOSURE_DEFAULT_INTRO_FR)));
    assert.match(html, /Commentaires|Déclaration du vendeur : DV 26877/);
    assert.match(html, /DV 26877/);
    assert.match(html, /acquis l'immeuble en 2005/);
  });

  it("document_intake_v1 analysis wired for report rendering", () => {
    const analysis = analyzeDocumentText("Déclaration vendeur DV 55555", {
      documentType: "seller_disclosure",
    });
    const payload = baseReportPayload({
      document_intake_v1: {
        version: 1,
        analysis,
      },
    });
    assert.equal(readSellerDisclosureV1FromPayload(payload)?.dv_number, "55555");
  });
});

describe("Phase 8U-FIX non-regression", () => {
  it("8U fusion paths intact", () => {
    assert.match(read("lib/documentFusionEngine.ts"), /document_fusion_v1/);
    assert.match(read("test/document-fusion-8u.test.ts"), /fuseDocuments/);
  });

  it("8Q style calibration untouched", () => {
    assert.match(read("lib/inspectorReportStyle.ts"), /inspector_report_style_v1/);
    assert.ok(!read("lib/inspector_style_calibration/parseStyleFromReportText.ts").includes("seller_disclosure_v1"));
  });

  it("8L professional template intact", () => {
    assert.match(read("lib/report_template_engine/constants.ts"), /PROFESSIONAL_SECTION_ORDER/);
    assert.match(read("test/professional-report-8l.test.ts"), /buildProfessionalReportTemplate/);
  });

  it("DV info never auto-creates deficiencies", () => {
    assert.doesNotMatch(read("lib/document-intelligence.ts"), /appendObservationEntry/);
    assert.doesNotMatch(read("lib/report_writer_engine/writeObservation.ts"), /seller_disclosure_v1/);
  });
});

function escapeRegex(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
