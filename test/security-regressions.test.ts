/**
 * Focused high-severity regressions: viewer-token gates, trigger-secret bypass,
 * and finalized-report unlocks. These tests are intentionally narrow and avoid
 * live Supabase calls.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";

import { validateReportAccessRow } from "@/lib/assertReportAccessForApi";
import { assertReportMutationAccess } from "@/lib/reportMutationAccess";
import { allowReportPayloadUnlock } from "@/lib/reportPayloadUnlock";
import {
  hasExactTriggerSecret,
  rejectConfiguredTriggerSecretMismatch,
} from "@/lib/triggerSecretAuth";

const ROOT = process.cwd();
const mutableEnv = process.env as Record<string, string | undefined>;

function readWorkspaceFile(path: string): string {
  return readFileSync(join(ROOT, path), "utf8");
}

describe("report viewer token gate", () => {
  it("denies protected reports when token is missing, fake, or expired", () => {
    const row = {
      access_token: "db-token",
      token_expires_at: new Date(Date.now() + 60_000).toISOString(),
    };

    assert.equal(validateReportAccessRow("r1", "", row).ok, false);
    assert.equal(validateReportAccessRow("r1", "fake", row).ok, false);

    const expired = {
      access_token: "db-token",
      token_expires_at: new Date(Date.now() - 60_000).toISOString(),
    };
    assert.deepEqual(validateReportAccessRow("r1", "db-token", expired), {
      ok: false,
      status: 403,
      error: "Access token expired",
      code: "access_denied",
    });

    assert.deepEqual(validateReportAccessRow("r1", "db-token", row), {
      ok: true,
      userId: null,
    });
  });
});

describe("mutation access", () => {
  it("does not let tokenless legacy rows be mutated without owner auth", async () => {
    const oldUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const oldAnon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    delete process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    try {
      const result = await assertReportMutationAccess(
        new Request("https://app.example/api/upload-photo"),
        "report-id",
        "",
        { access_token: "", user_id: "owner-id" },
      );
      assert.deepEqual(result, {
        ok: false,
        status: 403,
        error: "Report owner authorization required",
        code: "access_denied",
      });
    } finally {
      if (oldUrl === undefined) delete process.env.NEXT_PUBLIC_SUPABASE_URL;
      else process.env.NEXT_PUBLIC_SUPABASE_URL = oldUrl;
      if (oldAnon === undefined) delete process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
      else process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = oldAnon;
    }
  });
});

describe("trigger secret auth", () => {
  it("requires exact x-trigger-secret and ignores spoofable same-origin headers", () => {
    const old = process.env.TRIGGER_INSPECTION_SECRET;
    process.env.TRIGGER_INSPECTION_SECRET = "expected";
    try {
      const sameOriginFake = new Request("https://app.example/api/trigger-inspection", {
        headers: {
          host: "app.example",
          origin: "https://app.example",
          "x-trigger-secret": "wrong",
        },
      });
      assert.equal(hasExactTriggerSecret(sameOriginFake), false);
      assert.equal(
        rejectConfiguredTriggerSecretMismatch(sameOriginFake)?.status,
        401,
      );

      const exact = new Request("https://app.example/api/trigger-inspection", {
        headers: { "x-trigger-secret": "expected" },
      });
      assert.equal(hasExactTriggerSecret(exact), true);
      assert.equal(rejectConfiguredTriggerSecretMismatch(exact), null);
    } finally {
      if (old === undefined) delete process.env.TRIGGER_INSPECTION_SECRET;
      else process.env.TRIGGER_INSPECTION_SECRET = old;
    }
  });
});

describe("report payload unlock policy", () => {
  it("does not default to unlocking in production outside Vercel", () => {
    const oldNodeEnv = process.env.NODE_ENV;
    const oldUnlock = process.env.INSPECTFLOW_DEV_UNLOCK_REPORT;
    const oldVercel = process.env.VERCEL;
    mutableEnv.NODE_ENV = "production";
    delete process.env.INSPECTFLOW_DEV_UNLOCK_REPORT;
    delete process.env.VERCEL;
    try {
      assert.equal(
        allowReportPayloadUnlock(new Request("https://app.example/api/report-content")),
        false,
      );
    } finally {
      if (oldNodeEnv === undefined) delete mutableEnv.NODE_ENV;
      else mutableEnv.NODE_ENV = oldNodeEnv;
      if (oldUnlock === undefined) delete process.env.INSPECTFLOW_DEV_UNLOCK_REPORT;
      else process.env.INSPECTFLOW_DEV_UNLOCK_REPORT = oldUnlock;
      if (oldVercel === undefined) delete process.env.VERCEL;
      else process.env.VERCEL = oldVercel;
    }
  });
});

describe("critical route source guards", () => {
  it("does not reintroduce recurring bypass patterns", () => {
    const files = [
      "app/api/report-content/route.ts",
      "app/api/report-cover/route.ts",
      "app/api/report-versions/restore/route.ts",
      "app/api/cover-condition-synthesize/route.ts",
      "app/api/trigger-inspection/route.ts",
      "app/api/inspection-agent/route.ts",
      "app/api/report-versions/list/route.ts",
    ];
    const combined = files.map(readWorkspaceFile).join("\n");

    assert.doesNotMatch(combined, /Boolean\(dbToken\)/);
    assert.doesNotMatch(combined, /isSameOrigin/);
    assert.doesNotMatch(combined, /127\.0\.0\.1:7484/);
    assert.doesNotMatch(readWorkspaceFile("app/api/report-versions/list/route.ts"), /\.select\("\*"\)/);
  });
});
