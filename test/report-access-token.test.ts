import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  reportAccessTokensMatch,
  validateReportAccessToken,
} from "@/lib/reportAccessToken";

describe("report access token validation", () => {
  it("keeps legacy open access when the report has no stored token", () => {
    assert.deepEqual(
      validateReportAccessToken({
        accessTokenRaw: undefined,
        dbTokenRaw: "",
      }),
      { ok: true },
    );
  });

  it("rejects missing viewer tokens when the report stores an access token", () => {
    assert.deepEqual(
      validateReportAccessToken({
        accessTokenRaw: undefined,
        dbTokenRaw: "secret-token",
      }),
      { ok: false, reason: "invalid" },
    );
  });

  it("rejects mismatched viewer tokens", () => {
    assert.deepEqual(
      validateReportAccessToken({
        accessTokenRaw: "wrong-token",
        dbTokenRaw: "secret-token",
      }),
      { ok: false, reason: "invalid" },
    );
  });

  it("rejects expired matching tokens", () => {
    assert.deepEqual(
      validateReportAccessToken({
        accessTokenRaw: "secret-token",
        dbTokenRaw: "secret-token",
        tokenExpiresAt: "2000-01-01T00:00:00.000Z",
      }),
      { ok: false, reason: "expired" },
    );
  });

  it("accepts a current matching token using existing normalization rules", () => {
    assert.equal(reportAccessTokensMatch("Secret%20Token", " secret token "), true);
    assert.deepEqual(
      validateReportAccessToken({
        accessTokenRaw: "Secret%20Token",
        dbTokenRaw: " secret token ",
        tokenExpiresAt: "2999-01-01T00:00:00.000Z",
      }),
      { ok: true },
    );
  });
});
