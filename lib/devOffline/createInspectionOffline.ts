import { stampDevInspectorAttribution } from "@/lib/devInspectorMode";
import { inferJurisdictionFromAddress } from "@/lib/inspectorHomeList";
import {
  buildInspectionWorkflowV1,
  INSPECTION_WORKFLOW_V1_KEY,
  normalizeInspectorWorkflowMode,
} from "@/lib/inspectorWorkflow";
import { REPORT_LANGUAGE_PAYLOAD_KEY } from "@/lib/reportLanguage";

import { embedOfflineDevProfileInPayload } from "./embedProfile";
import { createOfflineInspection, offlineInspectionResponse } from "./inspection";

export async function runOfflineCreateInspection(input: {
  clientName: string;
  address: string;
  inspectionType: string;
  userId: string;
  workflowModeRaw?: string | null;
  reportPayload?: Record<string, unknown>;
}) {
  const jurisdiction = inferJurisdictionFromAddress(input.address);
  const workflowMode = normalizeInspectorWorkflowMode(
    input.workflowModeRaw ?? "field_assistant",
  );

  let reportPayload: Record<string, unknown> = input.reportPayload ?? {
    cover_v1: {
      schema_version: 1,
      client_name: input.clientName,
      address: input.address,
      requerants: input.clientName,
      inspection_type: input.inspectionType,
      language: "fr",
      jurisdiction,
      created_at: new Date().toISOString(),
    },
    [REPORT_LANGUAGE_PAYLOAD_KEY]: "fr-CA",
    language: "fr",
    [INSPECTION_WORKFLOW_V1_KEY]: buildInspectionWorkflowV1(workflowMode),
  };

  reportPayload = await embedOfflineDevProfileInPayload(reportPayload);
  reportPayload = stampDevInspectorAttribution(reportPayload);

  const offline = await createOfflineInspection({
    clientName: input.clientName,
    address: input.address,
    inspectionType: input.inspectionType,
    reportPayload,
    userId: input.userId,
  });

  return offlineInspectionResponse(offline);
}
