/**
 * Encode binary to base64 without `String.fromCharCode(...bytes)` on the full
 * buffer. Spreading a TypedArray larger than ~200 KiB throws
 * `RangeError: Maximum call stack size exceeded` (V8 / Deno).
 * Phone photos and voice memos routinely exceed that.
 */
const FROM_CHAR_CODE_CHUNK = 0x8000;

export function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  for (let i = 0; i < bytes.length; i += FROM_CHAR_CODE_CHUNK) {
    const slice = bytes.subarray(i, i + FROM_CHAR_CODE_CHUNK);
    binary += String.fromCharCode(...slice);
  }
  if (typeof btoa === "function") {
    return btoa(binary);
  }
  return Buffer.from(binary, "binary").toString("base64");
}
