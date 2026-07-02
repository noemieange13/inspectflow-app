export const OFFLINE_DEV_USER_MESSAGE =
  "Supabase is unavailable. Running in Offline Development Mode.";

export function isSupabaseNetworkError(error: unknown): boolean {
  if (!error) return false;
  const parts: string[] = [];
  if (error instanceof Error) {
    parts.push(error.message, error.name);
    const cause = (error as { cause?: unknown }).cause;
    if (cause instanceof Error) {
      parts.push(cause.message, cause.name);
    } else if (typeof cause === "object" && cause && "code" in cause) {
      parts.push(String((cause as { code?: unknown }).code));
    }
  } else if (typeof error === "object" && error !== null) {
    const o = error as Record<string, unknown>;
    if (typeof o.message === "string") parts.push(o.message);
    if (typeof o.code === "string") parts.push(o.code);
    const cause = o.cause;
    if (cause instanceof Error) {
      parts.push(cause.message, cause.name);
    } else if (typeof cause === "object" && cause && "code" in cause) {
      parts.push(String((cause as { code?: unknown }).code));
    }
  } else {
    parts.push(String(error));
  }
  const text = parts.join(" ").toLowerCase();
  return (
    text.includes("enotfound") ||
    text.includes("econnrefused") ||
    text.includes("etimedout") ||
    text.includes("fetch failed") ||
    text.includes("network") ||
    text.includes("getaddrinfo") ||
    text.includes("connect timeout") ||
    text.includes("socket hang up") ||
    text.includes("failed to fetch")
  );
}

/** Message API lisible — jamais `[object Object]`. */
export function formatApiErrorMessage(error: unknown, fallback = "Unexpected error"): string {
  if (error instanceof Error && error.message.trim()) {
    return error.message.trim();
  }
  if (typeof error === "object" && error !== null) {
    const o = error as Record<string, unknown>;
    if (typeof o.message === "string" && o.message.trim()) return o.message.trim();
    if (typeof o.error === "string" && o.error.trim()) return o.error.trim();
    if (typeof o.error_description === "string" && o.error_description.trim()) {
      return o.error_description.trim();
    }
    try {
      const serialized = JSON.stringify(error);
      if (serialized && serialized !== "{}" && serialized !== "[]") return serialized.slice(0, 500);
    } catch {
      /* ignore */
    }
  }
  if (typeof error === "string" && error.trim()) return error.trim();
  return fallback;
}
