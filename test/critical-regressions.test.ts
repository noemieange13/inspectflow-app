import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";

import { validateReportViewerToken } from "@/lib/reportViewerServer";

const REPORT_ID = "11111111-1111-4111-8111-111111111111";

function assertDenied(
  row: Record<string, unknown>,
  viewerToken: string | undefined,
): void {
  const result = validateReportViewerToken(REPORT_ID, row, viewerToken);
  assert.equal(result?.accessDenied, true);
  assert.equal(result?.payload, null);
}

describe("report viewer access", () => {
  it("denies a token-protected report when the URL token is missing", () => {
    assertDenied({ access_token: "secret-token" }, undefined);
  });

  it("denies a token-protected report when the URL token is wrong", () => {
    assertDenied({ access_token: "secret-token" }, "wrong-token");
  });

  it("denies report rows that do not have a stored viewer token", () => {
    assertDenied({ access_token: null }, undefined);
  });

  it("denies expired viewer tokens", () => {
    assertDenied(
      {
        access_token: "secret-token",
        token_expires_at: "2000-01-01T00:00:00.000Z",
      },
      "secret-token",
    );
  });

  it("allows a matching, unexpired viewer token", () => {
    const result = validateReportViewerToken(
      REPORT_ID,
      {
        access_token: "secret-token",
        token_expires_at: "2999-01-01T00:00:00.000Z",
      },
      "secret-token",
    );
    assert.equal(result, null);
  });
});

describe("deprecated create-inspection endpoint", () => {
  it("does not use the service role client or insert reports directly", () => {
    const source = readFileSync(
      join(process.cwd(), "app/api/create-inspection/route.ts"),
      "utf8",
    );

    assert.doesNotMatch(source, /createServiceRoleClient/);
    assert.doesNotMatch(source, /\.from\(["']reports["']\)/);
    assert.doesNotMatch(source, /\.insert\(/);
  });
});
