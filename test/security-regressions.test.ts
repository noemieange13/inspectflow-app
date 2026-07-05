import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

import { validateReportAccessRow } from "@/lib/assertReportAccessForApi";
import {
  assertExactTriggerSecret,
  hasExactTriggerSecret,
} from "@/lib/triggerSecretAuth";

function read(path: string): string {
  return readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
}

describe("report viewer token gate", () => {
  const protectedRow = {
    access_token: "db-token",
    token_expires_at: null,
    user_id: "user-1",
  };

  it("denies missing or fake tokens when reports.access_token is set", () => {
    assert.deepEqual(validateReportAccessRow("report-1", "", protectedRow), {
      ok: false,
      status: 403,
      error: "Invalid access token",
      code: "access_denied",
    });
    assert.deepEqual(validateReportAccessRow("report-1", "fake", protectedRow), {
      ok: false,
      status: 403,
      error: "Invalid access token",
      code: "access_denied",
    });
  });

  it("allows the exact viewer token", () => {
    assert.equal(
      validateReportAccessRow("report-1", "db-token", protectedRow).ok,
      true,
    );
  });
});

describe("trigger secret auth", () => {
  it("requires the exact x-trigger-secret header", () => {
    const previous = process.env.TRIGGER_INSPECTION_SECRET;
    process.env.TRIGGER_INSPECTION_SECRET = "s3cr3t";
    try {
      const sameOriginReq = new Request("https://app.example/api/create-report", {
        headers: {
          host: "app.example",
          origin: "https://app.example",
        },
      });
      assert.equal(hasExactTriggerSecret(sameOriginReq), false);
      assert.equal(assertExactTriggerSecret(sameOriginReq).status, 401);

      const exactReq = new Request("https://app.example/api/create-report", {
        headers: { "x-trigger-secret": "s3cr3t" },
      });
      assert.equal(hasExactTriggerSecret(exactReq), true);
      assert.deepEqual(assertExactTriggerSecret(exactReq), { ok: true });
    } finally {
      if (previous === undefined) {
        delete process.env.TRIGGER_INSPECTION_SECRET;
      } else {
        process.env.TRIGGER_INSPECTION_SECRET = previous;
      }
    }
  });
});

describe("static high-severity regression guards", () => {
  it("report-version listing is token-gated and metadata-only", () => {
    const source = read("app/api/report-versions/list/route.ts");
    assert.match(source, /assertReportViewerAccess/);
    assert.match(source, /listReportVersions/);
    assert.doesNotMatch(source, /\.select\("\*"\)/);
  });

  it("upload-photo authenticates before service-role writes and binds inspection_id", () => {
    const source = read("app/api/upload-photo/route.ts");
    assert.match(source, /assertReportAccessWithOptionalSession/);
    assert.match(source, /inspection_id does not match report\.inspection_id/);
    assert.match(source, /\.is\("photo_id", null\)/);
  });

  it("viewer tokens do not unlock finalized reports", () => {
    for (const path of [
      "app/api/report-content/route.ts",
      "app/api/report-cover/route.ts",
      "app/api/cover-condition-synthesize/route.ts",
      "app/api/report-versions/restore/route.ts",
    ]) {
      assert.doesNotMatch(read(path), /Boolean\(dbToken\)/, path);
    }
  });

  it("trigger routes do not trust spoofable same-origin headers", () => {
    for (const path of [
      "app/api/create-report/route.ts",
      "app/api/trigger-inspection/route.ts",
      "app/api/inspection-agent/route.ts",
    ]) {
      const source = read(path);
      assert.doesNotMatch(source, /new URL\(origin\)\.host === host/, path);
      assert.doesNotMatch(source, /new URL\(referer\)\.host === host/, path);
      assert.doesNotMatch(source, /isSameOrigin/, path);
    }
  });

  it("Edge create-report and reports-pdf scope photos to the report inspection", () => {
    assert.match(
      read("supabase/functions/create-report/index.ts"),
      /photo_id does not belong to the resolved inspection/,
    );
    const pdf = read("supabase/functions/reports-pdf/index.ts");
    assert.match(pdf, /\.eq\("inspection_id", inspectionId\)/);
  });

  it("SQL revokes claim_report_lock from authenticated users", () => {
    const sql = read("supabase/migrations/20260705110100_report_lock_security_hardening.sql");
    assert.match(sql, /revoke execute on function public\.claim_report_lock\(uuid\) from authenticated/i);
    assert.match(sql, /PDF generation in progress/);
  });
});
