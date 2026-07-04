import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

import { validateReportAccessRow } from "@/lib/assertReportAccessForApi";
import { listReportVersions } from "@/lib/reportVersions";
import {
  hasExactTriggerSecret,
  requireExactTriggerSecretIfConfigured,
} from "@/lib/triggerSecretAuth";

const REPORT_ID = "11111111-1111-4111-8111-111111111111";

describe("report access token gates", () => {
  it("denies missing, fake, and expired tokens for protected reports", () => {
    const protectedRow = {
      access_token: "real-token",
      token_expires_at: null,
      user_id: "owner",
    };

    assert.equal(validateReportAccessRow(REPORT_ID, "", protectedRow).ok, false);
    assert.equal(validateReportAccessRow(REPORT_ID, "fake-token", protectedRow).ok, false);
    assert.deepEqual(validateReportAccessRow(REPORT_ID, "real-token", protectedRow), {
      ok: true,
      userId: "owner",
    });

    const expired = {
      ...protectedRow,
      token_expires_at: "2000-01-01T00:00:00.000Z",
    };
    const expiredGate = validateReportAccessRow(REPORT_ID, "real-token", expired);
    assert.equal(expiredGate.ok, false);
    if (!expiredGate.ok) {
      assert.equal(expiredGate.code, "access_denied");
    }
  });
});

describe("report version listing", () => {
  it("selects metadata only and never fetches version payload snapshots", async () => {
    const selectCalls: string[] = [];
    const supabase = {
      from(table: string) {
        assert.equal(table, "report_versions");
        return {
          select(columns: string) {
            selectCalls.push(columns);
            return {
              eq(field: string, value: string) {
                assert.equal(field, "report_id");
                assert.equal(value, REPORT_ID);
                return {
                  order(fieldName: string, opts: { ascending: boolean }) {
                    assert.equal(fieldName, "version_number");
                    assert.equal(opts.ascending, false);
                    return {
                      limit(limit: number) {
                        assert.equal(limit, 5);
                        return Promise.resolve({
                          data: [
                            {
                              id: "version-1",
                              version_number: 1,
                              created_at: "2026-01-01T00:00:00.000Z",
                              created_by: "user",
                              source: "manual",
                              diff_summary: null,
                              metadata: {},
                              is_major: false,
                              confidence_score: null,
                              audit_status: "partial",
                              ledger_event_id: null,
                            },
                          ],
                          error: null,
                        });
                      },
                    };
                  },
                };
              },
            };
          },
        };
      },
    };

    const result = await listReportVersions(supabase as never, REPORT_ID, 5);

    assert.equal("rows" in result, true);
    assert.equal(selectCalls.length, 1);
    assert.equal(selectCalls[0].includes("payload"), false);
  });
});

describe("trigger secret auth", () => {
  it("does not accept spoofed same-origin headers as a trigger credential", async () => {
    const prev = process.env.TRIGGER_INSPECTION_SECRET;
    process.env.TRIGGER_INSPECTION_SECRET = "secret";
    try {
      const spoofed = new Request("https://app.example.test/api/create-report", {
        method: "POST",
        headers: {
          host: "app.example.test",
          origin: "https://app.example.test",
        },
      });

      assert.equal(hasExactTriggerSecret(spoofed), false);
      const denied = requireExactTriggerSecretIfConfigured(spoofed);
      assert.ok(denied);
      assert.equal(denied.status, 401);

      const exact = new Request("https://app.example.test/api/create-report", {
        method: "POST",
        headers: { "x-trigger-secret": "secret" },
      });
      assert.equal(hasExactTriggerSecret(exact), true);
      assert.equal(requireExactTriggerSecretIfConfigured(exact), null);
    } finally {
      if (prev === undefined) {
        delete process.env.TRIGGER_INSPECTION_SECRET;
      } else {
        process.env.TRIGGER_INSPECTION_SECRET = prev;
      }
    }
  });
});

describe("route-level security invariants", () => {
  it("does not use report-token presence to unlock finalized reports", () => {
    for (const path of [
      "app/api/report-content/route.ts",
      "app/api/report-cover/route.ts",
      "app/api/report-versions/restore/route.ts",
      "app/api/cover-condition-synthesize/route.ts",
    ]) {
      const source = readFileSync(path, "utf8");
      assert.equal(source.includes("Boolean(dbToken)"), false, path);
    }
  });

  it("keeps Edge create-report service-role-only and inspection-bound for photos", () => {
    const source = readFileSync("supabase/functions/create-report/index.ts", "utf8");
    assert.match(source, /authorization/);
    assert.match(source, /apikey/);
    assert.match(source, /photo_id does not belong to inspection_id/);
    assert.match(source, /job\.photo_id does not belong to inspection_id/);
  });
});
