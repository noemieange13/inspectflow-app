/**
 * Security regression tests for the legacy quick-inspection endpoint.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { resolve } from "node:path";

import { POST } from "@/app/api/create-inspection/route";

function jsonRequest(body: Record<string, unknown>): Request {
  return new Request("http://localhost/api/create-inspection", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      host: "localhost",
      origin: "http://localhost",
    },
    body: JSON.stringify(body),
  });
}

describe("/api/create-inspection security", () => {
  it("rejects the legacy quick-inspection payload instead of creating a tokenless report", async () => {
    const res = await POST(
      jsonRequest({
        clientName: "Client public",
        address: "123 Rue Exemple",
        inspectionType: "residential",
        language: "fr",
      }),
    );

    assert.equal(res.status, 400);
    const body = (await res.json()) as { success?: boolean; error?: string };
    assert.equal(body.success, false);
    assert.match(body.error ?? "", /Missing user_id/);
  });

  it("does not contain a direct service-role reports insert", () => {
    const source = readFileSync(
      resolve(process.cwd(), "app/api/create-inspection/route.ts"),
      "utf8",
    );

    assert.doesNotMatch(source, /createServiceRoleClient/);
    assert.doesNotMatch(source, /\.from\(["']reports["']\)\s*\.insert/s);
  });
});
