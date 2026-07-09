/**
 * Focused guards for recurring critical regressions: report token enforcement,
 * service-role mutation auth, trigger-secret auth, and cross-inspection photos.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

import {
  assertReportMutationAccessWithOptionalSession,
  validateReportAccessRow,
} from "@/lib/assertReportAccessForApi";
import { resolveEffectiveInspectionId } from "@/lib/photoUploadInspection";
import { requireExactTriggerSecret } from "@/lib/triggerSecretAuth";

const ROOT = process.cwd();

function source(path: string): string {
  return readFileSync(`${ROOT}/${path}`, "utf8");
}

function withEnv<T>(patch: Record<string, string | undefined>, fn: () => T): T {
  const previous = new Map<string, string | undefined>();
  for (const [key, value] of Object.entries(patch)) {
    previous.set(key, process.env[key]);
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  try {
    return fn();
  } finally {
    for (const [key, value] of previous.entries()) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
}

describe("report access guards", () => {
  it("denies protected reports when the viewer token is missing", () => {
    const result = validateReportAccessRow("report-1", "", {
      access_token: "db-token",
      token_expires_at: null,
      user_id: "owner-1",
    });

    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.equal(result.status, 403);
      assert.equal(result.code, "access_denied");
    }
  });

  it("denies tokenless legacy reports on mutation paths without owner session", async () => {
    const result = await assertReportMutationAccessWithOptionalSession(
      new Request("https://app.example.test/api/upload-photo", { method: "POST" }),
      "report-1",
      "",
      {
        access_token: "",
        token_expires_at: null,
        user_id: "owner-1",
      },
    );

    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.equal(result.status, 403);
      assert.equal(result.code, "owner_session_required");
    }
  });
});

describe("trigger secret auth", () => {
  it("does not treat spoofable Origin or Referer as credentials", () => {
    withEnv(
      {
        TRIGGER_INSPECTION_SECRET: "expected-secret",
        NODE_ENV: "production",
      },
      () => {
        const req = new Request("https://app.example.test/api/create-report", {
          method: "POST",
          headers: {
            host: "app.example.test",
            origin: "https://app.example.test",
            referer: "https://app.example.test/report/demo",
          },
        });

        const result = requireExactTriggerSecret(req);
        assert.equal(result.ok, false);
        if (!result.ok) {
          assert.equal(result.status, 401);
          assert.equal(result.body.code, "trigger_secret_invalid");
        }
      },
    );
  });

  it("requires a configured trigger secret outside local development", () => {
    withEnv(
      {
        TRIGGER_INSPECTION_SECRET: undefined,
        NODE_ENV: "production",
      },
      () => {
        const req = new Request("https://app.example.test/api/create-report", {
          method: "POST",
        });
        const result = requireExactTriggerSecret(req);
        assert.equal(result.ok, false);
        if (!result.ok) {
          assert.equal(result.status, 500);
          assert.equal(result.body.code, "trigger_secret_missing");
        }
      },
    );
  });
});

describe("photo upload inspection binding", () => {
  it("requires reports to have an inspection before accepting uploads", () => {
    const result = resolveEffectiveInspectionId(null, null);
    assert.deepEqual(result, {
      ok: false,
      status: 400,
      error: "Report is missing inspection_id; refusing orphan photo upload",
    });
  });

  it("rejects caller-supplied inspection IDs outside the report inspection", () => {
    const result = resolveEffectiveInspectionId("inspection-a", "inspection-b");
    assert.deepEqual(result, {
      ok: false,
      status: 403,
      error: "inspection_id does not match report.inspection_id",
    });
  });
});

describe("critical route source invariants", () => {
  it("server-only auth routes do not trust Origin or Referer headers", () => {
    for (const path of [
      "app/api/create-report/route.ts",
      "app/api/trigger-inspection/route.ts",
      "app/api/inspection-agent/route.ts",
    ]) {
      const text = source(path);
      assert.doesNotMatch(text, /new URL\(origin\)/);
      assert.doesNotMatch(text, /referer.*host/);
      assert.doesNotMatch(text, /isSameOrigin/);
    }
  });

  it("trigger-inspection has no debug log ingest side effects", () => {
    assert.doesNotMatch(
      source("app/api/trigger-inspection/route.ts"),
      /127\.0\.0\.1:7484\/ingest|X-Debug-Session-Id|hypothesisId/,
    );
  });

  it("report version listing validates access and returns metadata only", () => {
    const text = source("app/api/report-versions/list/route.ts");
    assert.match(text, /assertReportAccessWithOptionalSession/);
    assert.match(text, /listReportVersions/);
    assert.doesNotMatch(text, /\.select\("\*"\)/);
  });

  it("PDF photo selection fallback is scoped to the report inspection", () => {
    const text = source("supabase/functions/reports-pdf/index.ts");
    const selectionIdx = text.indexOf('source: "selection_ids_without_inspection_ignored"');
    const scopeIdx = text.indexOf('.eq("inspection_id", inspectionId)', selectionIdx);
    assert.ok(selectionIdx > -1, "missing no-inspection guard for selection IDs");
    assert.ok(scopeIdx > selectionIdx, "selection fallback must filter by inspection_id");
  });

  it("report-content validates selected photos before updating payload", () => {
    const text = source("app/api/report-content/route.ts");
    const validateIdx = text.indexOf("validateReportPhotoSelectionIds(");
    const updateIdx = text.indexOf("updateReportPayloadWithUnlock(");
    assert.ok(validateIdx > -1, "missing selection validation");
    assert.ok(updateIdx > validateIdx, "photo selection validation must precede payload update");
  });
});
