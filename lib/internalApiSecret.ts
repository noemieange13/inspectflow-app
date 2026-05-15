import { timingSafeEqual } from "crypto";

export type InternalApiSecretResult =
  | { ok: true }
  | {
      ok: false;
      status: 401 | 503;
      code: "internal_secret_missing" | "unauthorized";
      error: string;
    };

function secretsMatch(provided: string, expected: string): boolean {
  const providedBuffer = Buffer.from(provided);
  const expectedBuffer = Buffer.from(expected);
  return (
    providedBuffer.length === expectedBuffer.length &&
    timingSafeEqual(providedBuffer, expectedBuffer)
  );
}

/**
 * Fail-closed guard for server-only route handlers that can spend provider
 * credits or write with the Supabase service role.
 */
export function requireInternalApiSecret(req: Request): InternalApiSecretResult {
  const expected = process.env.TRIGGER_INSPECTION_SECRET?.trim();
  if (!expected) {
    return {
      ok: false,
      status: 503,
      code: "internal_secret_missing",
      error: "TRIGGER_INSPECTION_SECRET is not configured",
    };
  }

  const provided = req.headers.get("x-trigger-secret")?.trim() ?? "";
  if (!provided || !secretsMatch(provided, expected)) {
    return {
      ok: false,
      status: 401,
      code: "unauthorized",
      error: "Unauthorized",
    };
  }

  return { ok: true };
}
