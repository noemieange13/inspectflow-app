/**
 * Focused security regressions for shared report access gates.
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";

import type { SupabaseClient } from "@supabase/supabase-js";

import {
  assertReportAccessWithOptionalSession,
  validateReportAccessRow,
} from "@/lib/assertReportAccessForApi";
import { assertReportViewerAccess } from "@/lib/reportViewerAccess";
import { listReportVersions } from "@/lib/reportVersions";

function supabaseWithReportRow(row: Record<string, unknown> | null): SupabaseClient {
  return {
    from(table: string) {
      assert.equal(table, "reports");
      return {
        select(columns: string) {
          assert.match(columns, /access_token/);
          return {
            eq(column: string, value: string) {
              assert.equal(column, "id");
              assert.equal(value, "report-1");
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
  it("denies protected report rows when the viewer token is missing", () => {
    const gate = validateReportAccessRow("report-1", "", {
      access_token: "secret-token",
      token_expires_at: null,
    });

    assert.equal(gate.ok, false);
    if (!gate.ok) {
      assert.equal(gate.status, 403);
      assert.equal(gate.code, "access_denied");
    }
  });

  it("denies arbitrary non-empty tokens for report version access", async () => {
    const gate = await assertReportViewerAccess(
      supabaseWithReportRow({
        access_token: "real-token",
        token_expires_at: null,
      }),
      "report-1",
      "garbage-token",
    );

    assert.equal(gate.ok, false);
    if (!gate.ok) {
      assert.equal(gate.status, 403);
      assert.equal(gate.body.code, "access_denied");
    }
  });

  it("allows the exact viewer token for protected report APIs", async () => {
    const gate = await assertReportAccessWithOptionalSession(
      new Request("https://inspectflow.test/api/upload-photo", { method: "POST" }),
      "report-1",
      "real-token",
      {
        access_token: "real-token",
        token_expires_at: null,
        user_id: "owner-1",
      },
    );

    assert.equal(gate.ok, true);
  });

  it("denies missing viewer token before protected upload writes", async () => {
    const gate = await assertReportAccessWithOptionalSession(
      new Request("https://inspectflow.test/api/upload-photo", { method: "POST" }),
      "report-1",
      "",
      {
        access_token: "real-token",
        token_expires_at: null,
        user_id: "owner-1",
      },
    );

    assert.equal(gate.ok, false);
    if (!gate.ok) {
      assert.equal(gate.status, 403);
      assert.equal(gate.code, "access_denied");
    }
  });
});

describe("report version listing", () => {
  it("returns metadata only and never selects full version payloads", async () => {
    let selectedColumns = "";
    const supabase = {
      from(table: string) {
        assert.equal(table, "report_versions");
        return {
          select(columns: string) {
            selectedColumns = columns;
            return {
              eq(column: string, value: string) {
                assert.equal(column, "report_id");
                assert.equal(value, "report-1");
                return {
                  order(columnName: string, opts: { ascending: boolean }) {
                    assert.equal(columnName, "version_number");
                    assert.equal(opts.ascending, false);
                    return {
                      async limit(value: number) {
                        assert.equal(value, 50);
                        return { data: [], error: null };
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

    assert.deepEqual(result, { rows: [] });
    assert.doesNotMatch(selectedColumns, /\bpayload\b/);
    assert.match(selectedColumns, /\bversion_number\b/);
  });
});
