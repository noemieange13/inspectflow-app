import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { describe, it } from "node:test";

import { POST as createReportPost } from "@/app/api/create-report/route";
import { POST as inspectionAgentPost } from "@/app/api/inspection-agent/route";
import { POST as triggerInspectionPost } from "@/app/api/trigger-inspection/route";

function spoofedSameOriginRequest(path: string, body: Record<string, unknown>) {
  return new Request(`https://inspectflow.test${path}`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      host: "inspectflow.test",
      origin: "https://inspectflow.test",
      referer: "https://inspectflow.test/report/demo",
    },
    body: JSON.stringify(body),
  });
}

async function expectUnauthorized(res: Response, key: "success" | "ok") {
  assert.equal(res.status, 401);
  const json = await res.json() as Record<string, unknown>;
  assert.equal(json[key], false);
  assert.equal(json.error, "Unauthorized");
}

describe("trigger-secret protected API routes", () => {
  const previousSecret = process.env.TRIGGER_INSPECTION_SECRET;

  it("rejects spoofed same-origin create-report calls without the exact secret", async () => {
    process.env.TRIGGER_INSPECTION_SECRET = "expected-secret";
    try {
      const res = await createReportPost(
        spoofedSameOriginRequest("/api/create-report", {
          user_id: "11111111-1111-4111-8111-111111111111",
          inspection_id: "22222222-2222-4222-8222-222222222222",
        }),
      );
      await expectUnauthorized(res, "success");
    } finally {
      if (previousSecret == null) {
        delete process.env.TRIGGER_INSPECTION_SECRET;
      } else {
        process.env.TRIGGER_INSPECTION_SECRET = previousSecret;
      }
    }
  });

  it("rejects spoofed same-origin trigger-inspection calls without the exact secret", async () => {
    process.env.TRIGGER_INSPECTION_SECRET = "expected-secret";
    try {
      const res = await triggerInspectionPost(
        spoofedSameOriginRequest("/api/trigger-inspection", {
          report_id: "33333333-3333-4333-8333-333333333333",
        }),
      );
      await expectUnauthorized(res, "success");
    } finally {
      if (previousSecret == null) {
        delete process.env.TRIGGER_INSPECTION_SECRET;
      } else {
        process.env.TRIGGER_INSPECTION_SECRET = previousSecret;
      }
    }
  });

  it("rejects spoofed same-origin inspection-agent calls without the exact secret", async () => {
    process.env.TRIGGER_INSPECTION_SECRET = "expected-secret";
    try {
      const res = await inspectionAgentPost(
        spoofedSameOriginRequest("/api/inspection-agent", {
          report_id: "44444444-4444-4444-8444-444444444444",
        }),
      );
      await expectUnauthorized(res, "ok");
    } finally {
      if (previousSecret == null) {
        delete process.env.TRIGGER_INSPECTION_SECRET;
      } else {
        process.env.TRIGGER_INSPECTION_SECRET = previousSecret;
      }
    }
  });
});

describe("source guardrails for service-role and photo-link integrity", () => {
  it("keeps create-report Edge calls service-role-only and validates explicit photo ownership", async () => {
    const source = await readFile(
      new URL("../supabase/functions/create-report/index.ts", import.meta.url),
      "utf8",
    );

    assert.match(source, /requestHasServiceRoleSecret\(req, SERVICE_ROLE\)/);
    assert.match(source, /authorization/);
    assert.match(source, /apikey/);
    assert.match(source, /photo_id does not belong to inspection_id/);
    assert.match(source, /photo_id not found/);
    assert.doesNotMatch(
      source,
      /photoId = explicit \? await resolvePhotoId\(supabase, explicit\) : null/,
    );
  });

  it("keeps upload-photo behind report access and prevents foreign inspection writes", async () => {
    const source = await readFile(
      new URL("../app/api/upload-photo/route.ts", import.meta.url),
      "utf8",
    );

    assert.match(source, /assertReportAccessWithOptionalSession/);
    assert.match(source, /access_token, token_expires_at/);
    assert.match(source, /inspection_id does not match report\.inspection_id/);
    assert.match(source, /\.is\("photo_id", null\)/);
    assert.doesNotMatch(source, /\.update\(\{ photo_id: pid \}\)\.eq\("id", rid\);/);
  });

  it("prevents cross-inspection report and job photos from driving PDF AI input", async () => {
    const source = await readFile(
      new URL("../supabase/functions/reports-pdf/index.ts", import.meta.url),
      "utf8",
    );

    assert.match(source, /ai_report_photo_id_inspection_mismatch/);
    assert.match(source, /ai_job_photo_id_inspection_mismatch/);
    assert.match(source, /String\(row\.inspection_id\) === inspectionId/);
  });
});

