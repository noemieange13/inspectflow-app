/**
 * Phase 8U — Steve document parser calibration
 * `npm run test:steve-document-parser-8u`
 */
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";

import {
  analyzeDocumentText,
  intakeToInspectionPrefill,
} from "@/lib/document-intelligence";
import {
  isPreviousInspectionReport,
  parseInspectionReportText,
} from "@/lib/document_parsers/inspectionReportParser";
import { classifyDocumentType } from "@/lib/documentIntakeFiles";
import {
  applyDocumentIntakeToReportPayload,
  parseReportPropertySnapshotV1,
  REPORT_PROPERTY_SNAPSHOT_KEY,
} from "@/lib/reportPropertySnapshot";

const ROOT = join(process.cwd());

function read(rel: string): string {
  return readFileSync(join(ROOT, rel), "utf8");
}

const STEVE_SAMPLE = `
RAPPORT D'INSPECTION PRÉ-ACHAT
REQUÉRANT(S): Mme Aimée Ina Mahoro
ADRESSE: 49 De Castagne, Gatineau
DATE ET HEURE: 12 juin 2024, 09 h 00
TYPE DE PROPRIÉTÉ: jumelé
ANNÉE DE CONSTRUCTION: 1990
DESCRIPTION SOMMAIRE DU BÂTIMENT
TYPE DE MAISON: jumelé
CONSTRUIT EN: 1990
REVÊTEMENT EXTÉRIEUR: Canexel
TOITURE: Bardeaux d'asphalte
TYPE DE FONDATION: Béton coulé
TYPE DE STRUCTURE: Bois
CHAUFFAGE: Plinthes électriques
`;

describe("Phase 8U Steve document parser", () => {
  it("A) detects previous inspection report document type", () => {
    assert.equal(isPreviousInspectionReport(STEVE_SAMPLE), true);
    const buf = Buffer.from(STEVE_SAMPLE, "utf8");
    assert.equal(
      classifyDocumentType("rapport-steve.pdf", "application/pdf", buf, "dv_pdf"),
      "previous_inspection_report",
    );
  });

  it("B) parses Steve labels — client, address, type, year", () => {
    const parsed = parseInspectionReportText(STEVE_SAMPLE);
    assert.equal(parsed.client.name, "Mme Aimée Ina Mahoro");
    assert.match(parsed.property.address ?? "", /49 De Castagne/i);
    assert.equal(parsed.building.type, "jumelé");
    assert.equal(parsed.building.year, "1990");
  });

  it("C) analyzeDocumentText merges building description fields", () => {
    const analysis = analyzeDocumentText(STEVE_SAMPLE, {
      sourceKind: "dv_pdf",
      documentType: "previous_inspection_report",
    });
    assert.equal(analysis.client?.name, "Mme Aimée Ina Mahoro");
    assert.match(analysis.property.address ?? "", /49 De Castagne/i);
    assert.equal(analysis.building?.type, "jumelé");
    assert.equal(analysis.building?.year, "1990");
    assert.match(analysis.building?.roof_covering ?? "", /Bardeaux/i);
    assert.match(analysis.building?.foundation_type ?? "", /Béton coulé/i);
    assert.equal(analysis.property.buildingType, "multiplex");
  });

  it("D) intake prefill without manual typing", () => {
    const analysis = analyzeDocumentText(STEVE_SAMPLE, {
      documentType: "previous_inspection_report",
    });
    const prefill = intakeToInspectionPrefill(analysis);
    assert.equal(prefill.clientName, "Mme Aimée Ina Mahoro");
    assert.match(prefill.address, /49 De Castagne/i);
    assert.equal(prefill.inspectionType, "multiplex");
  });

  it("E) report_property_snapshot_v1 + cover_v1 on create payload", () => {
    const analysis = analyzeDocumentText(STEVE_SAMPLE, {
      documentType: "previous_inspection_report",
    });
    const payload = applyDocumentIntakeToReportPayload(
      { cover_v1: { schema_version: 1 } },
      {
        analysis,
        documentType: "previous_inspection_report",
        clientName: "Mme Aimée Ina Mahoro",
        address: "49 De Castagne, Gatineau",
        inspectionType: "multiplex",
        jurisdiction: "ca_qc",
      },
    );
    const snapshot = parseReportPropertySnapshotV1(payload[REPORT_PROPERTY_SNAPSHOT_KEY]);
    assert.ok(snapshot);
    assert.equal(snapshot?.client.name, "Mme Aimée Ina Mahoro");
    assert.match(snapshot?.property.address ?? "", /49 De Castagne/i);
    assert.equal(snapshot?.building.roof_covering, "Bardeaux d'asphalte");
    const cover = payload.cover_v1 as Record<string, unknown>;
    assert.equal(cover.schema_version, 1);
    const ds = cover.description_sommaire as Record<string, string>;
    assert.match(ds.toiture, /Bardeaux/i);
    assert.match(ds.type_fondation, /Béton coulé/i);
  });

  it("F) deliverables wired", () => {
    assert.ok(existsSync(join(ROOT, "lib/document_parsers/inspectionReportParser.ts")));
    assert.match(read("components/DocumentIntakeReview.tsx"), /Commencer/);
    assert.match(read("app/api/inspector/create-inspection/route.ts"), /applyDocumentIntakeToReportPayload/);
    assert.match(read("lib/report_template_engine/render.ts"), /Informations sur l'inspection/i);
  });
});

describe("Phase 8U non-regression", () => {
  it("8S inspection create polish paths intact", () => {
    assert.match(read("components/NewInspectionSheet.tsx"), /variant="steve"/);
    assert.match(read("lib/inspectorCreationMethod.ts"), /document_import/);
  });

  it("8Q inspector style untouched", () => {
    assert.match(read("lib/inspectorReportStyle.ts"), /inspector_report_style_v1/);
    assert.ok(!read("lib/report_writer_engine/writeObservation.ts").includes("inspectionReportParser"));
  });
});
