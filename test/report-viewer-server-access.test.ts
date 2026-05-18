import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { validateReportViewerAccessRow } from "@/lib/reportViewerServer";

describe("validateReportViewerAccessRow", () => {
  it("keeps legacy reports without an access token viewable", () => {
    assert.deepEqual(validateReportViewerAccessRow({}, undefined), { ok: true });
  });

  it("denies token-protected reports when the viewer token is missing", () => {
    assert.deepEqual(
      validateReportViewerAccessRow({ access_token: "abc123" }, undefined),
      { ok: false },
    );
  });

  it("denies token-protected reports when the viewer token is wrong", () => {
    assert.deepEqual(
      validateReportViewerAccessRow({ access_token: "abc123" }, "wrong"),
      { ok: false },
    );
  });

  it("accepts a matching viewer token", () => {
    assert.deepEqual(
      validateReportViewerAccessRow({ access_token: "abc123" }, "abc123"),
      { ok: true },
    );
  });

  it("denies expired viewer tokens even when the token value matches", () => {
    assert.deepEqual(
      validateReportViewerAccessRow(
        { access_token: "abc123", token_expires_at: "2000-01-01T00:00:00.000Z" },
        "abc123",
      ),
      { ok: false },
    );
  });
});
