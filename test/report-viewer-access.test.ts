import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { validateReportViewerAccessRecord } from "@/lib/reportViewerAccess";

describe("validateReportViewerAccessRecord", () => {
  it("allows legacy reports without a stored access token", () => {
    assert.deepEqual(
      validateReportViewerAccessRecord({ access_token: "" }, undefined),
      { ok: true },
    );
  });

  it("denies token-protected reports when the viewer token is missing", () => {
    const gate = validateReportViewerAccessRecord(
      { access_token: "secret-token" },
      undefined,
    );

    assert.equal(gate.ok, false);
    if (!gate.ok) {
      assert.equal(gate.status, 403);
      assert.equal(gate.body.code, "access_denied");
    }
  });

  it("denies expired tokens even when the token value matches", () => {
    const gate = validateReportViewerAccessRecord(
      {
        access_token: "secret-token",
        token_expires_at: "2000-01-01T00:00:00.000Z",
      },
      "secret-token",
    );

    assert.equal(gate.ok, false);
    if (!gate.ok) {
      assert.equal(gate.status, 403);
      assert.equal(gate.body.code, "access_denied");
    }
  });

  it("allows a matching non-expired viewer token", () => {
    assert.deepEqual(
      validateReportViewerAccessRecord(
        {
          access_token: "Secret%20Token",
          token_expires_at: "2999-01-01T00:00:00.000Z",
        },
        "secret token",
      ),
      { ok: true },
    );
  });
});
