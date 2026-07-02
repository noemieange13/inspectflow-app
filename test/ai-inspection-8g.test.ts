/**
 * Phase 8G — AI-first inspector workflow
 * `npm run test:ai-inspection-8g`
 */
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";

import {
  appendObservationEntry,
  buildObservationSaveBody,
  mergePhotoObservationLink,
} from "@/lib/aiInspectionSave";
import {
  categoryLabelFr,
  parseInspectionObservation,
  type InspectionObservationProvider,
} from "@/lib/inspection-local-ai";

const ROOT = join(process.cwd());

function read(rel: string): string {
  return readFileSync(join(ROOT, rel), "utf8");
}

describe("Phase 8G AI inspection workflow", () => {
  it("A) text observation creation — parser returns structured fields", () => {
    const obs = parseInspectionObservation(
      "Dans la cuisine, fuite importante sous l'évier, à corriger rapidement.",
    );
    assert.equal(obs.room, "Cuisine");
    assert.match(obs.issue, /fuite/i);
    assert.equal(obs.category, "infiltration");
    assert.equal(obs.severity, "majeure");
    assert.ok(obs.recommendation.length > 10);
    assert.equal(obs.zone, "cuisine");
    assert.equal(obs.issueCode, "water_infiltration");
  });

  it("B) room extraction — multiple rooms", () => {
    assert.equal(parseInspectionObservation("Salon avec tapis usé").room, "Salon");
    assert.equal(parseInspectionObservation("Salle de bain moisissure plafond").room, "Salle de bain");
    assert.equal(parseInspectionObservation("Sous-sol humide").room, "Sous-sol");
    assert.equal(parseInspectionObservation("Toiture bardeaux usés").room, "Toiture");
    assert.equal(parseInspectionObservation("Garage fissure mur").room, "Garage");
  });

  it("C) problem extraction — categories map to issue codes", () => {
    assert.equal(parseInspectionObservation("Fissure au mur du salon").category, "fissure");
    assert.equal(parseInspectionObservation("Prise électrique défectueuse").category, "électricité");
    assert.equal(parseInspectionObservation("Drain bloqué salle de bain").category, "plomberie");
    assert.equal(parseInspectionObservation("Extracteur ne fonctionne pas").category, "ventilation");
    assert.equal(parseInspectionObservation("Détecteur fumée absent").category, "sécurité");
    assert.equal(categoryLabelFr("structure"), "Structure");
  });

  it("D) recommendation generation", () => {
    const obs = parseInspectionObservation("Infiltration légère au plafond cuisine");
    assert.match(obs.recommendation, /infiltration|étanchéité/i);
    const minor = parseInspectionObservation("Légère éraflure esthétique salon");
    assert.equal(minor.severity, "mineure");
  });

  it("E) photo add — source wiring reuses FieldCameraButton", () => {
    const client = read("components/AIInspectionPageClient.tsx");
    assert.match(client, /FieldCameraButton/);
    assert.match(client, /FieldImportButton/);
    assert.match(client, /onPhotoCaptured/);
    assert.doesNotMatch(read("app/api/upload-photo/route.ts"), /AIInspectionPageClient/);
  });

  it("F) photo association — source wiring via photo-observation-links", () => {
    const prompt = read("components/PhotoAssociationPrompt.tsx");
    assert.match(prompt, /Associer cette photo/);
    assert.match(prompt, /Dernier constat/);
    assert.match(prompt, /persistPhotoObservationLink/);
    const save = read("lib/aiInspectionSave.ts");
    assert.match(save, /\/api\/photo-observation-links/);
    assert.match(save, /mergePhotoObservationLink/);

    const links = mergePhotoObservationLink({}, "photo-1", "11111111-1111-4111-8111-111111111111");
    assert.equal(links.length, 1);
    assert.equal(links[0]?.observation_id, "11111111-1111-4111-8111-111111111111");
  });

  it("G) save path uses report-content like FindingsReviewCenter", () => {
    const assistant = read("components/AIInspectionAssistant.tsx");
    const saveLib = read("lib/aiInspectionSave.ts");
    assert.match(assistant, /saveObservationEntries/);
    assert.match(saveLib, /\/api\/report-content/);
    assert.match(saveLib, /buildFindingsReviewSaveBody/);
    const body = buildObservationSaveBody("rid", "tok", { title: "T" }, []);
    assert.equal(body.report_id, "rid");
    assert.equal(body.access_token, "tok");
    assert.ok(Array.isArray(body.entries));
  });

  it("H) route /inspection/ai and dashboard entry", () => {
    assert.ok(existsSync(join(ROOT, "app/inspection/ai/page.tsx")));
    const page = read("app/inspection/ai/page.tsx");
    assert.match(page, /AIInspectionPageClient/);
    const home = read("components/InspectorHome.tsx");
    assert.match(home, /Nouvelle inspection/);
    assert.match(home, /NewInspectionSheet/);
    assert.match(home, /devDashboardMode/);
  });

  it("I) AI report review wired in field flow", () => {
    const client = read("components/ReportFieldPageClient.tsx");
    assert.match(client, /AIReportReviewScreen/);
    assert.match(client, /"ai-review"/);
    const review = read("components/AIReportReviewScreen.tsx");
    assert.match(review, /Révision IA avant rapport/);
    assert.match(review, /Générer rapport final/);
  });

  it("J) InspectionObservationProvider interface exported for future OpenAI", () => {
    const src = read("lib/inspection-local-ai.ts");
    assert.match(src, /export interface InspectionObservationProvider/);
    assert.match(src, /parseInspectionObservation/);
    const provider: InspectionObservationProvider = {
      parseInspectionObservation: (input) => parseInspectionObservation(input),
    };
    assert.ok(provider.parseInspectionObservation("cuisine fuite").zone === "cuisine");
  });

  it("K) VoiceInspectionNote uses SpeechRecognition with fallback", () => {
    const voice = read("components/VoiceInspectionNote.tsx");
    assert.match(voice, /SpeechRecognition/);
    assert.match(voice, /AIInspectionAssistant/);
    assert.match(voice, /min-h-\[44px\]/);
  });

  it("L) documentation exists", () => {
    const doc = read("docs/phase-8g-ai-inspector-workflow.md");
    assert.match(doc, /inspection-local-ai/);
    assert.match(doc, /OpenAI/);
    assert.match(doc, /test:ai-inspection-8g/);
    assert.match(doc, /DEV MODE — utilisateur test/);
    assert.match(doc, /create-test-inspection/);
  });

  it("M) dev dashboard renders without auth in development", () => {
    const home = read("components/InspectorHome.tsx");
    const devMode = read("lib/devInspectorMode.ts");
    const proxy = read("proxy.ts");
    assert.match(devMode, /DEV_AUTH_BYPASS/);
    assert.match(devMode, /DEV_INSPECTOR/);
    assert.match(home, /isDevInspectorDashboardMode/);
    assert.match(home, /DEV_MODE_BANNER_LABEL/);
    assert.match(home, /DEV_INSPECTOR_DISPLAY_NAME/);
    assert.match(proxy, /NODE_ENV === "development"/);
    assert.match(
      home,
      /devDashboardMode && !accessToken/,
    );
  });

  it("N) Nouvelle inspection IA navigates with inspection_id", () => {
    const sheet = read("components/NewAIInspectionSheet.tsx");
    assert.match(sheet, /create-test-inspection/);
    assert.match(sheet, /inspection_id/);
    const page = read("app/inspection/ai/page.tsx");
    assert.match(page, /inspection_id/);
  });

  it("non-regression: trigger-inspection and ZeroDraftReportComposer untouched", () => {
    assert.match(read("app/api/trigger-inspection/route.ts"), /invokeReportsPdf/);
    const composer = read("components/ZeroDraftReportComposer.tsx");
    assert.match(composer, /requestPdfGeneration/);
    assert.match(composer, /\/api\/trigger-inspection/);
    assert.doesNotMatch(composer, /parseInspectionObservation/);
  });

  it("non-regression: Phase 8F field validation untouched", () => {
    assert.match(read("lib/fieldMetrics.ts"), /FORBIDDEN_METRICS_KEYS/);
    assert.match(read("components/FieldTestChecklist.tsx"), /isFieldValidationMode/);
    assert.doesNotMatch(read("lib/fieldDevMode.ts"), /parseInspectionObservation/);
  });

  it("unit: appendObservationEntry adds to payload entries", () => {
    const payload = {
      entries: [{ zone: "salon", issue: "other", severity: "low", note: "x" }],
    };
    const next = appendObservationEntry(payload, {
      zone: "cuisine",
      issue: "plumbing_issue",
      severity: "medium",
      note: "y",
    });
    assert.equal(next.length, 2);
  });
});
