import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { validateReportAccessRow } from "@/lib/assertReportAccessForApi";

describe("report access token gate", () => {
  it("denies tokenized reports when the viewer token is missing", () => {
    const result = validateReportAccessRow("report-1", "", {
      access_token: "secret-token",
    });

    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.equal(result.status, 403);
      assert.equal(result.code, "access_denied");
    }
  });

  it("denies tokenized reports when the viewer token is wrong", () => {
    const result = validateReportAccessRow("report-1", "wrong-token", {
      access_token: "secret-token",
    });

    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.equal(result.status, 403);
      assert.equal(result.code, "access_denied");
    }
  });

  it("denies tokenized reports when the viewer token is expired", () => {
    const result = validateReportAccessRow("report-1", "secret-token", {
      access_token: "secret-token",
      token_expires_at: "2020-01-01T00:00:00.000Z",
    });

    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.equal(result.status, 403);
      assert.equal(result.code, "access_denied");
    }
  });

  it("allows matching tokens and normalizes URL-encoded input", () => {
    const result = validateReportAccessRow("report-1", "Secret%20Token", {
      access_token: "secret token",
      user_id: "owner-1",
    });

    assert.deepEqual(result, { ok: true, userId: "owner-1" });
  });

  it("preserves legacy access for reports without a stored token", () => {
    const result = validateReportAccessRow("report-1", "", {
      access_token: "",
    });

    assert.deepEqual(result, { ok: true, userId: null });
  });
});
