import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { validateReportViewerAccessRecord } from "@/lib/reportViewerAccess";

describe("validateReportViewerAccessRecord", () => {
  it("refuses a tokenized report when the viewer token is missing", () => {
    const result = validateReportViewerAccessRecord(
      { access_token: "secret-token", token_expires_at: null },
      "",
    );

    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.equal(result.status, 403);
      assert.equal(result.body.code, "access_denied");
    }
  });

  it("refuses a tokenized report when the viewer token is wrong", () => {
    const result = validateReportViewerAccessRecord(
      { access_token: "secret-token", token_expires_at: null },
      "wrong-token",
    );

    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.equal(result.status, 403);
      assert.equal(result.body.code, "access_denied");
    }
  });

  it("accepts a matching viewer token and marks the token as required", () => {
    const result = validateReportViewerAccessRecord(
      { access_token: "secret-token", token_expires_at: null },
      "secret-token",
    );

    assert.deepEqual(result, { ok: true, tokenRequired: true });
  });

  it("keeps legacy reports without stored tokens distinguishable", () => {
    const result = validateReportViewerAccessRecord(
      { access_token: null, token_expires_at: null },
      "anything",
    );

    assert.deepEqual(result, { ok: true, tokenRequired: false });
  });

  it("refuses expired viewer tokens", () => {
    const result = validateReportViewerAccessRecord(
      {
        access_token: "secret-token",
        token_expires_at: "2000-01-01T00:00:00.000Z",
      },
      "secret-token",
    );

    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.equal(result.status, 403);
      assert.equal(result.body.code, "access_denied");
    }
  });
});
