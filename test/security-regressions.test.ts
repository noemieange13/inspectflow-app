import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

import { validateReportAccessRow } from "@/lib/assertReportAccessForApi";
import {
  hasExactTriggerSecret,
  requireExactTriggerSecretIfConfigured,
} from "@/lib/triggerSecretAuth";

function source(path: string): string {
  return readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
}

describe("trigger secret auth", () => {
  it("does not accept spoofable same-origin headers as credentials", () => {
    const previous = process.env.TRIGGER_INSPECTION_SECRET;
    process.env.TRIGGER_INSPECTION_SECRET = "server-secret";
    try {
      const req = new Request("https://inspectflow.example/api/trigger-inspection", {
        method: "POST",
        headers: {
          host: "inspectflow.example",
          origin: "https://inspectflow.example",
          referer: "https://inspectflow.example/report/demo",
        },
      });

      assert.equal(hasExactTriggerSecret(req), false);
      const result = requireExactTriggerSecretIfConfigured(req);
      assert.equal(result.ok, false);
      if (!result.ok) assert.equal(result.response.status, 401);
    } finally {
      if (previous === undefined) {
        delete process.env.TRIGGER_INSPECTION_SECRET;
      } else {
        process.env.TRIGGER_INSPECTION_SECRET = previous;
      }
    }
  });

  it("accepts only an exact x-trigger-secret match", () => {
    const previous = process.env.TRIGGER_INSPECTION_SECRET;
    process.env.TRIGGER_INSPECTION_SECRET = "server-secret";
    try {
      const req = new Request("https://inspectflow.example/api/trigger-inspection", {
        method: "POST",
        headers: { "x-trigger-secret": "server-secret" },
      });
      assert.equal(hasExactTriggerSecret(req), true);
      assert.deepEqual(requireExactTriggerSecretIfConfigured(req), { ok: true });
    } finally {
      if (previous === undefined) {
        delete process.env.TRIGGER_INSPECTION_SECRET;
      } else {
        process.env.TRIGGER_INSPECTION_SECRET = previous;
      }
    }
  });
});

describe("report token access", () => {
  it("denies missing or fake tokens when a report stores an access token", () => {
    const row = {
      access_token: "stored-token",
      token_expires_at: new Date(Date.now() + 60_000).toISOString(),
      user_id: "user-1",
    };

    assert.deepEqual(validateReportAccessRow("report-1", "", row), {
      ok: false,
      status: 403,
      error: "Invalid access token",
      code: "access_denied",
    });
    assert.equal(validateReportAccessRow("report-1", "fake", row).ok, false);
    assert.deepEqual(validateReportAccessRow("report-1", "stored-token", row), {
      ok: true,
      userId: "user-1",
    });
  });
});

describe("high-risk route guardrails", () => {
  it("keeps report version listing token-gated and metadata-only", () => {
    const route = source("app/api/report-versions/list/route.ts");
    assert.match(route, /assertReportViewerAccess/);
    assert.match(route, /listReportVersions/);
    assert.doesNotMatch(route, /\.select\(["']\*["']\)/);
  });

  it("keeps upload-photo authenticated and prevents report photo overwrite", () => {
    const route = source("app/api/upload-photo/route.ts");
    assert.match(route, /assertReportAccessWithOptionalSession/);
    assert.match(route, /inspection_id does not match report\.inspection_id/);
    assert.match(route, /Photo row insert failed/);
    assert.match(route, /\.is\(["']photo_id["'], null\)/);
  });

  it("keeps Edge create-report service-role gated and photo-inspection checked", () => {
    const edge = source("supabase/functions/create-report/index.ts");
    assert.match(edge, /hasServiceRoleHeaders/);
    assert.match(edge, /Unauthorized/);
    assert.match(edge, /photo_id does not match inspection_id/);
  });

  it("does not grant PDF lock claims to authenticated clients", () => {
    const migration = source(
      "supabase/migrations/20260701110500_revoke_claim_report_lock_authenticated.sql",
    );
    assert.match(migration, /revoke execute on function public\.claim_report_lock\(uuid\) from authenticated/i);
    assert.doesNotMatch(migration, /grant execute on function public\.claim_report_lock\(uuid\) to authenticated/i);
  });
});
