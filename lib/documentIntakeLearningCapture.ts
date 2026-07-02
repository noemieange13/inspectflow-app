/**
 * Pilot #0.39 — capture inspector learning only after explicit confirmation.
 */
import type { DocumentIntelligenceResult } from "@/lib/document-intelligence";
import type { ParsedDocumentMeta } from "@/components/InspectionDocumentUpload";
import { resolveDocumentIntakePrefill } from "@/lib/documentIntakePrefill";
import type { DocumentFusionV1 } from "@/lib/documentFusionEngine";
import {
  recordLearningCorrection,
  resolveInspectorLearningIdFromAccessToken,
  type LearningField,
} from "@/lib/inspectorLearning";

function readConfidence(
  analysis: DocumentIntelligenceResult,
  field: LearningField,
): number {
  switch (field) {
    case "address":
      return (
        analysis.field_sheet_intelligence_v1?.property.address?.confidence ??
        analysis.field_sheet_form_v1?.property.address?.confidence ??
        0.7
      );
    case "client":
      return (
        analysis.field_sheet_intelligence_v1?.client.name?.confidence ??
        analysis.field_sheet_contact_v1?.client_name?.confidence ??
        0.7
      );
    case "construction_year":
      return (
        analysis.field_sheet_intelligence_v1?.property.construction_year?.confidence ??
        analysis.field_sheet_form_v1?.property.construction_year?.confidence ??
        0.7
      );
    default:
      return 0.7;
  }
}

function readOriginalExtractedValue(
  analysis: DocumentIntelligenceResult,
  fusion: DocumentFusionV1 | null | undefined,
  field: LearningField,
): string {
  const prefill = resolveDocumentIntakePrefill(analysis, fusion);
  switch (field) {
    case "address":
      return prefill.address;
    case "client":
      return prefill.clientName;
    case "construction_year":
      return (
        analysis.field_sheet_intelligence_v1?.property.construction_year?.value ??
        analysis.field_sheet_form_v1?.property.construction_year?.value ??
        analysis.property.constructionYear ??
        ""
      );
    case "building_type":
      return (
        analysis.field_sheet_intelligence_v1?.property.building_type?.value ??
        analysis.field_sheet_form_v1?.property.building_type?.value ??
        analysis.property.buildingTypeLabel ??
        ""
      );
    case "roof":
      return (
        analysis.field_sheet_intelligence_v1?.systems.roof?.value ??
        analysis.field_sheet_form_v1?.roof.covering?.value ??
        analysis.building?.roof_covering ??
        ""
      );
    case "heating":
      return (
        analysis.field_sheet_intelligence_v1?.systems.heating?.value ??
        analysis.field_sheet_form_v1?.heating.type?.value ??
        analysis.building?.heating_type ??
        ""
      );
    case "electrical_panel":
      return analysis.field_sheet_intelligence_v1?.systems.electrical_panel?.value ?? "";
    case "notes":
      return analysis.inspector_raw_notes_v1?.notes?.[0]?.text ?? "";
    default:
      return "";
  }
}

export function captureInspectorLearningOnIntakeConfirm(input: {
  inspector_id?: string | null;
  access_token?: string | null;
  analysis: DocumentIntelligenceResult;
  fusion?: DocumentFusionV1 | null;
  document?: ParsedDocumentMeta | null;
  confirmed: {
    clientName: string;
    address: string;
  };
  source?: string;
}): void {
  const inspectorId =
    input.inspector_id?.trim() ||
    resolveInspectorLearningIdFromAccessToken(input.access_token) ||
    "";
  if (!inspectorId) return;

  const documentContext = {
    document_type: input.document?.document_type ?? "other",
    file_name: input.document?.fileName ?? "",
    source: input.source ?? "intake_confirm",
  };

  const pairs: Array<{ field: LearningField; corrected: string }> = [
    { field: "address", corrected: input.confirmed.address },
    { field: "client", corrected: input.confirmed.clientName },
  ];

  for (const pair of pairs) {
    const original = readOriginalExtractedValue(input.analysis, input.fusion, pair.field);
    recordLearningCorrection({
      inspector_id: inspectorId,
      field: pair.field,
      original_value: original,
      corrected_value: pair.corrected,
      source: documentContext.source,
      confidence_before: readConfidence(input.analysis, pair.field),
      document_context: documentContext,
    });
  }
}
