import assert from "node:assert/strict";
import { test } from "node:test";

import { checkReportAccessToken } from "@/lib/reportAccessGuard";

test("allows legacy reports without access tokens", () => {
  assert.deepEqual(checkReportAccessToken({}, ""), { ok: true });
});

test("denies token-protected reports when the request omits the token", () => {
  assert.deepEqual(
    checkReportAccessToken({ access_token: "abc123" }, ""),
    { ok: false, error: "Invalid access token" },
  );
});

test("accepts matching tokens using the same normalization as viewer URLs", () => {
  assert.deepEqual(
    checkReportAccessToken({ access_token: "ABC123" }, "abc123"),
    { ok: true },
  );
});

test("denies expired report access tokens", () => {
  assert.deepEqual(
    checkReportAccessToken(
      {
        access_token: "abc123",
        token_expires_at: "2026-05-16T10:00:00.000Z",
      },
      "abc123",
      new Date("2026-05-16T11:00:00.000Z"),
    ),
    { ok: false, error: "Access token expired" },
  );
});
