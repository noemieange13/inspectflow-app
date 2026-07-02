/**
 * Pilot #0.34 — document type priority + field ownership
 * `npm run test:document-ownership-pilot-034`
 */
import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";

import { analyzeDocumentText } from "@/lib/document-intelligence";
import {
  setFusionDecisionTraceCollectorForTests,
  type FusionDecisionTrace,
} from "@/lib/documentFieldOwnership";
import { fuseDocuments } from "@/lib/documentFusionEngine";
import { resolveDocumentIntakePrefill } from "@/lib/documentIntakePrefill";
import { DV_CONTAMINATION_PILOT_034_TEXT } from "@/test/fixtures/documentOwnershipPilot034";
import {
  STEVE_COMPLETE_TEMPLATE_PILOT_031_BLOCKS,
  STEVE_COMPLETE_TEMPLATE_PILOT_031_TEXT,
} from "@/test/fixtures/steveCompleteTemplatePilot031Blocks";

describe("Pilot #0.34 document ownership and fusion priority", () => {
  afterEach(() => {
    setFusionDecisionTraceCollectorForTests(null);
  });

  it("rejects DV legal boilerplate for client.name and keeps Steve inspection fields", () => {
    const steveAnalysis = analyzeDocumentText(STEVE_COMPLETE_TEMPLATE_PILOT_031_TEXT, {
      documentType: "steve_field_notes",
      layoutBlocks: STEVE_COMPLETE_TEMPLATE_PILOT_031_BLOCKS,
    });
    const dvAnalysis = analyzeDocumentText(DV_CONTAMINATION_PILOT_034_TEXT, {
      documentType: "seller_disclosure",
    });

    assert.match(
      dvAnalysis.client?.name ?? "",
      /prendre connaissance des r[eé]ponses donn[eé]es/i,
    );

    const traces: FusionDecisionTrace[] = [];
    setFusionDecisionTraceCollectorForTests((trace) => traces.push(trace));

    const fusion = fuseDocuments([
      {
        document_type: "seller_disclosure",
        fileName: "dv.pdf",
        documentId: "dv-pilot-034",
        analysis: dvAnalysis,
        confidence: 0.9,
        needsReview: false,
      },
      {
        document_type: "steve_field_notes",
        fileName: "checklist-steve.pdf",
        documentId: "steve-pilot-034",
        analysis: steveAnalysis,
        confidence: 0.9,
        needsReview: false,
      },
    ]);

    const prefill = resolveDocumentIntakePrefill(steveAnalysis, fusion);

    if (fusion.client.name?.value) {
      assert.match(fusion.client.name.value, /Christian Tremblay/i);
      assert.equal(fusion.client.name.document_type, "steve_field_notes");
    } else {
      assert.equal(fusion.client.name, undefined);
    }

    assert.doesNotMatch(prefill.clientName, /prendre connaissance/i);
    if (prefill.clientName) {
      assert.match(prefill.clientName, /Christian Tremblay/i);
    }

    assert.match(prefill.address, /2404 Rue de la Reine des Prés/i);
    assert.match(prefill.address, /Mont-Laurier/i);
    assert.doesNotMatch(prefill.address, /999 rue Autre/i);
    assert.equal(fusion.property.address?.document_type, "steve_field_notes");
    assert.equal(fusion.property.year_built?.value, "2003");
    assert.notEqual(fusion.property.year_built?.document_type, "seller_disclosure");
    assert.match(fusion.building.heating?.value ?? "", /plinthe/i);
    assert.match(fusion.building.roof?.value ?? "", /Bardeaux/i);

    assert.ok(fusion.seller_disclosure.risks.length > 0 || fusion.seller_disclosure.renovations.length > 0);
    assert.equal(fusion.seller_disclosure.source, "DV");

    const rejectedDvClient = traces.find(
      (trace) =>
        trace.field === "client.name" &&
        trace.source_document === "seller_disclosure" &&
        trace.accepted === false,
    );
    assert.ok(rejectedDvClient);
    assert.match(rejectedDvClient?.reason ?? "", /seller_disclosure_not_allowed|invalid_client_name_pattern/);
  });

  it("stores DV-only analysis without promoting invalid client into prefill", () => {
    const dvAnalysis = analyzeDocumentText(DV_CONTAMINATION_PILOT_034_TEXT, {
      documentType: "seller_disclosure",
    });
    const prefill = resolveDocumentIntakePrefill(dvAnalysis);
    assert.equal(prefill.clientName, "");
    assert.equal(prefill.address, "");
    assert.ok(dvAnalysis.seller_disclosure_v1?.received_before_inspection);
  });
});
