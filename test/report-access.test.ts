import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { validateReportAccessRow } from "@/lib/assertReportAccessForApi";
import { extractReportUploadAccessToken } from "@/lib/reportUploadAccessToken";

const REPORT_ID = "22222222-2222-4222-8222-222222222222";

function emptyFormData(): FormData {
  return new FormData();
}

describe("extractReportUploadAccessToken", () => {
  it("prefers an explicit multipart access token", () => {
    const form = emptyFormData();
    form.set("access_token", " explicit-token ");
    const req = new Request("https://app.example/api/upload-photo", {
      headers: {
        host: "app.example",
        referer: `https://app.example/report/${REPORT_ID}?token=referer-token`,
      },
    });

    assert.equal(extractReportUploadAccessToken(req, form, REPORT_ID), "explicit-token");
  });

  it("uses the same-origin report referer token for existing browser uploads", () => {
    const req = new Request("https://app.example/api/upload-photo", {
      headers: {
        host: "app.example",
        referer: `https://app.example/report/${REPORT_ID}?token=referer-token`,
      },
    });

    assert.equal(
      extractReportUploadAccessToken(req, emptyFormData(), REPORT_ID),
      "referer-token",
    );
  });

  it("ignores tokens from cross-origin referers", () => {
    const req = new Request("https://app.example/api/upload-photo", {
      headers: {
        host: "app.example",
        referer: `https://evil.example/report/${REPORT_ID}?token=stolen`,
      },
    });

    assert.equal(extractReportUploadAccessToken(req, emptyFormData(), REPORT_ID), "");
  });
});

describe("validateReportAccessRow", () => {
  it("denies a token-protected report when the viewer omits the token", () => {
    const gate = validateReportAccessRow(REPORT_ID, "", {
      access_token: "required-token",
      token_expires_at: null,
      user_id: "user-1",
    });

    assert.equal(gate.ok, false);
    if (!gate.ok) {
      assert.equal(gate.status, 403);
      assert.equal(gate.code, "access_denied");
    }
  });
});
