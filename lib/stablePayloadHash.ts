import { createHash } from "crypto";

/**
 * Sérialisation JSON déterministe (clés triées) pour fingerprint stable du payload.
 */
export function stableStringify(value: unknown): string {
  if (value === null) return "null";
  const t = typeof value;
  if (t === "string" || t === "number" || t === "boolean") {
    return JSON.stringify(value);
  }
  if (t === "bigint") return JSON.stringify(Number(value));
  if (t === "undefined") return '"undefined"';
  if (Array.isArray(value)) {
    return `[${value.map((v) => stableStringify(v)).join(",")}]`;
  }
  if (t === "object") {
    const obj = value as Record<string, unknown>;
    const keys = Object.keys(obj).sort();
    const parts = keys.map(
      (k) => `${JSON.stringify(k)}:${stableStringify(obj[k])}`,
    );
    return `{${parts.join(",")}}`;
  }
  return JSON.stringify(String(value));
}

/** ETag faible (RFC 7232) pour revalidation conditionnelle de l’aperçu HTML. */
export function weakEtagForReportHtmlPreview(
  payload: Record<string, unknown>,
  reportId: string,
): string {
  const h = createHash("sha256")
    .update(stableStringify(payload), "utf8")
    .update("\n", "utf8")
    .update(reportId, "utf8")
    .digest("hex");
  return `W/"${h}"`;
}

function normalizeEtagToken(raw: string): string {
  let s = raw.trim();
  if (s.toLowerCase().startsWith("w/")) {
    s = s.slice(2).trim();
  }
  if (s.startsWith('"') && s.endsWith('"') && s.length >= 2) {
    s = s.slice(1, -1);
  }
  return s.toLowerCase();
}

/** `If-None-Match` peut contenir plusieurs ETags séparés par des virgules. */
export function ifNoneMatchPrecludesBody(
  requestHeader: string | null,
  etag: string,
): boolean {
  if (!requestHeader?.trim()) return false;
  const want = normalizeEtagToken(etag);
  const list = requestHeader.split(",").map((s) => normalizeEtagToken(s.trim()));
  return list.some((t) => t === "*" || t === want);
}
