/**
 * Phase 8P — Classic post-inspection workflow
 * `npm run test:post-inspection-workflow-8p`
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";

import {
  buildInspectionWorkflowV1,
  buildInspectorFieldNotesV1,
  INSPECTION_WORKFLOW_V1_KEY,
  INSPECTOR_FIELD_NOTES_V1_KEY,
  isPostInspectionWorkflow,
  normalizeInspectorWorkflowMode,
  parseInspectionWorkflowV1,
  readInspectorFieldNotesFromPayload,
  WORKFLOW_CHOICE_COPY,
} from "@/lib/inspectorWorkflow";
import { normalizeInspectorProfileInput } from "@/lib/inspectorProfile";
import { MAX_INSPECTION_PHOTOS } from "@/lib/inspectionPhotoLimits";
import { isSteveFieldMode } from "@/lib/steveFieldMode";

const ROOT = join(process.cwd());

function read(rel: string): string {
  return readFileSync(join(ROOT, rel), "utf8");
}

describe("Phase 8P post-inspection workflow", () => {
  it("A) bulk folder import supports 300 photos cap and chronological metadata", () => {
    const importBtn = read("components/FieldImportButton.tsx");
    assert.match(importBtn, /sortFilesChronologically/);
    assert.match(importBtn, /lastModified/);
    assert.match(importBtn, /originalTimestamp/);
    assert.match(importBtn, /sequenceNumber/);
    assert.match(importBtn, /batchExpectedCount/);
    assert.match(importBtn, /webkitdirectory/);
    assert.match(importBtn, /Organisation des photos/);
    assert.ok(MAX_INSPECTION_PHOTOS >= 300);
  });

  it("B) PostInspectionWorkspace wires import, notes, review, PDF steps", () => {
    const ws = read("components/PostInspectionWorkspace.tsx");
    assert.match(ws, /FieldImportButton/);
    assert.match(ws, /InspectorFieldNotesPanel/);
    assert.match(ws, /InspectionReviewWorkspace|onReview/);
    assert.match(ws, /SteveReportReadyPanel/);
    assert.match(ws, /fast-report\/generate/);
    assert.match(ws, /report-readiness\/prepare/);
    assert.doesNotMatch(ws, /analysis jobs/i);
  });

  it("C) report generation path unchanged — fast-report APIs reused", () => {
    const ws = read("components/PostInspectionWorkspace.tsx");
    assert.match(ws, /\/api\/fast-report\/plan/);
    assert.match(ws, /\/api\/fast-report\/generate/);
    const createRoute = read("app/api/inspector/create-inspection/route.ts");
    assert.match(createRoute, /INSPECTION_WORKFLOW_V1_KEY/);
    assert.match(createRoute, /buildInspectionWorkflowV1/);
  });

  it("D) preferred_workflow saved on profile and new inspection sheet", () => {
    const migration = read(
      "supabase/migrations/20260620100000_inspector_profiles_preferred_workflow.sql",
    );
    assert.match(migration, /preferred_workflow/);
    assert.match(migration, /field_assistant/);
    assert.match(migration, /post_inspection/);

    const profile = normalizeInspectorProfileInput({
      preferred_workflow: "post_inspection",
    });
    assert.equal(profile.preferred_workflow, "post_inspection");

    const sheet = read("components/NewInspectionSheet.tsx");
    assert.match(sheet, /WORKFLOW_CHOICE_COPY/);
    assert.match(sheet, /preferred_workflow/);
    assert.match(sheet, /workflowMode/);
    assert.match(sheet, /rememberWorkflow/);

    const prefs = read("components/settings/ReportPreferencesForm.tsx");
    assert.match(prefs, /preferred_workflow/);
  });

  it("E) field / Steve mode unchanged when workflow is field_assistant", () => {
    assert.equal(isSteveFieldMode(), true);
    const fieldClient = read("components/ReportFieldPageClient.tsx");
    assert.match(fieldClient, /InspectorSimpleWorkspace/);
    assert.match(fieldClient, /SteveTestObserver/);

    const payload = {
      [INSPECTION_WORKFLOW_V1_KEY]: buildInspectionWorkflowV1("field_assistant"),
    };
    assert.equal(isPostInspectionWorkflow(payload), false);

    const postPayload = {
      [INSPECTION_WORKFLOW_V1_KEY]: buildInspectionWorkflowV1("post_inspection"),
    };
    assert.equal(isPostInspectionWorkflow(postPayload), true);
  });

  it("inspector field notes stored in payload for IA context", () => {
    const notes = buildInspectorFieldNotesV1("Toiture vieillissante côté nord.", "dictated");
    assert.equal(notes.schema_version, 1);
    assert.equal(notes.source, "dictated");

    const payload = { [INSPECTOR_FIELD_NOTES_V1_KEY]: notes };
    const roundTrip = readInspectorFieldNotesFromPayload(payload);
    assert.equal(roundTrip?.text, notes.text);

    const api = read("app/api/inspector-field-notes/route.ts");
    assert.match(api, /INSPECTOR_FIELD_NOTES_V1_KEY/);
    assert.match(read("components/InspectorFieldNotesPanel.tsx"), /inspector-field-notes/);
  });

  it("workflow choice copy is non-technical", () => {
    assert.match(WORKFLOW_CHOICE_COPY.fr.title, /Comment voulez-vous travailler/);
    assert.match(WORKFLOW_CHOICE_COPY.fr.fieldDesc, /sur place/);
    assert.match(WORKFLOW_CHOICE_COPY.fr.postDesc, /après ma visite/);

    const parsed = parseInspectionWorkflowV1(
      buildInspectionWorkflowV1("post_inspection"),
    );
    assert.equal(parsed?.mode, "post_inspection");
    assert.equal(normalizeInspectorWorkflowMode("invalid"), "field_assistant");
  });

  it("post_inspection routes to PostInspectionWorkspace not field screen", () => {
    const client = read("components/ReportFieldPageClient.tsx");
    assert.match(client, /PostInspectionWorkspace/);
    assert.match(client, /isPostInspectionWorkflow/);
    assert.match(client, /view === "post"/);
  });
});
