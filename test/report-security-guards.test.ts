import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";

import { validateReportAccessRow } from "@/lib/assertReportAccessForApi";
import { allowReportPayloadUnlock } from "@/lib/reportPayloadUnlock";
import { hasValidTriggerSecret } from "@/lib/triggerRouteAuth";
import { resolveUploadInspectionId } from "@/lib/uploadPhotoInspectionBinding";

const root = process.cwd();

describe("report viewer/API access guards", () => {
  it("denies tokenized reports when the viewer token is missing, invalid, or expired", () => {
    const row = {
      access_token: "abc123",
      token_expires_at: new Date(Date.now() + 60_000).toISOString(),
      user_id: "user-1",
    };

    assert.equal(validateReportAccessRow("r1", "", row).ok, false);
    assert.equal(validateReportAccessRow("r1", "wrong", row).ok, false);
    assert.deepEqual(validateReportAccessRow("r1", "ABC123", row), {
      ok: true,
      userId: "user-1",
    });

    const expired = {
      ...row,
      token_expires_at: new Date(Date.now() - 60_000).toISOString(),
    };
    assert.equal(validateReportAccessRow("r1", "abc123", expired).ok, false);
  });

  it("keeps historical access for report rows that do not define a viewer token", () => {
    assert.deepEqual(
      validateReportAccessRow("legacy", "", { access_token: "", user_id: null }),
      { ok: true, userId: null },
    );
  });
});

describe("trigger secret guard", () => {
  it("does not treat spoofable Origin/Referer headers as authorization", () => {
    const spoofed = new Request("https://inspectflow.example/api/trigger-inspection", {
      method: "POST",
      headers: {
        host: "inspectflow.example",
        origin: "https://inspectflow.example",
        referer: "https://inspectflow.example/report/id",
      },
    });

    assert.equal(hasValidTriggerSecret(spoofed, "server-secret"), false);
  });

  it("accepts only the configured x-trigger-secret value", () => {
    const ok = new Request("https://inspectflow.example/api/trigger-inspection", {
      method: "POST",
      headers: { "x-trigger-secret": "server-secret" },
    });
    const wrong = new Request("https://inspectflow.example/api/trigger-inspection", {
      method: "POST",
      headers: { "x-trigger-secret": "not-it" },
    });

    assert.equal(hasValidTriggerSecret(ok, "server-secret"), true);
    assert.equal(hasValidTriggerSecret(wrong, "server-secret"), false);
  });
});

describe("upload-photo inspection binding", () => {
  it("binds photo writes to the report inspection and rejects mismatched form overrides", () => {
    assert.deepEqual(resolveUploadInspectionId("inspection-a", ""), {
      ok: true,
      inspectionId: "inspection-a",
    });
    assert.deepEqual(resolveUploadInspectionId("inspection-a", "inspection-a"), {
      ok: true,
      inspectionId: "inspection-a",
    });
    assert.deepEqual(resolveUploadInspectionId("inspection-a", "inspection-b"), {
      ok: false,
      error: "inspection_id does not match the report",
    });
  });

  it("preserves explicit inspection_id only for legacy reports without one", () => {
    assert.deepEqual(resolveUploadInspectionId(null, "inspection-b"), {
      ok: true,
      inspectionId: "inspection-b",
    });
  });
});

describe("locked report writes", () => {
  it("does not allow production unlocks without the explicit dev/local unlock guard", () => {
    const oldVercel = process.env.VERCEL;
    const oldNodeEnv = process.env.NODE_ENV;
    const oldUnlock = process.env.INSPECTFLOW_DEV_UNLOCK_REPORT;
    try {
      process.env.VERCEL = "1";
      process.env.NODE_ENV = "production";
      process.env.INSPECTFLOW_DEV_UNLOCK_REPORT = "0";

      const req = new Request("https://inspectflow.example/api/report-content", {
        headers: {
          host: "inspectflow.example",
          "x-forwarded-host": "inspectflow.example",
        },
      });

      assert.equal(allowReportPayloadUnlock(req), false);
    } finally {
      if (oldVercel === undefined) delete process.env.VERCEL;
      else process.env.VERCEL = oldVercel;
      if (oldNodeEnv === undefined) delete process.env.NODE_ENV;
      else process.env.NODE_ENV = oldNodeEnv;
      if (oldUnlock === undefined) delete process.env.INSPECTFLOW_DEV_UNLOCK_REPORT;
      else process.env.INSPECTFLOW_DEV_UNLOCK_REPORT = oldUnlock;
    }
  });

  it("does not reintroduce token-based unlock escalation in write routes", () => {
    const routes = [
      "app/api/report-content/route.ts",
      "app/api/report-cover/route.ts",
      "app/api/report-versions/restore/route.ts",
      "app/api/cover-condition-synthesize/route.ts",
    ];
    for (const route of routes) {
      const source = readFileSync(join(root, route), "utf8");
      assert.doesNotMatch(source, /Boolean\(dbToken\)/, route);
    }
  });
});

describe("service-role route sources", () => {
  it("do not authorize machine endpoints from Origin or Referer", () => {
    const routes = [
      "app/api/create-report/route.ts",
      "app/api/inspection-agent/route.ts",
      "app/api/trigger-inspection/route.ts",
    ];
    for (const route of routes) {
      const source = readFileSync(join(root, route), "utf8");
      assert.doesNotMatch(source, /isSameOrigin/, route);
      assert.doesNotMatch(source, /req\.headers\.get\("(origin|referer)"\)/, route);
    }
  });
});
