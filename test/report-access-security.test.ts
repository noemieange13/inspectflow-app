import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";

import { validateReportAccessRow } from "@/lib/assertReportAccessForApi";
import { validatePrivilegedReportActionAccess } from "@/lib/reportActionAccess";
import { validateTriggerSecretHeader } from "@/lib/triggerSecretAuth";

const ORIGINAL_TRIGGER_SECRET = process.env.TRIGGER_INSPECTION_SECRET;

afterEach(() => {
  if (ORIGINAL_TRIGGER_SECRET === undefined) {
    delete process.env.TRIGGER_INSPECTION_SECRET;
  } else {
    process.env.TRIGGER_INSPECTION_SECRET = ORIGINAL_TRIGGER_SECRET;
  }
});

describe("report viewer token gate", () => {
  it("denies token-protected reports when the viewer token is missing", () => {
    const result = validateReportAccessRow("report-1", "", {
      access_token: "viewer-token",
      token_expires_at: "2999-01-01T00:00:00.000Z",
      user_id: "user-1",
    });

    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.equal(result.status, 403);
      assert.equal(result.code, "access_denied");
    }
  });

  it("allows token-protected reports only with the matching non-expired token", () => {
    const result = validateReportAccessRow("report-1", "VIEWER-TOKEN", {
      access_token: "viewer-token",
      token_expires_at: "2999-01-01T00:00:00.000Z",
      user_id: "user-1",
    });

    assert.deepEqual(result, { ok: true, userId: "user-1" });
  });
});

describe("privileged report action gate", () => {
  it("requires an owner session for tokenless legacy rows", () => {
    const result = validatePrivilegedReportActionAccess(
      "report-1",
      "",
      { access_token: "", user_id: "user-1" },
      false,
    );

    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.equal(result.status, 403);
      assert.equal(result.code, "access_denied");
    }
  });

  it("allows tokenized rows with the matching report token", () => {
    const result = validatePrivilegedReportActionAccess(
      "report-1",
      "viewer-token",
      {
        access_token: "viewer-token",
        token_expires_at: "2999-01-01T00:00:00.000Z",
        user_id: "user-1",
      },
      false,
    );

    assert.deepEqual(result, { ok: true, userId: "user-1" });
  });

  it("allows tokenless rows when the owner session was verified", () => {
    const result = validatePrivilegedReportActionAccess(
      "report-1",
      "",
      { access_token: "", user_id: "user-1" },
      true,
    );

    assert.deepEqual(result, { ok: true, userId: "user-1" });
  });
});

describe("trigger secret gate", () => {
  it("does not treat same-origin headers as credentials", () => {
    process.env.TRIGGER_INSPECTION_SECRET = "server-secret";
    const req = new Request("https://inspectflow.test/api/trigger-inspection", {
      method: "POST",
      headers: {
        host: "inspectflow.test",
        origin: "https://inspectflow.test",
        referer: "https://inspectflow.test/report/report-1",
      },
    });

    assert.equal(validateTriggerSecretHeader(req), false);
  });

  it("allows the exact configured trigger secret header", () => {
    process.env.TRIGGER_INSPECTION_SECRET = "server-secret";
    const req = new Request("https://inspectflow.test/api/trigger-inspection", {
      method: "POST",
      headers: { "x-trigger-secret": "server-secret" },
    });

    assert.equal(validateTriggerSecretHeader(req), true);
  });
});
