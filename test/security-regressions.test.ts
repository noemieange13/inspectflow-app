import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

import { validateReportAccessRow } from "@/lib/assertReportAccessForApi";
import { allowReportPayloadUnlock } from "@/lib/reportPayloadUnlock";
import { listReportVersions } from "@/lib/reportVersions";
import { assertReportViewerAccess } from "@/lib/reportViewerAccess";
import { hasExactTriggerSecret } from "@/lib/triggerSecretAuth";

function withEnv<T>(patch: Record<string, string | undefined>, run: () => T): T {
  const previous = new Map<string, string | undefined>();
  for (const [key, value] of Object.entries(patch)) {
    previous.set(key, process.env[key]);
    if (value === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  }
  try {
    return run();
  } finally {
    for (const [key, value] of previous) {
      if (value === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    }
  }
}

describe("trigger secret auth", () => {
  it("does not treat spoofable Origin/Referer as credentials", () => {
    withEnv({ TRIGGER_INSPECTION_SECRET: "top-secret" }, () => {
      const req = new Request("https://app.example/api/trigger-inspection", {
        method: "POST",
        headers: {
          host: "app.example",
          origin: "https://app.example",
          referer: "https://app.example/report/r1",
        },
      });

      assert.equal(hasExactTriggerSecret(req), false);
    });
  });

  it("accepts only the exact x-trigger-secret value", () => {
    withEnv({ TRIGGER_INSPECTION_SECRET: "top-secret" }, () => {
      const ok = new Request("https://app.example/api/trigger-inspection", {
        method: "POST",
        headers: { "x-trigger-secret": "top-secret" },
      });
      const wrong = new Request("https://app.example/api/trigger-inspection", {
        method: "POST",
        headers: { "x-trigger-secret": "top-secret-extra" },
      });

      assert.equal(hasExactTriggerSecret(ok), true);
      assert.equal(hasExactTriggerSecret(wrong), false);
    });
  });
});

describe("report access tokens", () => {
  const tokenizedRow = {
    access_token: "real-token",
    token_expires_at: new Date(Date.now() + 60_000).toISOString(),
    user_id: "owner-1",
  };

  it("denies missing or fake tokens for tokenized reports", () => {
    assert.equal(validateReportAccessRow("r1", "", tokenizedRow).ok, false);
    assert.equal(validateReportAccessRow("r1", "fake", tokenizedRow).ok, false);
  });

  it("accepts valid tokens and keeps legacy tokenless reports readable", () => {
    assert.deepEqual(validateReportAccessRow("r1", "real-token", tokenizedRow), {
      ok: true,
      userId: "owner-1",
    });
    assert.deepEqual(validateReportAccessRow("legacy", "", { user_id: "owner-2" }), {
      ok: true,
      userId: "owner-2",
    });
  });

  it("assertReportViewerAccess validates the supplied token against reports.access_token", async () => {
    const fakeSupabase = {
      from(table: string) {
        assert.equal(table, "reports");
        return {
          select(columns: string) {
            assert.equal(columns, "access_token, token_expires_at");
            return this;
          },
          eq(column: string, value: string) {
            assert.equal(column, "id");
            assert.equal(value, "r1");
            return this;
          },
          async maybeSingle() {
            return { data: tokenizedRow, error: null };
          },
        };
      },
    };

    const invalid = await assertReportViewerAccess(fakeSupabase as never, "r1", "fake");
    assert.equal(invalid.ok, false);
    if (!invalid.ok) {
      assert.equal(invalid.status, 403);
      assert.equal(invalid.body.code, "access_denied");
    }

    const valid = await assertReportViewerAccess(fakeSupabase as never, "r1", "real-token");
    assert.equal(valid.ok, true);
  });
});

describe("report versions listing", () => {
  it("lists only metadata fields, not full payload snapshots", async () => {
    let selected = "";
    const fakeSupabase = {
      from(table: string) {
        assert.equal(table, "report_versions");
        return {
          select(columns: string) {
            selected = columns;
            return this;
          },
          eq(column: string, value: string) {
            assert.equal(column, "report_id");
            assert.equal(value, "r1");
            return this;
          },
          order(column: string, opts: { ascending: boolean }) {
            assert.equal(column, "version_number");
            assert.equal(opts.ascending, false);
            return this;
          },
          async limit(limit: number) {
            assert.equal(limit, 50);
            return { data: [], error: null };
          },
        };
      },
    };

    const result = await listReportVersions(fakeSupabase as never, "r1", 50);
    assert.deepEqual(result, { rows: [] });
    assert.doesNotMatch(selected, /\bpayload\b/);
  });
});

describe("locked report integrity", () => {
  it("does not allow remote production unlocks by default", () => {
    withEnv(
      {
        NODE_ENV: "production",
        VERCEL: "1",
        INSPECTFLOW_DEV_UNLOCK_REPORT: undefined,
      },
      () => {
        const req = new Request("https://app.example/api/report-content", {
          method: "POST",
          headers: { host: "app.example" },
        });
        assert.equal(allowReportPayloadUnlock(req), false);
      },
    );
  });

  it("write routes no longer unlock merely because a report has an access token", () => {
    const files = [
      "app/api/report-cover/route.ts",
      "app/api/report-content/route.ts",
      "app/api/report-versions/restore/route.ts",
      "app/api/cover-condition-synthesize/route.ts",
    ];

    for (const file of files) {
      const source = readFileSync(new URL(`../${file}`, import.meta.url), "utf8");
      assert.doesNotMatch(source, /Boolean\(dbToken\)/, file);
    }
  });
});

describe("upload route hardening", () => {
  it("requires report access before service-role storage writes and preserves an existing photo_id", () => {
    const source = readFileSync(
      new URL("../app/api/upload-photo/route.ts", import.meta.url),
      "utf8",
    );

    assert.match(source, /assertReportAccessWithOptionalSession/);
    assert.match(source, /inspection_id does not match report/);
    assert.match(source, /\.is\("photo_id", null\)/);
  });
});
