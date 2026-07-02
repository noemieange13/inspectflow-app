/**
 * Pilot #0.8 — dev-only auth trace for document intake routes.
 */
export type DocumentAuthSource = "supabase" | "cookie" | "client" | "none";

export type DocumentAuthTrace = {
  route: string;
  hasSession: boolean;
  hasUser: boolean;
  userId: string | null;
  authSource: DocumentAuthSource;
};

export function isDocumentAuthTraceEnabled(): boolean {
  return process.env.NODE_ENV === "development";
}

export function traceDocumentAuthFlow(trace: DocumentAuthTrace): void {
  if (!isDocumentAuthTraceEnabled()) return;
  console.debug("[AUTH TRACE DOCUMENT FLOW]", trace);
}
