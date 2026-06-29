import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";

import {
  validateReportAccessRow,
  validateReportTokenAccessRow,
} from "@/lib/assertReportAccessForApi";
import { hasExactTriggerSecret } from "@/lib/triggerSecretAuth";

const originalTriggerSecret = process.env.TRIGGER_INSPECTION_SECRET;

afterEach(() => {
  if (originalTriggerSecret == null) {
    delete process.env.TRIGGER_INSPECTION_SECRET;
  } else {
    process.env.TRIGGER_INSPECTION_SECRET = originalTriggerSecret;
  }
});

describe("report viewer token enforcement", () => {
  it("denies protected reports when the viewer token is missing or fake", () => {
    const row = {
      access_token: "real-token",
      token_expires_at: new Date(Date.now() + 60_000).toISOString(),
      user_id: "user-1",
    };

    assert.deepEqual(validateReportAccessRow("report-1", "", row), {
      ok: false,
      status: 403,
      error: "Invalid access token",
      code: "access_denied",
    });
    assert.deepEqual(validateReportAccessRow("report-1", "fake", row), {
      ok: false,
      status: 403,
      error: "Invalid access token",
      code: "access_denied",
    });
    assert.deepEqual(validateReportAccessRow("report-1", "real-token", row), {
      ok: true,
      userId: "user-1",
    });
  });

  it("denies expired report tokens", () => {
    const row = {
      access_token: "real-token",
      token_expires_at: new Date(Date.now() - 60_000).toISOString(),
      user_id: "user-1",
    };

    assert.deepEqual(validateReportAccessRow("report-1", "real-token", row), {
      ok: false,
      status: 403,
      error: "Access token expired",
      code: "access_denied",
    });
  });
});

describe("strict service-route report access", () => {
  it("does not treat tokenless legacy reports as authorized for mutation routes", () => {
    const row = {
      access_token: null,
      token_expires_at: null,
      user_id: "user-1",
    };

    assert.deepEqual(validateReportTokenAccessRow("report-1", "anything", row), {
      ok: false,
      status: 403,
      error: "Report access token required",
      code: "access_token_required",
    });
  });
});

describe("trigger secret auth", () => {
  it("requires the exact x-trigger-secret and ignores spoofable same-origin headers", () => {
    process.env.TRIGGER_INSPECTION_SECRET = "server-secret";

    const spoofedSameOrigin = new Request("https://app.example.test/api/trigger-inspection", {
      method: "POST",
      headers: {
        host: "app.example.test",
        origin: "https://app.example.test",
        referer: "https://app.example.test/report/r1",
      },
    });
    assert.equal(hasExactTriggerSecret(spoofedSameOrigin), false);

    const exact = new Request("https://app.example.test/api/trigger-inspection", {
      method: "POST",
      headers: {
        "x-trigger-secret": "server-secret",
        origin: "https://evil.example",
      },
    });
    assert.equal(hasExactTriggerSecret(exact), true);
  });
});
