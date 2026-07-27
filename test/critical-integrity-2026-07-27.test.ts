import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { describe, it } from "node:test";

import { isOwnedInspectionNotePath } from "../lib/noteStoragePath";
import { validateImageInputs } from "../lib/services/pipeline";

const root = process.cwd();
const read = (relativePath: string) =>
  fs.readFileSync(path.join(root, relativePath), "utf8");

describe("report-content post-timeout write guard", () => {
  it("aborts persistence after the route timeout signal fires", () => {
    const source = read("app/api/report-content/route.ts");
    assert.match(source, /function throwIfRouteTimedOut\s*\(\s*signal:\s*AbortSignal\s*\)/);
    assert.match(source, /throwIfRouteTimedOut\s*\(\s*routeAbort\.signal\s*\)/);
    assert.match(
      source,
      /throwIfRouteTimedOut\s*\(\s*routeAbort\.signal\s*\);\s*[\s\S]*?updateReportPayloadWithUnlock/,
    );
    assert.match(
      source,
      /throwIfRouteTimedOut\s*\(\s*routeAbort\.signal\s*\);\s*[\s\S]*?persistReportPhotoSelectionDb/,
    );
  });
});

describe("ingest-qc-events fail-closed auth", () => {
  it("refuses requests when INGEST_QC_EVENTS_SECRET is missing or mismatched", () => {
    const source = read("supabase/functions/ingest-qc-events/index.ts");
    assert.match(
      source,
      /if\s*\(\s*!secret\s*\|\|\s*secret\s*===\s*""\s*\|\|\s*hdr\s*!==\s*secret\s*\)/,
    );
    assert.doesNotMatch(
      source,
      /if\s*\(\s*secret\s*!=\s*null\s*&&\s*secret\s*!==\s*""\s*&&\s*hdr\s*!==\s*secret\s*\)/,
    );
  });

  it("passes a numeric HTTP status to json() on insert failure", () => {
    const source = read("supabase/functions/ingest-qc-events/index.ts");
    assert.match(
      source,
      /return json\(\s*\{\s*ok:\s*false,\s*error:\s*error\.message\s*\},\s*500\s*\)/,
    );
    assert.doesNotMatch(
      source,
      /return json\(\s*\{\s*ok:\s*false,\s*error:\s*error\.message\s*\},\s*\{\s*status:\s*500\s*\}\s*\)/,
    );
  });
});

describe("process-notes storage path ownership", () => {
  it("accepts only flat keys under notes/<report_id>/", () => {
    const reportId = "11111111-1111-1111-1111-111111111111";
    assert.equal(
      isOwnedInspectionNotePath(`notes/${reportId}/123-photo.jpg`, reportId),
      true,
    );
    assert.equal(
      isOwnedInspectionNotePath(`notes/${reportId}/123-audio.m4a`, reportId),
      true,
    );
    assert.equal(
      isOwnedInspectionNotePath(
        `notes/22222222-2222-2222-2222-222222222222/123-photo.jpg`,
        reportId,
      ),
      false,
    );
    assert.equal(
      isOwnedInspectionNotePath(`notes/${reportId}/../other/secret.jpg`, reportId),
      false,
    );
    assert.equal(
      isOwnedInspectionNotePath(`notes/${reportId}/nested/path.jpg`, reportId),
      false,
    );
  });

  it("gates Edge and Next process-notes downloads on owned paths", () => {
    const edge = read("supabase/functions/process-notes/index.ts");
    const next = read("app/api/process-notes/route.ts");
    assert.match(edge, /isOwnedInspectionNotePath/);
    assert.match(edge, /note_path_forbidden/);
    assert.match(next, /isOwnedInspectionNotePath/);
    assert.match(next, /note_path_forbidden/);
  });
});

describe("analyze image SSRF guard", () => {
  it("rejects remote http(s) image inputs before model calls", () => {
    assert.throws(
      () => validateImageInputs(["https://example.com/a.jpg"]),
      /INVALID_IMAGE_FORMAT/,
    );
    assert.throws(
      () => validateImageInputs(["http://127.0.0.1/secret"]),
      /INVALID_IMAGE_FORMAT/,
    );
    assert.doesNotThrow(() =>
      validateImageInputs([
        "data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD/2wBD",
      ]),
    );
  });

  it("does not fetch remote image URLs in the Gemini helper", () => {
    const source = read("lib/services/gemini.ts");
    assert.match(source, /URL distante refusée/);
    assert.doesNotMatch(source, /await fetch\(\s*trimmed/);
  });
});
