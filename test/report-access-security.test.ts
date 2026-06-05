import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { validateReportViewerAccessRecord } from "@/lib/reportViewerAccess";
import { listReportVersions } from "@/lib/reportVersions";
import type { SupabaseClient } from "@supabase/supabase-js";

describe("validateReportViewerAccessRecord", () => {
  it("rejects a protected report when the viewer token is missing", () => {
    const result = validateReportViewerAccessRecord(
      {
        access_token: "secret-token",
        token_expires_at: new Date(Date.now() + 60_000).toISOString(),
      },
      "",
    );

    assert.equal(result.ok, false);
    if (!result.ok) assert.equal(result.status, 403);
  });

  it("accepts a matching token for protected reports", () => {
    const result = validateReportViewerAccessRecord(
      {
        access_token: "secret-token",
        token_expires_at: new Date(Date.now() + 60_000).toISOString(),
      },
      " SECRET-TOKEN ",
    );

    assert.equal(result.ok, true);
  });

  it("keeps historical access for reports without a stored token", () => {
    const result = validateReportViewerAccessRecord({ access_token: null }, "");

    assert.equal(result.ok, true);
  });
});

describe("listReportVersions", () => {
  it("does not select full payload snapshots for the timeline list", async () => {
    let selected = "";
    const supabase = {
      from(table: string) {
        assert.equal(table, "report_versions");
        return {
          select(columns: string) {
            selected = columns;
            return this;
          },
          eq() {
            return this;
          },
          order() {
            return this;
          },
          limit() {
            return Promise.resolve({ data: [], error: null });
          },
        };
      },
    } as unknown as SupabaseClient;

    const result = await listReportVersions(supabase, "report-id");

    assert.deepEqual(result, { rows: [] });
    assert.doesNotMatch(selected, /\bpayload\b/);
  });
});
