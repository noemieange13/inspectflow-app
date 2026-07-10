import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";

import { validateReportAccessRow } from "@/lib/assertReportAccessForApi";
import { assertReportViewerAccess } from "@/lib/reportViewerAccess";
import { resolveReportUploadScope } from "@/lib/reportUploadScope";
import {
  isExactTriggerSecret,
  requireExactTriggerSecretIfConfigured,
} from "@/lib/triggerSecretAuth";

const originalTriggerSecret = process.env.TRIGGER_INSPECTION_SECRET;

afterEach(() => {
  if (originalTriggerSecret == null) {
    delete process.env.TRIGGER_INSPECTION_SECRET;
  } else {
    process.env.TRIGGER_INSPECTION_SECRET = originalTriggerSecret;
  }
});

function reportAccessSupabaseMock(report: Record<string, unknown> | null) {
  return {
    from(table: string) {
      assert.equal(table, "reports");
      return {
        select(selection: string) {
          assert.match(selection, /access_token/);
          return {
            eq(column: string, reportId: string) {
              assert.equal(column, "id");
              assert.equal(reportId, "report-1");
              return {
                async maybeSingle() {
                  return { data: report, error: null };
                },
              };
            },
          };
        },
      };
    },
  };
}

describe("report viewer access", () => {
  it("denies tokenized reports when the viewer omits the token", () => {
    const result = validateReportAccessRow("report-1", "", {
      access_token: "stored-token",
      token_expires_at: new Date(Date.now() + 60_000).toISOString(),
    });

    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.equal(result.status, 403);
      assert.equal(result.code, "access_denied");
    }
  });

  it("denies fake viewer tokens before returning report data", async () => {
    const gate = await assertReportViewerAccess(
      reportAccessSupabaseMock({
        access_token: "stored-token",
        token_expires_at: new Date(Date.now() + 60_000).toISOString(),
      }) as never,
      "report-1",
      "fake-token",
    );

    assert.equal(gate.ok, false);
    if (!gate.ok) {
      assert.equal(gate.status, 403);
      assert.equal(gate.body.code, "access_denied");
    }
  });
});

describe("trigger secret auth", () => {
  it("does not accept spoofable same-origin headers as credentials", () => {
    process.env.TRIGGER_INSPECTION_SECRET = "real-secret";
    const req = new Request("https://app.example/api/trigger-inspection", {
      method: "POST",
      headers: {
        host: "app.example",
        origin: "https://app.example",
        referer: "https://app.example/report/report-1",
      },
    });

    assert.equal(isExactTriggerSecret(req), false);
    const gate = requireExactTriggerSecretIfConfigured(req);
    assert.equal(gate.ok, false);
    if (!gate.ok) {
      assert.equal(gate.status, 401);
    }
  });

  it("accepts only the exact configured trigger secret", () => {
    process.env.TRIGGER_INSPECTION_SECRET = "real-secret";
    const req = new Request("https://app.example/api/trigger-inspection", {
      method: "POST",
      headers: { "x-trigger-secret": "real-secret" },
    });

    assert.equal(isExactTriggerSecret(req), true);
    assert.deepEqual(requireExactTriggerSecretIfConfigured(req), { ok: true });
  });
});

describe("report upload scope", () => {
  it("rejects caller-supplied inspection IDs that differ from the report link", () => {
    const scope = resolveReportUploadScope(
      { inspection_id: "inspection-a", user_id: "owner-1" },
      "inspection-b",
      null,
    );

    assert.equal(scope.ok, false);
    if (!scope.ok) {
      assert.equal(scope.status, 403);
      assert.equal(scope.code, "inspection_mismatch");
    }
  });

  it("rejects attaching photos to an unlinked report via caller-supplied inspection_id", () => {
    const scope = resolveReportUploadScope({ user_id: "owner-1" }, "inspection-a", null);

    assert.equal(scope.ok, false);
    if (!scope.ok) {
      assert.equal(scope.status, 400);
      assert.equal(scope.code, "missing_report_inspection");
    }
  });
});
