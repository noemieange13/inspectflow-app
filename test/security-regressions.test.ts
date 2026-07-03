import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { readFileSync } from "node:fs";

import { validateReportAccessRow } from "@/lib/assertReportAccessForApi";
import {
  photoMatchesInspection,
  resolveTrustedInspectionForReport,
} from "@/lib/reportInspectionGuard";
import { hasExactTriggerSecret } from "@/lib/triggerSecretAuth";

describe("report access token gates", () => {
  it("denies protected reports when the viewer token is missing", () => {
    const result = validateReportAccessRow("report-1", "", {
      access_token: "expected-token",
      token_expires_at: new Date(Date.now() + 60_000).toISOString(),
    });

    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.equal(result.status, 403);
      assert.equal(result.code, "access_denied");
    }
  });

  it("denies expired protected report tokens", () => {
    const result = validateReportAccessRow("report-1", "expected-token", {
      access_token: "expected-token",
      token_expires_at: new Date(Date.now() - 60_000).toISOString(),
    });

    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.equal(result.status, 403);
      assert.equal(result.code, "access_denied");
    }
  });
});

describe("trigger secret auth", () => {
  it("accepts only the exact x-trigger-secret header", () => {
    const previous = process.env.TRIGGER_INSPECTION_SECRET;
    process.env.TRIGGER_INSPECTION_SECRET = "server-secret";
    try {
      const spoofedSameOrigin = new Request("https://app.example/api/trigger-inspection", {
        method: "POST",
        headers: {
          origin: "https://app.example",
          host: "app.example",
        },
      });
      assert.equal(hasExactTriggerSecret(spoofedSameOrigin), false);

      const authorized = new Request("https://app.example/api/trigger-inspection", {
        method: "POST",
        headers: { "x-trigger-secret": "server-secret" },
      });
      assert.equal(hasExactTriggerSecret(authorized), true);
    } finally {
      if (previous === undefined) {
        delete process.env.TRIGGER_INSPECTION_SECRET;
      } else {
        process.env.TRIGGER_INSPECTION_SECRET = previous;
      }
    }
  });
});

describe("report photo write guards", () => {
  it("rejects uploads when the report has no trusted inspection link", () => {
    const result = resolveTrustedInspectionForReport(null, "submitted-inspection");
    assert.deepEqual(result, {
      ok: false,
      status: 400,
      error: "Report is not linked to an inspection",
    });
  });

  it("rejects caller-supplied inspection ids outside the report inspection", () => {
    const result = resolveTrustedInspectionForReport("inspection-a", "inspection-b");
    assert.deepEqual(result, {
      ok: false,
      status: 403,
      error: "inspection_id does not match report.inspection_id",
    });
  });

  it("rejects direct photo links outside a trusted inspection", () => {
    assert.equal(photoMatchesInspection("inspection-b", "inspection-a"), false);
    assert.equal(photoMatchesInspection("inspection-a", "inspection-a"), true);
  });
});

describe("recurring source-level security regressions", () => {
  it("does not use token presence as report unlock authority", () => {
    for (const file of [
      "app/api/report-cover/route.ts",
      "app/api/report-content/route.ts",
      "app/api/report-versions/restore/route.ts",
      "app/api/cover-condition-synthesize/route.ts",
    ]) {
      const source = readFileSync(file, "utf8");
      assert.doesNotMatch(source, /Boolean\(dbToken\)/, file);
    }
  });

  it("does not trust spoofable origin/referer as trigger credentials", () => {
    for (const file of [
      "app/api/create-report/route.ts",
      "app/api/trigger-inspection/route.ts",
      "app/api/inspection-agent/route.ts",
    ]) {
      const source = readFileSync(file, "utf8");
      assert.doesNotMatch(source, /isSameOrigin|new URL\(origin\)|new URL\(referer\)/, file);
    }
  });

  it("does not expose full report_versions payloads from the list route", () => {
    const source = readFileSync("app/api/report-versions/list/route.ts", "utf8");
    assert.doesNotMatch(source, /\.select\("\*"\)/);
    assert.match(source, /listReportVersions/);
  });

  it("requires service-role headers in the create-report Edge function", () => {
    const source = readFileSync("supabase/functions/create-report/index.ts", "utf8");
    assert.match(source, /hasServiceRoleAuth\(req, SERVICE_ROLE\)/);
    assert.match(source, /photo_id does not belong to resolved inspection_id/);
  });
});
