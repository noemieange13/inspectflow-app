import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { validateReportAccessRow } from "@/lib/assertReportAccessForApi";

const REPORT_ID = "report-123";

describe("validateReportAccessRow", () => {
  it("denies tokenized reports when the viewer token is missing", () => {
    const gate = validateReportAccessRow(REPORT_ID, "", {
      access_token: "secret-token",
      token_expires_at: null,
    });

    assert.equal(gate.ok, false);
    if (!gate.ok) {
      assert.equal(gate.status, 403);
      assert.equal(gate.code, "access_denied");
    }
  });

  it("denies tokenized reports when the viewer token is wrong", () => {
    const gate = validateReportAccessRow(REPORT_ID, "not-the-token", {
      access_token: "secret-token",
      token_expires_at: null,
    });

    assert.equal(gate.ok, false);
  });

  it("accepts normalized matching viewer tokens", () => {
    const gate = validateReportAccessRow(REPORT_ID, " SECRET%2DTOKEN ", {
      access_token: "secret-token",
      token_expires_at: null,
      user_id: "user-1",
    });

    assert.equal(gate.ok, true);
    if (gate.ok) {
      assert.equal(gate.userId, "user-1");
    }
  });

  it("denies expired tokenized reports even when the token matches", () => {
    const gate = validateReportAccessRow(REPORT_ID, "secret-token", {
      access_token: "secret-token",
      token_expires_at: "2020-01-01T00:00:00.000Z",
    });

    assert.equal(gate.ok, false);
    if (!gate.ok) {
      assert.equal(gate.status, 403);
      assert.equal(gate.error, "Access token expired");
    }
  });

  it("preserves legacy access for reports without a stored token", () => {
    const gate = validateReportAccessRow(REPORT_ID, "", {
      access_token: null,
      token_expires_at: null,
    });

    assert.equal(gate.ok, true);
  });
});
