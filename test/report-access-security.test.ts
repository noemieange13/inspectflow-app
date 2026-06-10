import assert from "node:assert/strict";
import { describe, it } from "node:test";

import type { SupabaseClient } from "@supabase/supabase-js";

import { listReportVersions } from "@/lib/reportVersions";
import { validateReportViewerAccessRecord } from "@/lib/reportViewerAccess";

describe("report viewer access validation", () => {
  it("denies protected reports when the viewer token is missing", () => {
    const result = validateReportViewerAccessRecord(
      { access_token: "secret-token" },
      "",
    );

    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.equal(result.status, 403);
      assert.equal(result.body.code, "access_denied");
    }
  });

  it("denies protected reports when the viewer token is arbitrary", () => {
    const result = validateReportViewerAccessRecord(
      { access_token: "secret-token" },
      "anything",
    );

    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.equal(result.status, 403);
    }
  });

  it("accepts the matching viewer token and preserves legacy no-token access", () => {
    assert.deepEqual(
      validateReportViewerAccessRecord({ access_token: "Secret-Token" }, " secret-token "),
      { ok: true },
    );
    assert.deepEqual(validateReportViewerAccessRecord({ access_token: null }, ""), {
      ok: true,
    });
  });

  it("denies expired report tokens even when the token matches", () => {
    const result = validateReportViewerAccessRecord(
      {
        access_token: "secret-token",
        token_expires_at: "2000-01-01T00:00:00.000Z",
      },
      "secret-token",
    );

    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.equal(result.status, 403);
      assert.equal(result.body.error, "Access token expired");
    }
  });
});

describe("report version listing", () => {
  it("selects version metadata only, not historical payload snapshots", async () => {
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
                  order(columnName: string, options: { ascending: boolean }) {
                    assert.equal(columnName, "version_number");
                    assert.deepEqual(options, { ascending: false });
                    return {
                      limit(limit: number) {
                        assert.equal(limit, 50);
                        return Promise.resolve({ data: [], error: null });
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
    assert.ok(selectedColumns.length > 0);
    assert.ok(
      !selectedColumns
        .split(",")
        .map((column) => column.trim())
        .includes("payload"),
      "report_versions payload must not be selected by the list endpoint",
    );
  });
});
