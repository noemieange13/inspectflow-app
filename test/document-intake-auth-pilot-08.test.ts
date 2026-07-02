/**
 * Pilot #0.8 — document intake auth boundary
 * `npm run test:document-intake-auth-pilot-08`
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";

import {
  DOCUMENT_INTAKE_ANALYZE_ROUTE,
  DOCUMENT_INTAKE_AUTH_POLICY,
  DOCUMENT_INTAKE_CREATE_ROUTE,
} from "@/lib/documentIntakeAuthPolicy";
import { isDocumentAuthTraceEnabled } from "@/lib/documentAuthTrace";
import {
  isAuthErrorCode,
  resolveCreateInspectionAuthError,
  resolveCreateInspectionError,
  resolveDocumentAnalyzeError,
  resolveUnexpectedAnalyzeError,
} from "@/lib/documentIntakeErrors";
import {
  parseSupabaseAuthCookieValue,
  readBearerToken,
} from "@/lib/supabaseRequestAuth";

const ROOT = join(process.cwd());

function read(rel: string): string {
  return readFileSync(join(ROOT, rel), "utf8");
}

describe("Pilot #0.8 document intake auth", () => {
  it("policy: analyze preview is scoped — no user, no DB write", () => {
    assert.equal(DOCUMENT_INTAKE_AUTH_POLICY.analyze_preview.userRequired, false);
    assert.equal(DOCUMENT_INTAKE_AUTH_POLICY.analyze_preview.databaseWrite, false);
    assert.equal(DOCUMENT_INTAKE_AUTH_POLICY.analyze_preview.temporaryResultOnly, true);
    assert.equal(DOCUMENT_INTAKE_ANALYZE_ROUTE, "/api/inspection-document-intake/parse");
  });

  it("policy: create inspection requires user and allows DB write", () => {
    assert.equal(DOCUMENT_INTAKE_AUTH_POLICY.create_inspection.userRequired, true);
    assert.equal(DOCUMENT_INTAKE_AUTH_POLICY.create_inspection.databaseWrite, true);
    assert.equal(DOCUMENT_INTAKE_CREATE_ROUTE, "/api/inspector/create-inspection");
  });

  it("parse route is preview-only — no auth gate, no database imports", () => {
    const route = read("app/api/inspection-document-intake/parse/route.ts");
    assert.match(route, /resolveRequestAuth/);
    assert.match(route, /DOCUMENT_INTAKE_ANALYZE_ROUTE/);
    assert.match(route, /dev diagnostics only/i);
    assert.doesNotMatch(route, /requireRequestAuth/);
    assert.doesNotMatch(route, /access_denied/);
    assert.doesNotMatch(route, /status:\s*403/);
    assert.doesNotMatch(route, /createServiceRoleClient/);
    assert.doesNotMatch(route, /\.from\(\s*["']reports["']\)/);
    assert.doesNotMatch(route, /\.insert\(/);
  });

  it("create-inspection route requires authenticated user — never anonymous", () => {
    const route = read("app/api/inspector/create-inspection/route.ts");
    assert.match(route, /requireRequestAuth/);
    assert.match(route, /DOCUMENT_INTAKE_CREATE_ROUTE/);
    assert.match(route, /never allow anonymous/i);
    assert.match(route, /access_denied/);
    assert.match(route, /status:\s*403/);
    assert.match(route, /\.from\(\s*["']reports["']\)/);
    assert.match(route, /\.insert\(/);
    assert.match(route, /userId/);
  });

  it("global auth is not removed — other protected routes still require user", () => {
    const home = read("app/api/inspector-home/route.ts");
    const profile = read("app/api/inspector-profile/route.ts");
    assert.match(home, /resolveBearerUserId/);
    assert.match(home, /access_denied/);
    assert.match(profile, /resolveBearerUserId/);
    assert.match(profile, /access_denied/);
  });

  it("browser and server auth sources are aligned", () => {
    const browser = read("lib/supabaseBrowser.ts");
    const requestAuth = read("lib/supabaseRequestAuth.ts");
    const tokenHook = read("lib/useSupabaseAccessToken.ts");
    assert.match(browser, /createBrowserSupabaseClient/);
    assert.match(tokenHook, /createBrowserSupabaseClient/);
    assert.match(requestAuth, /readBearerToken/);
    assert.match(requestAuth, /readSupabaseAuthCookieToken/);
    assert.match(read("lib/supabaseAuthFromRequest.ts"), /resolveRequestAuth/);
  });

  it("MultiDocumentIntakeUpload allows analyze without accessToken", () => {
    const upload = read("components/MultiDocumentIntakeUpload.tsx");
    assert.doesNotMatch(upload, /if \(!accessToken/);
    assert.match(upload, /resolveDocumentAnalyzeError/);
    assert.match(upload, /resolveUnexpectedAnalyzeError/);
    assert.match(upload, /trace registration must not block preview/);
  });

  it("NewInspectionSheet requires auth only when creating inspection", () => {
    const sheet = read("components/NewInspectionSheet.tsx");
    assert.match(sheet, /resolveCreateInspectionAuthError/);
    assert.match(sheet, /resolveCreateInspectionError/);
    assert.match(sheet, /analyser les documents sans connexion/i);
    assert.doesNotMatch(sheet, /if \(!accessToken[\s\S]{0,120}setStep\("import"\)/);
  });

  it("logged user flow: bearer token is forwarded when present", () => {
    const upload = read("components/MultiDocumentIntakeUpload.tsx");
    assert.match(upload, /if \(accessToken\?\.trim\(\)\)/);
    assert.match(upload, /headers\.Authorization/);
    const sheet = read("components/NewInspectionSheet.tsx");
    assert.match(sheet, /Authorization:\s*`Bearer \$\{token\}`/);
  });

  it("analysis works before creation — parse has no auth gate, create does", () => {
    const parseRoute = read("app/api/inspection-document-intake/parse/route.ts");
    const createRoute = read("app/api/inspector/create-inspection/route.ts");
    assert.doesNotMatch(parseRoute, /requireRequestAuth/);
    assert.match(createRoute, /requireRequestAuth/);
    assert.match(read("components/DocumentIntakeReview.tsx"), /Commencer l'inspection/);
  });

  it("missing auth does not hide parser result — fusion errors are isolated", () => {
    const upload = read("components/MultiDocumentIntakeUpload.tsx");
    assert.match(upload, /prefill trace must not block review/);
    assert.match(upload, /onFused\(/);
  });

  it("resolveDocumentAnalyzeError maps auth, OCR, and server errors", () => {
    assert.match(
      resolveDocumentAnalyzeError({ status: 403, error: "access_denied" }).message,
      /Session expirée/i,
    );
    assert.match(
      resolveDocumentAnalyzeError({ status: 422, error: "ocr_failed" }).message,
      /Analyse du document impossible/i,
    );
    assert.equal(
      resolveDocumentAnalyzeError({ error: "Fichier manquant" }).message,
      "Fichier manquant",
    );
    assert.match(
      resolveUnexpectedAnalyzeError(new Error("access_denied")),
      /Session expirée/i,
    );
  });

  it("expired session returns clear message on create-inspection", () => {
    assert.match(
      resolveCreateInspectionError({ status: 403, error: "access_denied" }),
      /Session expirée/i,
    );
    assert.equal(
      resolveCreateInspectionAuthError(),
      "Connectez-vous pour créer une inspection.",
    );
    assert.equal(isAuthErrorCode("access_denied"), true);
  });

  it("readBearerToken and cookie session parsing work", () => {
    const req = new Request("https://example.com", {
      headers: { Authorization: "Bearer test-jwt-token" },
    });
    assert.equal(readBearerToken(req), "test-jwt-token");

    const cookieToken = parseSupabaseAuthCookieValue(
      JSON.stringify(["cookie-access-token", "refresh-token"]),
    );
    assert.equal(cookieToken, "cookie-access-token");
  });

  it("auth trace is dev-only", () => {
    assert.equal(isDocumentAuthTraceEnabled(), process.env.NODE_ENV === "development");
    assert.match(read("lib/documentAuthTrace.ts"), /\[AUTH TRACE DOCUMENT FLOW\]/);
  });
});
