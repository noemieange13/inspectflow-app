import { NextRequest, NextResponse } from "next/server";

import type { DocumentIntelligenceResult } from "@/lib/document-intelligence";
import type { DocumentIntakeDocumentType } from "@/lib/documentIntakeFiles";
import { resolveActiveOrganizationId } from "@/lib/currentOrganization";
import { isDevAuthBypass, stampDevInspectorAttribution } from "@/lib/devInspectorMode";
import { runOfflineCreateInspection } from "@/lib/devOffline/createInspectionOffline";
import { withOfflineDevFallback } from "@/lib/devOffline/fallback";
import { formatApiErrorMessage } from "@/lib/devOffline/errors";
import { embedInspectorProfileInReportPayload } from "@/lib/embedInspectorProfileInReportPayload";
import {
  inspectorProfileRowToInput,
  loadInspectorProfileByUserId,
  profileWriterLanguage,
  resolveProfileDefaultReportLocale,
} from "@/lib/inspectorProfile";
import { inferJurisdictionFromAddress } from "@/lib/inspectorHomeList";
import { applyDocumentIntakeToReportPayload } from "@/lib/reportPropertySnapshot";
import {
  buildInspectionWorkflowV1,
  INSPECTION_WORKFLOW_V1_KEY,
  normalizeInspectorWorkflowMode,
} from "@/lib/inspectorWorkflow";
import { REPORT_LANGUAGE_PAYLOAD_KEY } from "@/lib/reportLanguage";
import {
  defaultReportTokenExpiresAt,
  generateReportAccessToken,
} from "@/lib/reportAccessToken";
import { createServiceRoleClient } from "@/lib/supabaseServer";
import { DOCUMENT_INTAKE_CREATE_ROUTE } from "@/lib/documentIntakeAuthPolicy";
import { requireRequestAuth } from "@/lib/supabaseRequestAuth";
import { trackUsageSafe } from "@/lib/usage_control";

const BUILDING_TYPES = new Set(["residential", "commercial", "multiplex", "condo"]);

type CreateBody = {
  clientName: string;
  address: string;
  inspectionType: string;
  workflowModeRaw: string | null;
  documentIntake: unknown;
  documentFusionRaw: unknown;
};

async function createInspectionOnline(
  userId: string,
  input: CreateBody,
): Promise<Record<string, unknown>> {
  const { clientName, address, inspectionType, workflowModeRaw, documentIntake, documentFusionRaw } =
    input;

  const supabase = await createServiceRoleClient();
  const organizationId = await resolveActiveOrganizationId(supabase, userId, null);
  const accessToken = generateReportAccessToken();
  const tokenExpiresAt = defaultReportTokenExpiresAt().toISOString();
  const jurisdiction = inferJurisdictionFromAddress(address);
  const profileRow = await loadInspectorProfileByUserId(supabase, userId);
  const profileInput = profileRow ? inspectorProfileRowToInput(profileRow) : null;
  const reportLocale = profileInput
    ? resolveProfileDefaultReportLocale(profileInput)
    : "fr-CA";
  const writerLang = profileInput ? profileWriterLanguage(profileInput) : "fr";
  const workflowMode = normalizeInspectorWorkflowMode(
    workflowModeRaw ?? profileInput?.preferred_workflow ?? "field_assistant",
  );

  let reportPayload: Record<string, unknown> = {
    cover_v1: {
      schema_version: 1,
      client_name: clientName,
      address,
      requerants: clientName,
      inspection_type: inspectionType,
      language: writerLang,
      jurisdiction,
      created_at: new Date().toISOString(),
      propriete: {
        adresse: address,
        client_nom: clientName,
        type_propriete: inspectionType,
        annee_construction: "",
        client_telephone: "",
        client_courriel: "",
      },
    },
    [REPORT_LANGUAGE_PAYLOAD_KEY]: reportLocale,
    language: writerLang,
    [INSPECTION_WORKFLOW_V1_KEY]: buildInspectionWorkflowV1(workflowMode),
  };

  if (documentFusionRaw) {
    reportPayload.document_fusion_v1 = documentFusionRaw;
  }

  if (documentIntake) {
    reportPayload.document_intake_v1 = documentIntake;
    const intakeAnalysis =
      documentIntake &&
      typeof documentIntake === "object" &&
      "analysis" in documentIntake &&
      (documentIntake as { analysis?: unknown }).analysis &&
      typeof (documentIntake as { analysis: unknown }).analysis === "object"
        ? ((documentIntake as { analysis: DocumentIntelligenceResult }).analysis)
        : null;
    const intakeDoc =
      documentIntake &&
      typeof documentIntake === "object" &&
      "documents" in documentIntake &&
      Array.isArray((documentIntake as { documents?: unknown[] }).documents)
        ? ((documentIntake as { documents: Array<{ document_type?: string }> }).documents[0] ??
          null)
        : null;
    const documentType =
      intakeDoc?.document_type && typeof intakeDoc.document_type === "string"
        ? (intakeDoc.document_type as DocumentIntakeDocumentType)
        : "other";

    if (intakeAnalysis) {
      reportPayload = applyDocumentIntakeToReportPayload(reportPayload, {
        analysis: intakeAnalysis,
        documentType,
        clientName,
        address,
        inspectionType,
        jurisdiction,
        buildingProfile: intakeAnalysis.buildingProfile,
      });
    }
  }

  reportPayload = await embedInspectorProfileInReportPayload(
    supabase,
    userId,
    reportPayload,
    organizationId,
  );
  reportPayload = stampDevInspectorAttribution(reportPayload);

  const insertRow: Record<string, unknown> = {
    user_id: userId,
    access_token: accessToken,
    token_expires_at: tokenExpiresAt,
    payload: reportPayload,
    created_at: new Date().toISOString(),
  };

  if (organizationId) {
    insertRow.organization_id = organizationId;
  }

  const { data, error } = await supabase
    .from("reports")
    .insert(insertRow)
    .select("id")
    .single();

  if (error || !data) {
    console.error("inspector/create-inspection:", error);
    if (isDevAuthBypass()) {
      return runOfflineCreateInspection({
        clientName,
        address,
        inspectionType,
        userId,
        workflowModeRaw,
        reportPayload,
      });
    }
    throw new Error("Erreur lors de la création");
  }

  const reportId = String((data as { id: unknown }).id);
  const reportUrl = `/report/${encodeURIComponent(reportId)}?token=${encodeURIComponent(accessToken)}`;

  if (organizationId) {
    trackUsageSafe(supabase, {
      organizationId,
      metric: "inspections_created",
      amount: 1,
    });
  }

  return { success: true, reportId, reportUrl };
}

