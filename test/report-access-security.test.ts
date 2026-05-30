/**
 * Security regression tests for tokenized report access.
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { validateReportAccessRow } from "@/lib/assertReportAccessForApi";
import { validateReportViewerRecordAccess } from "@/lib/reportViewerServer";

describe("validateReportAccessRow", () => {
  it("rejects missing and invalid tokens when a report stores an access token", () => {
    const row = {
      access_token: "secret-token",
      token_expires_at: new Date(Date.now() + 60_000).toISOString(),
    };

    const missing = validateReportAccessRow("report-1", "", row);
    assert.equal(missing.ok, false);
    if (!missing.ok) assert.equal(missing.status, 403);

    const invalid = validateReportAccessRow("report-1", "wrong-token", row);
    assert.equal(invalid.ok, false);
    if (!invalid.ok) assert.equal(invalid.status, 403);
  });

  it("accepts matching tokens and public legacy reports", () => {
    assert.equal(
      validateReportAccessRow("report-1", " secret-token ", {
        access_token: "secret-token",
        token_expires_at: new Date(Date.now() + 60_000).toISOString(),
      }).ok,
      true,
    );
    assert.equal(validateReportAccessRow("report-2", "", { access_token: null }).ok, true);
  });

  it("rejects expired tokens", () => {
    const result = validateReportAccessRow("report-1", "secret-token", {
      access_token: "secret-token",
      token_expires_at: new Date(Date.now() - 60_000).toISOString(),
    });

    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.equal(result.status, 403);
      assert.equal(result.code, "access_denied");
    }
  });
});

describe("validateReportViewerRecordAccess", () => {
  it("returns an access-denied viewer payload when tokenized reports are opened without the token", () => {
    const denied = validateReportViewerRecordAccess("report-1", undefined, {
      access_token: "secret-token",
      token_expires_at: new Date(Date.now() + 60_000).toISOString(),
    });

    assert.ok(denied);
    assert.equal(denied.accessDenied, true);
    assert.equal(denied.payload, null);
    assert.equal(denied.hasPdf, false);
  });

  it("allows the viewer when the token matches", () => {
    const denied = validateReportViewerRecordAccess("report-1", "secret-token", {
      access_token: "secret-token",
      token_expires_at: new Date(Date.now() + 60_000).toISOString(),
    });

    assert.equal(denied, null);
  });
});
