/**
 * Phase 8S — Zero typing inspection creation polish
 * `npm run test:inspection-create-polish-8s`
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";

import {
  CREATION_METHOD_COPY,
  INSPECTION_FORM_INPUT_CLASS,
  REMEMBER_CREATION_METHOD_STORAGE_KEY,
  readPreferredCreationMethod,
  shouldSkipCreationMethodStep,
} from "@/lib/inspectorCreationMethod";
import { normalizeInspectorProfileInput } from "@/lib/inspectorProfile";
import { shouldSkipWorkflowChoiceStep } from "@/lib/inspectorWorkflow";

const ROOT = join(process.cwd());

function read(rel: string): string {
  return readFileSync(join(ROOT, rel), "utf8");
}

describe("Phase 8S inspection create polish", () => {
  it("A) Nouvelle inspection → import courriel → champs remplis", () => {
    const sheet = read("components/NewInspectionSheet.tsx");
    assert.match(sheet, /step === "creation"/);
    assert.match(sheet, /step === "import"/);
    assert.match(sheet, /InspectionDocumentUpload/);
    assert.match(sheet, /DocumentIntakeReview/);
    assert.match(read("components/InspectionDocumentUpload.tsx"), /inspection-document-intake\/parse/);
    assert.match(sheet, /buildDocumentIntakePayload/);
    assert.match(sheet, /variant="steve"/);
  });

  it("B) PDF DV → adresse détectée via parse pipeline", () => {
    assert.match(read("lib/documentIntakeFiles.ts"), /DOCUMENT_INTAKE_FILE_ACCEPT/);
    assert.match(read("app/api/inspection-document-intake/parse/route.ts"), /extractDocumentText/);
    assert.match(read("components/DocumentIntakeReview.tsx"), /analysis\.property\.address/);
  });

  it("C) mode manuel fonctionne encore", () => {
    const sheet = read("components/NewInspectionSheet.tsx");
    assert.match(sheet, /step === "manual"/);
    assert.match(sheet, /createInspection/);
    assert.match(read("app/api/inspector/create-inspection/route.ts"), /workflowMode/);
  });

  it("D) texte saisi visible noir", () => {
    assert.match(INSPECTION_FORM_INPUT_CLASS, /text-gray-900/);
    assert.match(INSPECTION_FORM_INPUT_CLASS, /placeholder:text-gray-400/);
    assert.match(read("components/NewInspectionSheet.tsx"), /INSPECTION_FORM_INPUT_CLASS/);
    assert.match(read("components/DocumentIntakeReview.tsx"), /INSPECTION_FORM_INPUT_CLASS/);
  });

  it("E) préférence inspecteur conservée", () => {
    assert.equal(REMEMBER_CREATION_METHOD_STORAGE_KEY, "inspectflow_remember_creation_method_v1");
    const profile = normalizeInspectorProfileInput({
      default_report_preferences: { preferred_creation_method: "manual" },
    });
    assert.equal(readPreferredCreationMethod(profile.default_report_preferences), "manual");
    assert.match(read("components/NewInspectionSheet.tsx"), /shouldSkipCreationMethodStep/);
    assert.match(read("components/settings/ReportPreferencesForm.tsx"), /preferred_creation_method/);
    assert.equal(shouldSkipCreationMethodStep("document_import"), false);
  });

  it("F) ancien workflow 8P intact", () => {
    const sheet = read("components/NewInspectionSheet.tsx");
    assert.match(sheet, /step === "workflow"/);
    assert.match(sheet, /WORKFLOW_CHOICE_COPY/);
    assert.match(sheet, /shouldSkipWorkflowChoiceStep/);
    assert.match(sheet, /preferred_workflow/);
    assert.match(read("components/ReportFieldPageClient.tsx"), /PostInspectionWorkspace/);
    assert.equal(shouldSkipWorkflowChoiceStep("field_assistant"), false);
    assert.match(CREATION_METHOD_COPY.fr.title, /Comment voulez-vous créer/);
  });

  it("human labels — no Détails de l'inspection title", () => {
    const sheet = read("components/NewInspectionSheet.tsx");
    assert.doesNotMatch(sheet, /Détails de l'inspection/);
    assert.match(sheet, /Nouvelle inspection/);
    assert.match(sheet, /CREATION_METHOD_COPY/);
    assert.match(CREATION_METHOD_COPY.fr.subtitle, /Glissez le courriel, la DV et l'ancien rapport/);
    assert.match(CREATION_METHOD_COPY.fr.importTitle, /Importer les documents de l'inspection/);
    assert.match(read("components/DocumentIntakeReview.tsx"), /Commencer/);
  });
});
