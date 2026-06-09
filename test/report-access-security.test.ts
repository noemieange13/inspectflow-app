import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";

import { authorizeReportVersionsList } from "@/app/api/report-versions/list/route";
import { validateReportViewerAccessRecord } from "@/lib/reportViewerAccess";

const originalDashboardUser = process.env.DASHBOARD_USER;
const originalDashboardPass = process.env.DASHBOARD_PASS;

afterEach(() => {
  process.env.DASHBOARD_USER = originalDashboardUser;
  process.env.DASHBOARD_PASS = originalDashboardPass;
});

function requestWithBasicAuth(user: string, pass: string): Request {
  const encoded = Buffer.from(`${user}:${pass}`, "utf8").toString("base64");
  return new Request("https://inspectflow.test/api/report-versions/list", {
    method: "POST",
    headers: { authorization: `Basic ${encoded}` },
  });
}

describe("validateReportViewerAccessRecord", () => {
  it("denies protected reports when the viewer token is missing", () => {
    const result = validateReportViewerAccessRecord(undefined, {
      access_token: "secret-token",
      token_expires_at: null,
    });

    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.equal(result.status, 403);
      assert.equal(result.body.code, "access_denied");
    }
  });

  it("accepts the matching report token", () => {
    const result = validateReportViewerAccessRecord(" SECRET-token ", {
      access_token: "secret-token",
      token_expires_at: null,
    });

    assert.equal(result.ok, true);
  });

  it("denies expired report tokens", () => {
    const result = validateReportViewerAccessRecord("secret-token", {
      access_token: "secret-token",
      token_expires_at: "2000-01-01T00:00:00.000Z",
    });

    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.equal(result.status, 403);
      assert.equal(result.body.error, "Access token expired");
    }
  });
});

describe("authorizeReportVersionsList", () => {
  it("rejects an arbitrary non-empty token for a protected report", async () => {
    const response = authorizeReportVersionsList(
      new Request("https://inspectflow.test/api/report-versions/list", { method: "POST" }),
      "anything",
      { access_token: "real-token", token_expires_at: null },
      50,
    );

    assert.ok(response);
    assert.equal(response.status, 403);
    const body = await response.json();
    assert.equal(body.error, "Invalid access token");
    assert.deepEqual(body.data, []);
  });

  it("allows the matching token for a protected report without admin auth", () => {
    const response = authorizeReportVersionsList(
      new Request("https://inspectflow.test/api/report-versions/list", { method: "POST" }),
      "real-token",
      { access_token: "real-token", token_expires_at: null },
      50,
    );

    assert.equal(response, null);
  });

  it("requires admin auth when the report has no stored token", async () => {
    const response = authorizeReportVersionsList(
      new Request("https://inspectflow.test/api/report-versions/list", { method: "POST" }),
      "anything",
      { access_token: null, token_expires_at: null },
      50,
    );

    assert.ok(response);
    assert.equal(response.status, 401);
    const body = await response.json();
    assert.equal(body.error, "ADMIN_AUTH_MISSING");
  });

  it("allows legacy tokenless reports only with valid admin auth", () => {
    process.env.DASHBOARD_USER = "admin";
    process.env.DASHBOARD_PASS = "pass";

    const response = authorizeReportVersionsList(
      requestWithBasicAuth("admin", "pass"),
      "",
      { access_token: null, token_expires_at: null },
      50,
    );

    assert.equal(response, null);
  });
});
