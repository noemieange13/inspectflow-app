import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { validateReportViewerAccessRecord } from "@/lib/reportViewerAccess";

describe("report viewer token validation", () => {
  it("denies tokenized reports when the viewer token is missing", () => {
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

  it("denies tokenized reports when an arbitrary token is supplied", () => {
    const result = validateReportViewerAccessRecord(
      { access_token: "secret-token", token_expires_at: null },
      "anything",
    );

    assert.equal(result.ok, false);
  });

  it("allows matching encoded tokens and rejects expired tokens", () => {
    const ok = validateReportViewerAccessRecord(
      { access_token: "abc 123", token_expires_at: null },
      "abc%20123",
    );
    assert.equal(ok.ok, true);

    const expired = validateReportViewerAccessRecord(
      { access_token: "abc", token_expires_at: "2000-01-01T00:00:00.000Z" },
      "abc",
    );
    assert.equal(expired.ok, false);
    if (!expired.ok) {
      assert.equal(expired.status, 403);
      assert.equal(expired.body.code, "access_denied");
    }
  });

  it("keeps legacy reports without a stored token accessible", () => {
    const result = validateReportViewerAccessRecord(
      { access_token: "", token_expires_at: null },
      "",
    );

    assert.equal(result.ok, true);
  });
});