export async function POST(req: NextRequest) {
  const auth = await requireRequestAuth(req, DOCUMENT_INTAKE_CREATE_ROUTE);
  if (!auth?.userId) {
    return NextResponse.json(
      { success: false, error: "access_denied", code: "session_expired" },
      { status: 403 },
    );
  }
  const userId = auth.userId;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ success: false, error: "Invalid JSON" }, { status: 400 });
  }

  if (!body || typeof body !== "object") {
    return NextResponse.json({ success: false, error: "Invalid body" }, { status: 400 });
  }

  const payload = body as Record<string, unknown>;
  const clientName = typeof payload.clientName === "string" ? payload.clientName.trim() : "";
  const address = typeof payload.address === "string" ? payload.address.trim() : "";
  const inspectionTypeRaw =
    typeof payload.inspectionType === "string" ? payload.inspectionType.trim() : "residential";
  const inspectionType = BUILDING_TYPES.has(inspectionTypeRaw)
    ? inspectionTypeRaw
    : "residential";

  const workflowModeRaw =
    typeof payload.workflowMode === "string"
      ? payload.workflowMode
      : typeof payload.preferred_workflow === "string"
        ? payload.preferred_workflow
        : null;

  const documentIntake =
    payload.document_intake_v1 && typeof payload.document_intake_v1 === "object"
      ? payload.document_intake_v1
      : null;

  const documentFusionRaw =
    payload.document_fusion_v1 && typeof payload.document_fusion_v1 === "object"
      ? payload.document_fusion_v1
      : null;

  if (!clientName || !address) {
    return NextResponse.json(
      { success: false, error: "Adresse et client requis" },
      { status: 400 },
    );
  }

  const createInput: CreateBody = {
    clientName,
    address,
    inspectionType,
    workflowModeRaw,
    documentIntake,
    documentFusionRaw,
  };

  const outcome = await withOfflineDevFallback({
    runOnline: () => createInspectionOnline(userId, createInput),
    runOffline: () =>
      runOfflineCreateInspection({
        clientName,
        address,
        inspectionType,
        userId,
        workflowModeRaw,
      }),
  });

  if (outcome.kind === "error") {
    return NextResponse.json(
      { success: false, error: formatApiErrorMessage(outcome.error) },
      { status: 500 },
    );
  }

  return NextResponse.json(outcome.value);
}
