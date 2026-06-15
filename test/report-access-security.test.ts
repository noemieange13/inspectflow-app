import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

import type { SupabaseClient } from "@supabase/supabase-js";

import {
  assertReportAccessWithOptionalSession,
  validateReportAccessRow,
} from "@/lib/assertReportAccessForApi";
import { assertReportViewerAccess } from "@/lib/reportViewerAccess";
import { listReportVersions } from "@/lib/reportVersions";

const VALID_TOKEN = "abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890";
const OTHER_TOKEN = "1111111111111111111111111111111111111111111111111111111111111111";

function fakeReportSupabase(row: Record<string, unknown> | null): SupabaseClient {
  return {
    from(table: string) {
      assert.equal(table, "reports");
      return {
        select(columns: string) {
          assert.match(columns, /access_token/);
          return {
            eq(column: string, id: string) {
              assert.equal(column, "id");
              assert.equal(id, "report-1");
              return {
                async maybeSingle() {
                  return { data: row, error: null };
                },
              };
            },
          };
        },
      };
    },
  } as unknown as SupabaseClient;
}

describe("report viewer access gates", () => {
  it("denies missing and wrong tokens for tokenized reports", () => {
    const row = { access_token: VALID_TOKEN, token_expires_at: null, user_id: "owner-1" };

    const missing = validateReportAccessRow("report-1", "", row);
    assert.equal(missing.ok, false);
    if (!missing.ok) assert.equal(missing.status, 403);

    const wrong = validateReportAccessRow("report-1", OTHER_TOKEN, row);
    assert.equal(wrong.ok, false);
    if (!wrong.ok) assert.equal(wrong.status, 403);

    assert.equal(validateReportAccessRow("report-1", VALID_TOKEN, row).ok, true);
  });

  it("applies the same missing-token denial through the Supabase viewer helper", async () => {
    const gate = await assertReportViewerAccess(fakeReportSupabase({
      access_token: VALID_TOKEN,
      token_expires_at: null,
    }), "report-1", "");

    assert.equal(gate.ok, false);
    if (!gate.ok) {
      assert.equal(gate.status, 403);
      assert.equal(gate.body.code, "access_denied");
    }
  });

  it("requires either a valid share token or owner session before report uploads", async () => {
    const req = new Request("https://example.test/api/upload-photo", { method: "POST" });
    const gate = await assertReportAccessWithOptionalSession(req, "report-1", "", {
      access_token: VALID_TOKEN,
      token_expires_at: null,
      user_id: "owner-1",
    });

    assert.equal(gate.ok, false);
    if (!gate.ok) assert.equal(gate.status, 403);
  });
});

describe("report version listing", () => {
  it("uses metadata-only report version rows", async () => {
    let selectedColumns = "";
    const supabase = {
      from(table: string) {
        assert.equal(table, "report_versions");
        return {
          select(columns: string) {
            selectedColumns = columns;
            return {
              eq(column: string, id: string) {
                assert.equal(column, "report_id");
                assert.equal(id, "report-1");
                return {
                  order(columnName: string, options: { ascending: boolean }) {
                    assert.equal(columnName, "version_number");
                    assert.equal(options.ascending, false);
                    return {
                      async limit(limit: number) {
                        assert.equal(limit, 50);
                        return {
                          data: [
                            {
                              id: "version-1",
                              version_number: 7,
                              created_at: "2026-01-01T00:00:00.000Z",
                              created_by: "ai",
                              source: "test",
                              diff_summary: null,
                              metadata: {},
                              is_major: false,
                              confidence_score: null,
                              audit_status: "complete",
                              ledger_event_id: null,
                            },
                          ],
                          error: null,
                        };
                      },
                    };
                  },
                };
              },
            };
          },
        };
      },
    } as unknown as SupabaseClient;

    const result = await listReportVersions(supabase, "report-1", 50);

    assert.ok(!("error" in result));
    assert.equal(result.rows.length, 1);
    assert.ok(!selectedColumns.split(",").map((s) => s.trim()).includes("payload"));
  });
});

describe("locked report write routes", () => {
  it("do not treat a share token as a force-unlock override", () => {
    const routeFiles = [
      "app/api/report-content/route.ts",
      "app/api/report-cover/route.ts",
      "app/api/report-versions/restore/route.ts",
      "app/api/cover-condition-synthesize/route.ts",
    ];

    for (const file of routeFiles) {
      const source = readFileSync(file, "utf8");
      assert.doesNotMatch(source, /\|\|\s*Boolean\(dbToken\)/, file);
    }
  });
});
