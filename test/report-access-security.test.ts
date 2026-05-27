import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { validateReportAccessRow } from "@/lib/assertReportAccessForApi";
import { assertReportViewerAccess } from "@/lib/reportViewerAccess";

type FakeReportRow = {
  access_token?: string | null;
  token_expires_at?: string | null;
};

function fakeSupabaseForReport(row: FakeReportRow | null, error: Error | null = null) {
  return {
    from(table: string) {
      assert.equal(table, "reports");
      return {
        select() {
          return {
            eq() {
              return {
                async maybeSingle() {
                  return { data: row, error };
                },
              };
            },
          };
        },
      };
    },
  };
}

describe("report access token gates", () => {
  it("rejects missing tokens for token-protected report rows", () => {
    const result = validateReportAccessRow("report-1", "", {
      access_token: "secret-token",
      token_expires_at: null,
    });

    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.equal(result.status, 403);
      assert.equal(result.code, "access_denied");
    }
  });

  it("accepts the matching token for token-protected report rows", () => {
    const result = validateReportAccessRow("report-1", " Secret-Token ", {
      access_token: "secret-token",
      token_expires_at: null,
    });

    assert.equal(result.ok, true);
  });

  it("keeps legacy reports without stored tokens accessible by id", () => {
    const result = validateReportAccessRow("report-1", "", {
      access_token: null,
      token_expires_at: null,
    });

    assert.equal(result.ok, true);
  });

  it("shared viewer assertion rejects missing tokens before service-role work", async () => {
    const result = await assertReportViewerAccess(
      fakeSupabaseForReport({
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
});
