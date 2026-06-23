import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

import { validateReportAccessRow } from "@/lib/assertReportAccessForApi";
import { assertTriggerSecret } from "@/lib/triggerSecretAuth";

function source(path: string): string {
  return readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
}

describe("report viewer token gates", () => {
  it("rejects missing, wrong, and expired tokens for tokenized reports", () => {
    const row = { access_token: "secret-token", token_expires_at: null };

    assert.deepEqual(validateReportAccessRow("r1", "", row), {
      ok: false,
      status: 403,
      error: "Invalid access token",
      code: "access_denied",
    });
    assert.equal(validateReportAccessRow("r1", "wrong", row).ok, false);
    assert.equal(validateReportAccessRow("r1", "secret-token", row).ok, true);
    assert.equal(
      validateReportAccessRow("r1", "secret-token", {
        access_token: "secret-token",
        token_expires_at: "2000-01-01T00:00:00.000Z",
      }).ok,
      false,
    );
  });
});

describe("trigger secret auth", () => {
  it("does not treat spoofable Origin or Referer headers as credentials", () => {
    const previous = process.env.TRIGGER_INSPECTION_SECRET;
    process.env.TRIGGER_INSPECTION_SECRET = "expected-secret";
    try {
      const sameOriginRequest = new Request("https://inspectflow.test/api/trigger-inspection", {
        method: "POST",
        headers: {
          host: "inspectflow.test",
          origin: "https://inspectflow.test",
          referer: "https://inspectflow.test/report/demo",
        },
      });
      assert.equal(assertTriggerSecret(sameOriginRequest)?.status, 401);

      const authorizedRequest = new Request("https://inspectflow.test/api/trigger-inspection", {
        method: "POST",
        headers: { "x-trigger-secret": "expected-secret" },
      });
      assert.equal(assertTriggerSecret(authorizedRequest), null);
    } finally {
      if (previous === undefined) {
        delete process.env.TRIGGER_INSPECTION_SECRET;
      } else {
        process.env.TRIGGER_INSPECTION_SECRET = previous;
      }
    }
  });
});

describe("critical report route invariants", () => {
  it("never derives locked-report unlock permission from a viewer token", () => {
    for (const path of [
      "app/api/report-cover/route.ts",
      "app/api/report-content/route.ts",
      "app/api/report-versions/restore/route.ts",
      "app/api/cover-condition-synthesize/route.ts",
    ]) {
      const body = source(path);
      assert.doesNotMatch(body, /allowReportPayloadUnlock\(req\)\s*\|\|/);
      assert.doesNotMatch(body, /Boolean\(dbToken\)/);
    }
  });

  it("keeps report-version listing behind real report-token or admin validation", () => {
    const body = source("app/api/report-versions/list/route.ts");
    assert.match(body, /validateReportAccessRow\(report_id,\s*access_token,\s*report\)/);
    assert.match(body, /listReportVersions\(supabase,\s*report_id,\s*MAX_VERSIONS\)/);
    assert.doesNotMatch(body, /\.select\("\*"\)/);
  });

  it("requires upload callers to forward viewer tokens", () => {
    assert.match(
      source("components/ZeroDraftReportComposer.tsx"),
      /form\.append\("access_token",\s*viewerToken \?\? ""\)/,
    );
    assert.match(
      source("components/LiveInspectionCapture.tsx"),
      /form\.append\("access_token",\s*viewerToken \?\? ""\)/,
    );
  });

  it("uses the hydrated cover form instead of the non-persisting alert-only form", () => {
    const body = source("app/rapport/couverture/page.tsx");
    assert.match(body, /InspectionCoverFormHydrated/);
    assert.doesNotMatch(body, /InspectionCoverFormSimple/);
  });
});
