/**
 * Encode binary to base64 without spreading a large TypedArray into
 * `String.fromCharCode`. Full-buffer spread throws RangeError above ~200 KiB
 * (V8 / Deno) — typical phone photos and voice memos.
 * Keep in sync with `lib/bytesToBase64.ts`.
 */
const FROM_CHAR_CODE_CHUNK = 0x8000;

export function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  for (let i = 0; i < bytes.length; i += FROM_CHAR_CODE_CHUNK) {
    const slice = bytes.subarray(i, i + FROM_CHAR_CODE_CHUNK);
    binary += String.fromCharCode(...slice);
  }
  return btoa(binary);
}
