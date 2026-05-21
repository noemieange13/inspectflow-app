import assert from "node:assert/strict";
import { Buffer } from "node:buffer";
import { describe, it } from "node:test";

import {
  parseBasicAuthHeader,
  requireReportVersionListAccess,
} from "@/lib/reportVersionListAccess";

const MAX_VERSIONS = 50;

function basic(user: string, pass: string): string {
  return `Basic ${Buffer.from(`${user}:${pass}`).toString("base64")}`;
}

describe("report version list access", () => {
  it("rejects an arbitrary non-empty token for a token-protected report", () => {
    const result = requireReportVersionListAccess({
      report: { access_token: "correct-token", token_expires_at: null },
      accessTokenRaw: "wrong-token",
      authHeader: null,
      env: {},
      maxVersions: MAX_VERSIONS,
    });

    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.equal(result.status, 403);
      assert.equal(result.body.error, "INVALID_ACCESS_TOKEN");
    }
  });

  it("accepts the stored report access token", () => {
    const result = requireReportVersionListAccess({
      report: { access_token: "Correct-Token", token_expires_at: null },
      accessTokenRaw: " correct-token ",
      authHeader: null,
      env: {},
      maxVersions: MAX_VERSIONS,
    });

    assert.deepEqual(result, { ok: true, via: "token" });
  });

  it("does not treat client tokens as valid for legacy tokenless reports", () => {
    const result = requireReportVersionListAccess({
      report: { access_token: null, token_expires_at: null },
      accessTokenRaw: "anything",
      authHeader: null,
      env: {},
      maxVersions: MAX_VERSIONS,
    });

    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.equal(result.status, 401);
      assert.equal(result.body.error, "ADMIN_AUTH_MISSING");
    }
  });

  it("allows legacy tokenless reports through configured admin auth", () => {
    const result = requireReportVersionListAccess({
      report: { access_token: null, token_expires_at: null },
      accessTokenRaw: "anything",
      authHeader: basic("admin", "secret"),
      env: { DASHBOARD_USER: "admin", DASHBOARD_PASS: "secret" },
      maxVersions: MAX_VERSIONS,
    });

    assert.deepEqual(result, { ok: true, via: "admin" });
  });

  it("rejects expired report access tokens", () => {
    const result = requireReportVersionListAccess({
      report: {
        access_token: "correct-token",
        token_expires_at: "2000-01-01T00:00:00.000Z",
      },
      accessTokenRaw: "correct-token",
      authHeader: null,
      env: {},
      maxVersions: MAX_VERSIONS,
    });

    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.equal(result.status, 403);
      assert.equal(result.body.error, "ACCESS_TOKEN_EXPIRED");
    }
  });

  it("parses basic auth passwords containing colons", () => {
    assert.deepEqual(parseBasicAuthHeader(basic("admin", "sec:ret")), {
      user: "admin",
      pass: "sec:ret",
    });
  });
});
