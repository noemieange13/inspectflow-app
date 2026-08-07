import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { evaluateReportViewerAccess } from "@/lib/reportViewerAccess";

describe("evaluateReportViewerAccess", () => {
  it("allows legacy reports that have no stored viewer token", () => {
    const access = evaluateReportViewerAccess({}, undefined);

    assert.equal(access.ok, true);
  });

  it("denies protected reports when the URL token is missing", () => {
    const access = evaluateReportViewerAccess({ access_token: "secret-token" }, undefined);

    assert.equal(access.ok, false);
    if (!access.ok) {
      assert.equal(access.status, 403);
      assert.equal(access.body.code, "access_denied");
    }
  });

  it("denies protected reports when the token does not match", () => {
    const access = evaluateReportViewerAccess({ access_token: "secret-token" }, "wrong-token");

    assert.equal(access.ok, false);
  });

  it("accepts matching viewer tokens", () => {
    const access = evaluateReportViewerAccess({ access_token: "Secret-Token" }, " secret-token ");

    assert.equal(access.ok, true);
  });

  it("denies expired viewer tokens", () => {
    const access = evaluateReportViewerAccess(
      {
        access_token: "secret-token",
        token_expires_at: "2000-01-01T00:00:00.000Z",
      },
      "secret-token",
    );

    assert.equal(access.ok, false);
    if (!access.ok) {
      assert.equal(access.status, 403);
      assert.equal(access.body.error, "Access token expired");
    }
  });
});
