import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";

import { POST as createReportPost } from "@/app/api/create-report/route";
import { POST as inspectionAgentPost } from "@/app/api/inspection-agent/route";
import { POST as triggerInspectionPost } from "@/app/api/trigger-inspection/route";
import { hasValidTriggerSecret } from "@/lib/triggerSecretAuth";

const originalSecret = process.env.TRIGGER_INSPECTION_SECRET;

afterEach(() => {
  if (originalSecret === undefined) {
    delete process.env.TRIGGER_INSPECTION_SECRET;
  } else {
    process.env.TRIGGER_INSPECTION_SECRET = originalSecret;
  }
});

function requestWithHeaders(headers: Record<string, string>): Request {
  return new Request("https://inspectflow-app.vercel.app/api/test", {
    method: "POST",
    headers,
    body: JSON.stringify({ report_id: "report-123" }),
  });
}

function forgedSameOriginRequest(): Request {
  return requestWithHeaders({
    host: "inspectflow-app.vercel.app",
    origin: "https://inspectflow-app.vercel.app",
    referer: "https://inspectflow-app.vercel.app/report/report-123",
  });
}

describe("hasValidTriggerSecret", () => {
  it("allows requests when no trigger secret is configured", () => {
    delete process.env.TRIGGER_INSPECTION_SECRET;

    assert.equal(hasValidTriggerSecret(forgedSameOriginRequest()), true);
  });

  it("accepts the exact x-trigger-secret header when configured", () => {
    process.env.TRIGGER_INSPECTION_SECRET = "expected-secret";

    assert.equal(
      hasValidTriggerSecret(
        requestWithHeaders({ "x-trigger-secret": "expected-secret" }),
      ),
      true,
    );
  });

  it("rejects forged Origin/Referer without the exact secret", () => {
    process.env.TRIGGER_INSPECTION_SECRET = "expected-secret";

    assert.equal(hasValidTriggerSecret(forgedSameOriginRequest()), false);
    assert.equal(
      hasValidTriggerSecret(
        requestWithHeaders({
          host: "inspectflow-app.vercel.app",
          origin: "https://inspectflow-app.vercel.app",
          "x-trigger-secret": "wrong-secret",
        }),
      ),
      false,
    );
  });
});

describe("automation route trigger-secret enforcement", () => {
  it("rejects spoofed same-origin headers on create-report", async () => {
    process.env.TRIGGER_INSPECTION_SECRET = "expected-secret";

    const res = await createReportPost(forgedSameOriginRequest());

    assert.equal(res.status, 401);
    assert.deepEqual(await res.json(), {
      success: false,
      error: "Unauthorized",
    });
  });

  it("rejects spoofed same-origin headers on trigger-inspection", async () => {
    process.env.TRIGGER_INSPECTION_SECRET = "expected-secret";

    const res = await triggerInspectionPost(forgedSameOriginRequest());

    assert.equal(res.status, 401);
    assert.deepEqual(await res.json(), {
      success: false,
      error: "Unauthorized",
    });
  });

  it("rejects spoofed same-origin headers on inspection-agent", async () => {
    process.env.TRIGGER_INSPECTION_SECRET = "expected-secret";

    const res = await inspectionAgentPost(forgedSameOriginRequest());

    assert.equal(res.status, 401);
    assert.deepEqual(await res.json(), {
      ok: false,
      error: "Unauthorized",
    });
  });
});
