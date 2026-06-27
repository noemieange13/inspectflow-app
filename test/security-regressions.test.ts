import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { afterEach, describe, it } from "node:test";

import { POST as createReportPost } from "@/app/api/create-report/route";
import { POST as triggerInspectionPost } from "@/app/api/trigger-inspection/route";
import { POST as uploadPhotoPost } from "@/app/api/upload-photo/route";
import {
  hasValidTriggerSecret,
  requireExactTriggerSecret,
} from "@/lib/triggerSecretAuth";

const ORIGINAL_TRIGGER_SECRET = process.env.TRIGGER_INSPECTION_SECRET;

afterEach(() => {
  if (ORIGINAL_TRIGGER_SECRET === undefined) {
    delete process.env.TRIGGER_INSPECTION_SECRET;
  } else {
    process.env.TRIGGER_INSPECTION_SECRET = ORIGINAL_TRIGGER_SECRET;
  }
});

function sameOriginSpoofRequest(body?: unknown): Request {
  return new Request("https://inspectflow-app.vercel.app/api/test", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Host: "inspectflow-app.vercel.app",
      Origin: "https://inspectflow-app.vercel.app",
      Referer: "https://inspectflow-app.vercel.app/report/demo",
    },
    body: JSON.stringify(body ?? { report_id: "report-123" }),
  });
}

describe("trigger secret auth", () => {
  it("does not treat spoofable same-origin headers as the trigger secret", async () => {
    process.env.TRIGGER_INSPECTION_SECRET = "server-secret";
    const req = sameOriginSpoofRequest();

    assert.equal(hasValidTriggerSecret(req), false);
    assert.equal(requireExactTriggerSecret(req)?.status, 401);

    const res = await createReportPost(req);
    assert.equal(res.status, 401);
  });

  it("rejects PDF trigger calls with spoofed same-origin headers and no report credential", async () => {
    process.env.TRIGGER_INSPECTION_SECRET = "server-secret";

    const res = await triggerInspectionPost(sameOriginSpoofRequest());

    assert.equal(res.status, 401);
  });

  it("accepts the exact trigger secret header", () => {
    process.env.TRIGGER_INSPECTION_SECRET = "server-secret";
    const req = new Request("https://inspectflow-app.vercel.app/api/test", {
      method: "POST",
      headers: { "x-trigger-secret": "server-secret" },
    });

    assert.equal(hasValidTriggerSecret(req), true);
    assert.equal(requireExactTriggerSecret(req), null);
  });
});

describe("service-role write routes", () => {
  it("rejects photo uploads before service-role writes when no token or owner session is supplied", async () => {
    const form = new FormData();
    form.set("file", new Blob(["not-real-image"], { type: "image/jpeg" }), "demo.jpg");
    form.set("report_id", "00000000-0000-4000-8000-000000000001");

    const res = await uploadPhotoPost(
      new Request("https://inspectflow-app.vercel.app/api/upload-photo", {
        method: "POST",
        body: form,
      }),
    );

    assert.equal(res.status, 401);
  });

  it("does not use viewer tokens as finalized-report unlock overrides", () => {
    const routePaths = [
      "app/api/report-cover/route.ts",
      "app/api/report-content/route.ts",
      "app/api/cover-condition-synthesize/route.ts",
      "app/api/report-versions/restore/route.ts",
    ];

    for (const routePath of routePaths) {
      const text = fs.readFileSync(path.join(process.cwd(), routePath), "utf8");
      assert.doesNotMatch(
        text,
        /allowReportPayloadUnlock\(req\)\s*\|\|\s*Boolean\(dbToken\)/,
        `${routePath} must not unlock finalized reports for any valid viewer token`,
      );
    }
  });

  it("does not leave PDF trigger debug fetch instrumentation in the hot path", () => {
    const text = fs.readFileSync(
      path.join(process.cwd(), "app/api/trigger-inspection/route.ts"),
      "utf8",
    );

    assert.doesNotMatch(text, /127\.0\.0\.1:7484/);
    assert.doesNotMatch(text, /X-Debug-Session-Id/);
  });
});
