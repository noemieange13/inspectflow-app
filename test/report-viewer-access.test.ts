import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { validateReportViewerAccessRow } from "@/lib/reportViewerAccess";

describe("validateReportViewerAccessRow", () => {
  it("rejects a protected report when the viewer token is missing", () => {
    const access = validateReportViewerAccessRow(
      { access_token: "abc123", token_expires_at: null },
      undefined,
    );

    assert.equal(access.ok, false);
    if (!access.ok) {
      assert.equal(access.status, 403);
      assert.equal(access.body.code, "access_denied");
    }
  });

  it("accepts a matching protected report token", () => {
    const access = validateReportViewerAccessRow(
      { access_token: "abc123", token_expires_at: "2999-01-01T00:00:00.000Z" },
      " ABC123 ",
      { now: new Date("2026-01-01T00:00:00.000Z") },
    );

    assert.equal(access.ok, true);
  });

  it("rejects expired protected report tokens", () => {
    const access = validateReportViewerAccessRow(
      { access_token: "abc123", token_expires_at: "2025-01-01T00:00:00.000Z" },
      "abc123",
      { now: new Date("2026-01-01T00:00:00.000Z") },
    );

    assert.equal(access.ok, false);
    if (!access.ok) {
      assert.equal(access.status, 403);
      assert.equal(access.body.code, "access_denied");
    }
  });

  it("keeps legacy no-token reports open only when the caller allows it", () => {
    assert.equal(validateReportViewerAccessRow({}, null).ok, true);

    const access = validateReportViewerAccessRow({}, null, {
      allowLegacyWithoutToken: false,
    });

    assert.equal(access.ok, false);
    if (!access.ok) {
      assert.equal(access.status, 401);
      assert.equal(access.body.code, "admin_auth_required");
    }
  });
});
