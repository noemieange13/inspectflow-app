/**
 * Phase 8R — Steve zero-hesitation dashboard UX
 * `npm run test:steve-dashboard-8r`
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";

import { FORBIDDEN_VISIBLE_UI_TERMS } from "@/lib/commercialCopy8g";
import { FIRST_INSPECTION_GUIDE } from "@/lib/commercialCopy8g";
import {
  REMEMBER_WORKFLOW_CHOICE_STORAGE_KEY,
  WORKFLOW_CHOICE_COPY,
  shouldSkipWorkflowChoiceStep,
} from "@/lib/inspectorWorkflow";
import { STEVE_FORBIDDEN_UI_TERMS } from "@/lib/steveFieldMode";

const ROOT = join(process.cwd());

function read(rel: string): string {
  return readFileSync(join(ROOT, rel), "utf8");
}

function extractUserFacingStrings(source: string): string[] {
  const out: string[] = [];
  const literalRe = /(?:\?|:)\s*"([^"]{3,})"/g;
  let m: RegExpExecArray | null;
  while ((m = literalRe.exec(source)) !== null) {
    out.push(m[1]!);
  }
  const jsxRe = />\s*([^<{][^<]*?)\s*</g;
  while ((m = jsxRe.exec(source)) !== null) {
    const s = m[1]!.trim();
    if (!s || /[={}]/.test(s)) continue;
    out.push(s);
  }
  return out;
}

describe("Phase 8R Steve dashboard", () => {
  it("A) new user sees a single primary CTA on dashboard", () => {
    const home = read("components/InspectorHome.tsx");
    assert.match(home, /\+ Nouvelle inspection/);
    assert.match(home, /min-h-\[60px\]/);
    assert.doesNotMatch(home, /Inspection assistée/);
    assert.doesNotMatch(home, /NewAIInspectionSheet/);
    assert.doesNotMatch(home, /setAiSheetOpen/);
  });

  it("B) Nouvelle inspection opens workflow choice", () => {
    const sheet = read("components/NewInspectionSheet.tsx");
    assert.match(sheet, /WORKFLOW_CHOICE_COPY/);
    assert.match(sheet, /step === "workflow"/);
    assert.match(WORKFLOW_CHOICE_COPY.fr.title, /aujourd'hui/);
    assert.match(WORKFLOW_CHOICE_COPY.fr.fieldDesc, /sur place/);
    assert.match(WORKFLOW_CHOICE_COPY.fr.postDesc, /après ma visite/);
    assert.match(sheet, /recommendedBadge/);
  });

  it("C) post_inspection workflow option wired", () => {
    const sheet = read("components/NewInspectionSheet.tsx");
    assert.match(sheet, /post_inspection/);
    assert.match(sheet, /workflowMode/);
    assert.match(read("app/api/inspector/create-inspection/route.ts"), /workflowMode/);
    assert.match(read("components/ReportFieldPageClient.tsx"), /PostInspectionWorkspace/);
  });

  it("D) field_assistant workflow option wired", () => {
    const sheet = read("components/NewInspectionSheet.tsx");
    assert.match(sheet, /field_assistant/);
    assert.match(read("components/ReportFieldPageClient.tsx"), /InspectorSimpleWorkspace/);
    assert.match(read("lib/steveFieldMode.ts"), /isSteveFieldMode/);
  });

  it("E) preferred_workflow can skip workflow step when remembered", () => {
    assert.equal(REMEMBER_WORKFLOW_CHOICE_STORAGE_KEY, "inspectflow_remember_workflow_v1");
    assert.equal(shouldSkipWorkflowChoiceStep("field_assistant"), false);
    const sheet = read("components/NewInspectionSheet.tsx");
    assert.match(sheet, /shouldSkipWorkflowChoiceStep/);
    assert.match(sheet, /setWorkflowChoiceRemembered/);
    assert.match(sheet, /preferred_workflow/);
    assert.match(read("components/settings/ReportPreferencesForm.tsx"), /preferred_workflow/);
  });

  it("F) no forbidden technical terms on dashboard flow", () => {
    const files = [
      "components/InspectorHome.tsx",
      "components/NewInspectionSheet.tsx",
      "components/FirstInspectionGuide.tsx",
    ];
    const forbidden = [...FORBIDDEN_VISIBLE_UI_TERMS, ...STEVE_FORBIDDEN_UI_TERMS];
    for (const file of files) {
      const strings = extractUserFacingStrings(read(file)).filter((s) => {
        if (s.includes("/") || s.includes("application")) return false;
        if (/^[a-z0-9_.-]+$/i.test(s) && !s.includes(" ")) return false;
        if (/^(border|bg-|ring-)/.test(s)) return false;
        return s.length >= 4 || /\s/.test(s) || /[👋📷📁]/.test(s);
      });
      const visible = strings.join("\n").toLowerCase();
      for (const term of forbidden) {
        const re =
          term.length <= 3
            ? new RegExp(`\\b${term.replace(/\s+/g, "\\s+")}\\b`, "i")
            : new RegExp(term.replace(/\s+/g, "\\s+"), "i");
        assert.doesNotMatch(visible, re, `${file} must not show "${term}"`);
      }
    }
  });

  it("FirstInspectionGuide is visual help only — no extra CTA button", () => {
    const guide = read("components/FirstInspectionGuide.tsx");
    assert.doesNotMatch(guide, /onStart/);
    assert.doesNotMatch(guide, /Commencer ma première inspection/);
    assert.match(guide, /FIRST_INSPECTION_GUIDE/);
    assert.equal(FIRST_INSPECTION_GUIDE.fr.steps.length, 4);
  });

  it("non-regression — 8P/8N/8K/8Q paths untouched", () => {
    assert.match(read("components/PostInspectionWorkspace.tsx"), /FieldImportButton/);
    assert.match(read("lib/fast_report_engine/index.ts"), /export/);
    assert.match(read("lib/inspectorReportStyle.ts"), /inspector_report_style_v1/);
    assert.match(read("docs/ux-audit-before-8r-steve-dashboard.md"), /Phase 8R/);
  });
});
