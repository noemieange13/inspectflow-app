import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { validateReportAccessRow } from "@/lib/assertReportAccessForApi";
import { listReportVersions } from "@/lib/reportVersions";
import { assertReportViewerAccess } from "@/lib/reportViewerAccess";

function fakeReportSupabase(row: Record<string, unknown> | null) {
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
  };
}

describe("report access security", () => {
  it("denies tokenized reports when the viewer token is missing", () => {
    const result = validateReportAccessRow("report-1", "", {
      access_token: "secret-token",
      token_expires_at: null,
      user_id: "owner-1",
    });

    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.equal(result.status, 403);
      assert.equal(result.code, "access_denied");
    }
  });

  it("allows legacy reports without a stored access token", () => {
    const result = validateReportAccessRow("report-1", "", {
      access_token: null,
      token_expires_at: null,
      user_id: "owner-1",
    });

    assert.deepEqual(result, { ok: true, userId: "owner-1" });
  });

  it("rejects expired report viewer tokens even when the token matches", () => {
    const result = validateReportAccessRow("report-1", "secret-token", {
      access_token: "secret-token",
      token_expires_at: "2000-01-01T00:00:00.000Z",
      user_id: "owner-1",
    });

    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.equal(result.status, 403);
      assert.equal(result.error, "Access token expired");
    }
  });

  it("applies the same missing-token denial through assertReportViewerAccess", async () => {
    const result = await assertReportViewerAccess(
      fakeReportSupabase({
        access_token: "secret-token",
        token_expires_at: null,
      }) as never,
      "report-1",
      "",
    );

    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.equal(result.status, 403);
      assert.equal(result.body.code, "access_denied");
    }
  });

  it("lists report version metadata without selecting payload snapshots", async () => {
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
                    assert.deepEqual(opts, { ascending: false });
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
    };

    const result = await listReportVersions(supabase as never, "report-1", 50);

    assert.deepEqual(result, { rows: [] });
    assert.doesNotMatch(selectedColumns, /\bpayload\b/);
  });
});
