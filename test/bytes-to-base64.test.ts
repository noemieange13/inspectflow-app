/**
 * `npm run test:bytes-to-base64`
 * Locks the chunked encoder used by Edge `process-notes` (OCR / Whisper).
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { bytesToBase64 } from "@/lib/bytesToBase64";

describe("bytesToBase64", () => {
  it("matches Buffer encoding for small payloads", () => {
    const bytes = new Uint8Array([0, 1, 2, 254, 255, 65, 66, 67]);
    assert.equal(bytesToBase64(bytes), Buffer.from(bytes).toString("base64"));
  });

  it("encodes a 300 KiB buffer without RangeError (phone-photo class)", () => {
    const bytes = new Uint8Array(300 * 1024);
    for (let i = 0; i < bytes.length; i++) bytes[i] = i % 256;
    const encoded = bytesToBase64(bytes);
    assert.equal(encoded, Buffer.from(bytes).toString("base64"));
  });

  it("encodes a 1.5 MiB buffer without RangeError (voice-memo class)", () => {
    const bytes = new Uint8Array(1.5 * 1024 * 1024);
    bytes.fill(0x5a);
    const encoded = bytesToBase64(bytes);
    assert.equal(encoded, Buffer.from(bytes).toString("base64"));
  });

  it("documents that naive spread crashes above ~200 KiB", () => {
    const bytes = new Uint8Array(200 * 1024);
    bytes.fill(65);
    assert.throws(() => String.fromCharCode(...bytes), RangeError);
  });
});
