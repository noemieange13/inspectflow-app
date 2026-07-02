/**
 * Pilot #0.21 — Steve uncertain candidate preservation
 * `npm run test:steve-candidate-preservation-pilot-021`
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { analyzeDocumentText } from "@/lib/document-intelligence";
import { fuseDocuments } from "@/lib/documentFusionEngine";
import { resolveDocumentIntakePrefill } from "@/lib/documentIntakePrefill";
import { reconstructClientNameFromBlocks } from "@/lib/steveClientNameReconstruction";
import { reconstructAddressFromLayout } from "@/lib/steveAddressReconstruction";
import { joinActiveCandidateText } from "@/lib/steveFieldCandidates";
import {
  STEVE_CANDIDATE_PRESERVATION_PILOT_021_BLOCKS,
  STEVE_CANDIDATE_PRESERVATION_PILOT_021_TEXT,
  STEVE_PILOT_021_GROUPED_ADDRESS_RAW,
  STEVE_PILOT_021_UNCERTAIN_ADDRESS_TOKENS,
} from "@/test/fixtures/steveCandidatePreservationPilot021Blocks";

describe("Pilot #0.21 Steve uncertain candidate preservation", () => {
  it("groups uncertain address tokens before confidence filtering", () => {
    const reconstruction = reconstructAddressFromLayout(STEVE_CANDIDATE_PRESERVATION_PILOT_021_BLOCKS);
    assert.ok(reconstruction);

    const grouped = joinActiveCandidateText(reconstruction!.candidates);
    assert.equal(grouped, STEVE_PILOT_021_GROUPED_ADDRESS_RAW);
    assert.notEqual(reconstruction!.normalized_value.trim(), "2404");

    for (const token of STEVE_PILOT_021_UNCERTAIN_ADDRESS_TOKENS) {
      assert.ok(
        reconstruction!.candidates.some((candidate) => candidate.text.includes(token)),
        `expected uncertain token preserved: ${token}`,
      );
    }

    assert.ok(
      reconstruction!.candidates.some(
        (candidate) => candidate.text === "de" && candidate.status === "candidate",
      ),
    );
  });

  it("never lets a partial high-confidence address replace the grouped candidate", () => {
    const analysis = analyzeDocumentText(STEVE_CANDIDATE_PRESERVATION_PILOT_021_TEXT, {
      documentType: "steve_field_notes",
      layoutBlocks: STEVE_CANDIDATE_PRESERVATION_PILOT_021_BLOCKS,
    });

    const address = analysis.field_sheet_v1?.property.address;
    assert.ok(address);
    assert.notEqual(address?.value.trim(), "2404");
    assert.match(address?.value ?? "", /Rue de la Reine des Prés/i);
    assert.match(address?.value ?? "", /Mont-Laurier J9L 0H3/i);
    assert.ok((address?.candidates?.length ?? 0) >= 5);
    assert.equal(address?.requires_confirmation, true);
    assert.equal(address?.source, "handwriting_candidate");
  });

  it("promotes low-confidence Christian Tremblay instead of leaving client empty", () => {
    const reconstructed = reconstructClientNameFromBlocks(
      STEVE_CANDIDATE_PRESERVATION_PILOT_021_BLOCKS,
      { preferSplitOverSingle: true },
    );

    assert.equal(reconstructed?.value, "Christian Tremblay");
    assert.ok(reconstructed!.confidence < 0.5);
    assert.equal(reconstructed?.requires_confirmation, true);
    assert.equal(reconstructed?.source, "handwriting_candidate");

    const analysis = analyzeDocumentText(STEVE_CANDIDATE_PRESERVATION_PILOT_021_TEXT, {
      documentType: "steve_field_notes",
      layoutBlocks: STEVE_CANDIDATE_PRESERVATION_PILOT_021_BLOCKS,
    });

    assert.equal(analysis.field_sheet_contact_v1?.client_name?.value, "Christian Tremblay");
    assert.equal(analysis.field_sheet_contact_v1?.client_name?.requires_confirmation, true);
    assert.ok((analysis.field_sheet_contact_v1?.client_name?.confidence ?? 1) < 0.5);
  });

  it("prefill still populates review fields when confirmation is required", () => {
    const analysis = analyzeDocumentText(STEVE_CANDIDATE_PRESERVATION_PILOT_021_TEXT, {
      documentType: "steve_field_notes",
      layoutBlocks: STEVE_CANDIDATE_PRESERVATION_PILOT_021_BLOCKS,
    });
    const fusion = fuseDocuments([
      {
        document_type: "steve_field_notes",
        fileName: "checklist-steve.pdf",
        documentId: "fixture-021",
        analysis,
        confidence: 0.9,
        needsReview: false,
      },
    ]);
    const prefill = resolveDocumentIntakePrefill(analysis, fusion);

    assert.equal(prefill.clientName, "Christian Tremblay");
    assert.match(prefill.address, /Rue de la Reine des Prés/i);
    assert.match(prefill.address, /Mont-Laurier J9L 0H3/i);

    assert.equal(analysis.field_sheet_contact_v1?.client_name?.requires_confirmation, true);
    assert.equal(analysis.field_sheet_v1?.property.address?.requires_confirmation, true);
  });
});
