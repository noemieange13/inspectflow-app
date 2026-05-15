import assert from "node:assert/strict";
import { afterEach, test } from "node:test";

import { POST as createInspectionPost } from "../app/api/create-inspection/route";
import { POST as photoClassifyPost } from "../app/api/smart-inspect/photo-classify/route";
import { requireInternalApiSecret } from "../lib/internalApiSecret";

const originalTriggerSecret = process.env.TRIGGER_INSPECTION_SECRET;
const originalOpenAiKey = process.env.OPENAI_API_KEY;
const originalFetch = globalThis.fetch;

afterEach(() => {
  if (originalTriggerSecret === undefined) {
    delete process.env.TRIGGER_INSPECTION_SECRET;
  } else {
    process.env.TRIGGER_INSPECTION_SECRET = originalTriggerSecret;
  }

  if (originalOpenAiKey === undefined) {
    delete process.env.OPENAI_API_KEY;
  } else {
    process.env.OPENAI_API_KEY = originalOpenAiKey;
  }

  globalThis.fetch = originalFetch;
});

test("internal API secret guard fails closed when no secret is configured", () => {
  delete process.env.TRIGGER_INSPECTION_SECRET;

  const result = requireInternalApiSecret(
    new Request("https://example.test/api/create-inspection", { method: "POST" }),
  );

  assert.deepEqual(result, {
    ok: false,
    status: 503,
    code: "internal_secret_missing",
    error: "TRIGGER_INSPECTION_SECRET is not configured",
  });
});

test("create-inspection rejects anonymous service-role writes before parsing the body", async () => {
  process.env.TRIGGER_INSPECTION_SECRET = "expected-secret";

  const req = new Request("https://example.test/api/create-inspection", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ clientName: "Mallory" }),
  });

  const res = await createInspectionPost(
    req as Parameters<typeof createInspectionPost>[0],
  );
  const body = (await res.json()) as Record<string, unknown>;

  assert.equal(res.status, 401);
  assert.equal(body.code, "unauthorized");
});

test("photo-classify rejects anonymous OpenAI proxy requests before calling fetch", async () => {
  process.env.TRIGGER_INSPECTION_SECRET = "expected-secret";
  process.env.OPENAI_API_KEY = "sk-test";
  let fetchCalled = false;
  globalThis.fetch = (async () => {
    fetchCalled = true;
    throw new Error("OpenAI fetch should not be called");
  }) as typeof fetch;

  const req = new Request("https://example.test/api/smart-inspect/photo-classify", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      sections: ["Toiture"],
      photos: [{ name: "roof.jpg", dataUrl: "data:image/jpeg;base64,aaaa" }],
    }),
  });

  const res = await photoClassifyPost(
    req as Parameters<typeof photoClassifyPost>[0],
  );
  const body = (await res.json()) as Record<string, unknown>;

  assert.equal(res.status, 401);
  assert.equal(body.code, "unauthorized");
  assert.equal(fetchCalled, false);
});
