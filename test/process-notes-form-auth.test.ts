import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { describe, it } from "node:test";

import { appendProcessNotesAuthFields } from "../lib/processNotesFormAuth";

describe("appendProcessNotesAuthFields", () => {
  it("forwards a trimmed access_token when present", () => {
    const form = new FormData();
    appendProcessNotesAuthFields(form, {
      reportId: "rep-1",
      language: "fr",
      accessToken: "  tok-abc  ",
    });
    assert.equal(form.get("report_id"), "rep-1");
    assert.equal(form.get("language"), "fr");
    assert.equal(form.get("access_token"), "tok-abc");
  });

  it("omits access_token when missing or blank", () => {
    const form = new FormData();
    appendProcessNotesAuthFields(form, {
      reportId: "rep-2",
      language: "en",
      accessToken: "   ",
    });
    assert.equal(form.get("report_id"), "rep-2");
    assert.equal(form.get("language"), "en");
    assert.equal(form.get("access_token"), null);
  });
});

describe("Zero Draft notes auth wiring", () => {
  it("NotesCapture accepts accessToken and appends it via helper", () => {
    const src = fs.readFileSync(
      path.join(process.cwd(), "components/NotesCapture.tsx"),
      "utf8",
    );
    assert.match(src, /accessToken\?:/);
    assert.match(src, /appendProcessNotesAuthFields/);
  });

  it("ZeroDraftReportComposer passes viewerToken into NotesCapture", () => {
    const src = fs.readFileSync(
      path.join(process.cwd(), "components/ZeroDraftReportComposer.tsx"),
      "utf8",
    );
    assert.match(
      src,
      /<NotesCapture[\s\S]*?accessToken=\{viewerToken\}[\s\S]*?onNotesProcessed=/,
    );
  });
});
