/**
 * Phase 8U+ — building profile + facade orientation
 * `npm run test:building-profile-8u`
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";

import {
  attachConfirmedBuildingProfile,
  BUILDING_PROFILE_KEY,
  buildBuildingProfileFromAnalysis,
  parseBuildingProfileV1,
} from "@/lib/buildingProfile";
import { analyzeDocumentText } from "@/lib/document-intelligence";
import {
  parseFacadeOrientationFromReport,
  parseInspectionReportText,
} from "@/lib/document_parsers/inspectionReportParser";
import { applyDocumentIntakeToReportPayload } from "@/lib/reportPropertySnapshot";
import { suggestFacadeOrientation } from "@/lib/propertyOrientation";

const ROOT = join(process.cwd());

function read(rel: string): string {
  return readFileSync(join(ROOT, rel), "utf8");
}

const STEVE_PROFILE_SAMPLE = `
RAPPORT D'INSPECTION PRÉ-ACHAT
REQUÉRANT(S): Mme Aimée Ina Mahoro
ADRESSE: 49 De Castagnier, Gatineau
TYPE DE PROPRIÉTÉ: Jumelé
ANNÉE DE CONSTRUCTION: 1990
DESCRIPTION SOMMAIRE DU BÂTIMENT
Façade en : Brique et vinyle
Côté de maison : Brique et vinyle
Arrière de maison : Vinyle
Toiture : bardeaux d'asphalte
Type de fondation : béton coulé
Type de Structure : Ossature de bois
Type de chauffage du bâtiment : Plinthes électriques
ORIENTATION DE LA FAÇADE
Nord __
Sud __
Est X
Ouest __
`;

describe("Phase 8U+ building profile", () => {
  it("A) parses Steve exterior faces + roof + foundation", () => {
    const parsed = parseInspectionReportText(STEVE_PROFILE_SAMPLE);
    assert.match(parsed.building.facade_material ?? "", /Brique et vinyle/i);
    assert.match(parsed.building.sides_material ?? "", /Brique et vinyle/i);
    assert.match(parsed.building.rear_material ?? "", /Vinyle/i);
    assert.match(parsed.building.roof_covering ?? "", /bardeaux/i);
    assert.match(parsed.building.foundation_type ?? "", /béton coulé/i);
    assert.equal(parsed.building.year, "1990");
  });

  it("B) parses facade orientation EST from report checkmarks", () => {
    const orientation = parseFacadeOrientationFromReport(STEVE_PROFILE_SAMPLE);
    assert.ok(orientation);
    assert.equal(orientation?.facade_direction, "est");
    assert.equal(orientation?.source, "previous_report");
  });

  it("C) building_profile_v1 stored on inspection create payload", () => {
    const analysis = analyzeDocumentText(STEVE_PROFILE_SAMPLE, {
      documentType: "previous_inspection_report",
    });
    const confirmed = attachConfirmedBuildingProfile(analysis, "est");
    const payload = applyDocumentIntakeToReportPayload(
      { cover_v1: { schema_version: 1 } },
      {
        analysis: confirmed,
        documentType: "previous_inspection_report",
        clientName: "Mme Aimée Ina Mahoro",
        address: "49 De Castagnier, Gatineau",
        inspectionType: "multiplex",
        jurisdiction: "ca_qc",
        buildingProfile: confirmed.buildingProfile,
      },
    );
    const profile = parseBuildingProfileV1(payload[BUILDING_PROFILE_KEY]);
    assert.ok(profile);
    assert.equal(profile?.year_built, "1990");
    assert.match(profile?.exterior.front_material ?? "", /Brique/i);
    assert.match(profile?.foundation.type ?? "", /béton coulé/i);
    assert.equal(profile?.orientation.facade_direction, "est");
    assert.equal(profile?.orientation.inspector_confirmed, true);
    const cover = payload.cover_v1 as Record<string, unknown>;
    assert.equal(cover.orientation_facade, "est");
  });

  it("D) suggestFacadeOrientation never auto-confirms", () => {
    const suggestion = suggestFacadeOrientation("123 rue Est, Gatineau");
    assert.ok(suggestion);
    assert.equal(suggestion?.source, "map_analysis");
    assert.ok(suggestion!.confidence > 0);
    const profile = buildBuildingProfileFromAnalysis(
      analyzeDocumentText(STEVE_PROFILE_SAMPLE, {
        documentType: "previous_inspection_report",
      }),
    );
    assert.equal(profile.orientation.inspector_confirmed, false);
  });

  it("E) UI + report wiring present", () => {
    assert.match(read("components/DocumentIntakeReview.tsx"), /Orientation façade/);
    assert.match(read("components/DocumentIntakeReview.tsx"), /Commencer/);
    assert.match(read("lib/propertyOrientation.ts"), /suggestFacadeOrientation/);
    assert.match(read("lib/report_template_engine/render.ts"), /Description sommaire du bâtiment/i);
  });
});

describe("Phase 8U+ non-regression", () => {
  it("8S create polish intact", () => {
    assert.match(read("components/NewInspectionSheet.tsx"), /variant="steve"/);
  });

  it("8Q style engine untouched", () => {
    assert.ok(!read("lib/report_writer_engine/writeObservation.ts").includes("buildingProfile"));
  });

  it("8T pilot gate intact", () => {
    assert.match(read("components/StevePreDeliveryGate.tsx"), /PreDeliveryConfidenceCheck/);
  });
});
