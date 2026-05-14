/**
 * Regression tests for service-role route guards.
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { isTriggerSecretAuthorized } from "@/lib/triggerSecretAuth";

describe("isTriggerSecretAuthorized", () => {
  it("allows routes when no shared secret is configured", () => {
    const req = new Request("https://app.example/api/trigger-inspection", {
      method: "POST",
    });

    assert.equal(isTriggerSecretAuthorized(req, ""), true);
  });

  it("accepts the x-trigger-secret header when it matches", () => {
    const req = new Request("https://app.example/api/trigger-inspection", {
      method: "POST",
      headers: { "x-trigger-secret": "s3cr3t" },
    });

    assert.equal(isTriggerSecretAuthorized(req, "s3cr3t"), true);
  });

  it("does not trust spoofable same-origin headers", () => {
    const req = new Request("https://app.example/api/trigger-inspection", {
      method: "POST",
      headers: {
        origin: "https://app.example",
        referer: "https://app.example/report/report-id",
        host: "app.example",
      },
    });

    assert.equal(isTriggerSecretAuthorized(req, "s3cr3t"), false);
  });
});
