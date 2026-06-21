import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { validateReportAccessRow } from "@/lib/assertReportAccessForApi";
import { requireTriggerSecret } from "@/lib/triggerSecretAuth";

describe("report access tokens", () => {
  it("denies a tokenized report when the viewer token is missing", () => {
    const result = validateReportAccessRow("report-1", "", {
      access_token: "shared-secret-token",
      token_expires_at: null,
    });

    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.equal(result.status, 403);
      assert.equal(result.code, "access_denied");
    }
  });

  it("denies a tokenized report when the viewer token is wrong", () => {
    const result = validateReportAccessRow("report-1", "wrong-token", {
      access_token: "shared-secret-token",
      token_expires_at: null,
    });

    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.equal(result.status, 403);
    }
  });

  it("accepts a matching viewer token", () => {
    const result = validateReportAccessRow("report-1", " Shared-Secret-Token ", {
      access_token: "shared-secret-token",
      token_expires_at: null,
    });

    assert.equal(result.ok, true);
  });

  it("denies an expired matching viewer token", () => {
    const result = validateReportAccessRow("report-1", "shared-secret-token", {
      access_token: "shared-secret-token",
      token_expires_at: "2000-01-01T00:00:00.000Z",
    });

    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.equal(result.status, 403);
    }
  });
});

describe("trigger secret authorization", () => {
  const previousSecret = process.env.TRIGGER_INSPECTION_SECRET;

  function withSecret<T>(secret: string | undefined, fn: () => T): T {
    if (secret == null) {
      delete process.env.TRIGGER_INSPECTION_SECRET;
    } else {
      process.env.TRIGGER_INSPECTION_SECRET = secret;
    }
    try {
      return fn();
    } finally {
      if (previousSecret == null) {
        delete process.env.TRIGGER_INSPECTION_SECRET;
      } else {
        process.env.TRIGGER_INSPECTION_SECRET = previousSecret;
      }
    }
  }

  it("allows requests when no trigger secret is configured", () => {
    const result = withSecret(undefined, () =>
      requireTriggerSecret(new Request("https://app.example/api/trigger-inspection")),
    );

    assert.equal(result.ok, true);
  });

  it("does not treat same-origin metadata as credentials", () => {
    const req = new Request("https://app.example/api/trigger-inspection", {
      headers: {
        host: "app.example",
        origin: "https://app.example",
        referer: "https://app.example/report/report-1?token=t",
      },
    });

    const result = withSecret("expected-secret", () => requireTriggerSecret(req));

    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.equal(result.status, 401);
    }
  });

  it("allows only the exact x-trigger-secret value when configured", () => {
    const wrong = withSecret("expected-secret", () =>
      requireTriggerSecret(
        new Request("https://app.example/api/trigger-inspection", {
          headers: { "x-trigger-secret": "wrong-secret" },
        }),
      ),
    );
    const correct = withSecret("expected-secret", () =>
      requireTriggerSecret(
        new Request("https://app.example/api/trigger-inspection", {
          headers: { "x-trigger-secret": "expected-secret" },
        }),
      ),
    );

    assert.equal(wrong.ok, false);
    assert.equal(correct.ok, true);
  });
});
