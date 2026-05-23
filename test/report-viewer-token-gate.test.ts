import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { assertViewerTokenRecordAccess } from "@/lib/reportViewerTokenGate";

describe("assertViewerTokenRecordAccess", () => {
  it("allows legacy reports without a stored access token", () => {
    assert.deepEqual(assertViewerTokenRecordAccess({}, undefined), { ok: true });
  });

  it("denies token-protected reports when the viewer token is missing", () => {
    const result = assertViewerTokenRecordAccess({ access_token: "secret" }, undefined);

    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.equal(result.status, 403);
      assert.equal(result.body.code, "access_denied");
    }
  });

  it("denies token-protected reports when the viewer token is wrong", () => {
    const result = assertViewerTokenRecordAccess({ access_token: "secret" }, "other");

    assert.equal(result.ok, false);
  });

  it("allows matching viewer tokens after normalizing URL encoding and case", () => {
    assert.deepEqual(
      assertViewerTokenRecordAccess({ access_token: "ABC 123" }, "abc%20123"),
      { ok: true },
    );
  });

  it("denies expired viewer tokens", () => {
    const result = assertViewerTokenRecordAccess(
      { access_token: "secret", token_expires_at: "2000-01-01T00:00:00.000Z" },
      "secret",
    );

    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.equal(result.body.error, "Access token expired");
    }
  });
});
