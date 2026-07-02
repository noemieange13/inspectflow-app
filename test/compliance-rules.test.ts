/**
 * Moteur compliance_rules — tests unitaires.
 * `npm run test:compliance-rules`
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { buildZeroDraftComplianceContext } from "@/lib/compliance/compliance-rules/adapters/zeroDraftAdapter";
import { countLinkedPhotosForSystem } from "@/lib/compliance/compliance-rules/photoCounts";
import { zoneToSystemCode } from "@/lib/compliance/compliance-rules/mappers/systemMap";
import { QC_AIBQ_2027_RULESET_ID } from "@/lib/compliance/compliance-rules/rules/qc-aibq-2027";
import type { ComplianceContext } from "@/lib/compliance/compliance-rules/types";
import {
  COMPLIANCE_NO_RULESET_CODE,
  COMPLIANCE_NO_RULESET_MESSAGE_FR,
} from "@/lib/compliance/compliance-rules/types";
import {
  buildComplianceValidationV1,
  isCompliancePdfBlocked,
  validateCompliance,
} from "@/lib/compliance/compliance-rules/validate";
import { defaultCoverPayloadV1 } from "@/lib/inspectionCoverPayload";
import { createObservationId } from "@/lib/observationIds";
import { QC_SYSTEM_CODES, type QcSystemCode } from "@/lib/qcSystemSections";

const ZONE_BY_SYSTEM: Record<QcSystemCode, string> = {
  toiture: "toiture",
  structure: "fondation",
  electricite: "installation_electrique",
  plomberie: "plomberie",
  chauffage: "salon",
  isolation: "grenier",
  ventilation: "salle_de_bain",
};

function qcCoverReady() {
  const cover = defaultCoverPayloadV1();
  cover.conformite_juridiction = "ca_qc";
  cover.requerants = "Client Test";
  cover.propriete.adresse = "123 Rue Test";
  cover.propriete.client_nom = "Client Test";
  cover.inspecteur_nom = "Inspecteur Test";
  cover.inspecteur_numero_certification = "AIBQ-999";
  cover.conditions_meteo = "Ensoleillé";
  cover.condition_generale = "Bon état apparent";
  cover.description_sommaire.type_maison = "Unifamiliale";
  cover.limitations_free_text = "Inspection visuelle uniquement.";
  cover.limitations_checklist = { roof_inaccessible: true };
  cover.compliance_profile_v1 = {
    schema_version: 1,
    mode: "QC_2027",
    clauses_pack_version: "QC_2027_v1",
  };
  return cover;
}

function buildFullQcZeroDraftContext(electricalLinkedCount: number) {
  const entries = QC_SYSTEM_CODES.map((sys) => ({
    id: createObservationId(),
    zone: ZONE_BY_SYSTEM[sys],
    note: "Observation test",
    severity: "low",
  }));

  const photos: Array<{ photo_id: string; observation_id: string | null }> = [];
  for (const entry of entries) {
    const sys = zoneToSystemCode(entry.zone);
    const count = sys === "electricite" ? electricalLinkedCount : 2;
    for (let i = 0; i < count; i++) {
      photos.push({
        photo_id: createObservationId(),
        observation_id: entry.id,
      });
    }
  }

  return buildZeroDraftComplianceContext({
    cover: qcCoverReady(),
    payload: { entries },
    linkedPhotos: photos,
    reportScope: "full",
  });
}

function buildElectricalOrphanPhotosContext() {
  const entries = QC_SYSTEM_CODES.map((sys) => ({
    id: createObservationId(),
    zone: ZONE_BY_SYSTEM[sys],
    note: "Observation test",
    severity: "low",
  }));
  const electricalEntry = entries.find(
    (e) => zoneToSystemCode(e.zone) === "electricite",
  );
  assert.ok(electricalEntry);

  const photos: Array<{ photo_id: string; observation_id: string | null }> = [];
  for (const entry of entries) {
    const sys = zoneToSystemCode(entry.zone);
    if (sys === "electricite") {
      photos.push({
        photo_id: createObservationId(),
        observation_id: electricalEntry.id,
      });
      photos.push({
        photo_id: createObservationId(),
        observation_id: null,
      });
      photos.push({
        photo_id: createObservationId(),
        observation_id: createObservationId(),
      });
      continue;
    }
    for (let i = 0; i < 2; i++) {
      photos.push({
        photo_id: createObservationId(),
        observation_id: entry.id,
      });
    }
  }

  return buildZeroDraftComplianceContext({
    cover: qcCoverReady(),
    payload: { entries },
    linkedPhotos: photos,
    reportScope: "full",
  });
}

describe("validateCompliance — QC_AIBQ_2027 électrique min 2 photos", () => {
  it("bloque si une seule photo liée aux constats électriques (observation_id)", () => {
    const ctx = buildFullQcZeroDraftContext(1);
    assert.equal(countLinkedPhotosForSystem(ctx, "electricite"), 1);

    const result = validateCompliance(ctx);
    const electrical = result.results.find(
      (r) => r.code === "qc_aibq_2027_electrical_min_photos",
    );
    assert.ok(electrical);
    assert.equal(electrical?.passed, false);
    assert.equal(result.gate, "blocked");
    assert.ok(
      result.blocking.some((b) => b.code === "qc_aibq_2027_electrical_min_photos"),
    );
  });

  it("conformité réussie avec photos liées par observation_id uniquement", () => {
    const ctx = buildFullQcZeroDraftContext(2);
    assert.ok(countLinkedPhotosForSystem(ctx, "electricite") >= 2);

    const result = validateCompliance(ctx);
    assert.equal(result.rulesetId, QC_AIBQ_2027_RULESET_ID);
    assert.equal(result.gate, "ready");
    assert.equal(result.blocking.length, 0);

    const v1 = buildComplianceValidationV1(result);
    assert.equal(v1.schema_version, 1);
    assert.equal(v1.ruleset_id, QC_AIBQ_2027_RULESET_ID);
    assert.ok(v1.validated_at);
    assert.equal(v1.gate, "ready");
    assert.ok(Array.isArray(v1.results));
    assert.ok(Array.isArray(v1.blocking));
    assert.ok(Array.isArray(v1.warnings));
    assert.ok(v1.checklist?.electricalMinPhotos);
  });

  it("bloque si 3 photos électriques dont 2 orphelines (seul observation_id compte)", () => {
    const ctx = buildElectricalOrphanPhotosContext();
    assert.equal(countLinkedPhotosForSystem(ctx, "electricite"), 1);

    const result = validateCompliance(ctx);
    assert.equal(result.gate, "blocked");
    assert.ok(
      result.blocking.some((b) => b.code === "qc_aibq_2027_electrical_min_photos"),
    );
  });
});

describe("Smart Inspection — gate électrique", () => {
  it("bloque si une seule photo observation_id sur constat électrique", () => {
    const elecId = createObservationId();
    const constats = QC_SYSTEM_CODES.map((systemCode) => ({
      id: systemCode === "electricite" ? elecId : createObservationId(),
      systemCode,
      normSectionId: systemCode === "electricite" ? ("electrical" as const) : undefined,
      hasObservationText: true,
      hasRecommendation: true,
      severity: "low",
    }));

    const photos: Array<{ photo_id: string; observation_id: string | null }> = [
      { photo_id: createObservationId(), observation_id: elecId },
    ];
    for (const c of constats) {
      if (c.systemCode === "electricite") continue;
      photos.push(
        { photo_id: createObservationId(), observation_id: c.id },
        { photo_id: createObservationId(), observation_id: c.id },
      );
    }

    const ctx: ComplianceContext = {
      province: "QC",
      normBody: "AIBQ",
      normVersion: "2027",
      rulesetId: QC_AIBQ_2027_RULESET_ID,
      cover: null,
      reportScope: "full",
      constats,
      photos,
    };

    const result = validateCompliance(ctx);
    assert.equal(result.gate, "blocked");
    assert.ok(
      result.blocking.some((b) => b.code === "qc_aibq_2027_electrical_min_photos"),
    );
  });
});

describe("validateCompliance — province sans ruleset", () => {
  it("retourne gate warning au lieu de ready silencieux", () => {
    const ctx: ComplianceContext = {
      province: "ON",
      normBody: "OAHI",
      normVersion: "2023",
      rulesetId: "",
      cover: null,
      reportScope: "full",
      constats: [],
      photos: [],
    };

    const result = validateCompliance(ctx);
    assert.equal(result.gate, "warning");
    assert.equal(result.rulesetId, "");
    assert.equal(result.blocking.length, 0);
    assert.equal(result.warnings.length, 1);
    assert.equal(result.warnings[0]?.code, COMPLIANCE_NO_RULESET_CODE);
    assert.equal(result.warnings[0]?.messageFr, COMPLIANCE_NO_RULESET_MESSAGE_FR);

    const v1 = buildComplianceValidationV1(result);
    assert.equal(v1.gate, "warning");
    assert.equal(v1.warnings[0]?.messageFr, COMPLIANCE_NO_RULESET_MESSAGE_FR);
  });
});

describe("gate export PDF — ready / warning / blocked", () => {
  it("ON sans ruleset : warning, PDF autorisé", () => {
    const ctx: ComplianceContext = {
      province: "ON",
      normBody: "OAHI",
      normVersion: "2023",
      rulesetId: "",
      cover: null,
      reportScope: "full",
      constats: [],
      photos: [],
    };

    const result = validateCompliance(ctx);
    assert.equal(result.gate, "warning");
    assert.equal(isCompliancePdfBlocked(result.gate), false);
  });

  it("QC non conforme (électrique 1/2 photos) : blocked, PDF refusé", () => {
    const result = validateCompliance(buildFullQcZeroDraftContext(1));
    assert.equal(result.gate, "blocked");
    assert.equal(isCompliancePdfBlocked(result.gate), true);
    assert.ok(
      result.blocking.some((b) => b.code === "qc_aibq_2027_electrical_min_photos"),
    );
  });
});
