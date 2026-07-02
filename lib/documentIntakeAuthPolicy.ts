/**
 * Pilot #0.8 — scoped auth policy for document intake (not global auth removal).
 *
 * Tier 1 — analyze preview:
 *   Route: /api/inspection-document-intake/parse
 *   - No authenticated user required
 *   - No database write
 *   - Temporary in-memory extraction returned to client
 *
 * Tier 2 — create inspection:
 *   Route: /api/inspector/create-inspection
 *   - Authenticated user required (never anonymous)
 *   - Database write allowed (reports insert)
 */
export const DOCUMENT_INTAKE_ANALYZE_ROUTE = "/api/inspection-document-intake/parse";

export const DOCUMENT_INTAKE_CREATE_ROUTE = "/api/inspector/create-inspection";

export type DocumentIntakeAuthTier = "analyze_preview" | "create_inspection";

export const DOCUMENT_INTAKE_AUTH_POLICY = {
  analyze_preview: {
    route: DOCUMENT_INTAKE_ANALYZE_ROUTE,
    userRequired: false,
    databaseWrite: false,
    temporaryResultOnly: true,
  },
  create_inspection: {
    route: DOCUMENT_INTAKE_CREATE_ROUTE,
    userRequired: true,
    databaseWrite: true,
    temporaryResultOnly: false,
  },
} as const;

export function isAnalyzePreviewRoute(route: string): boolean {
  return route === DOCUMENT_INTAKE_ANALYZE_ROUTE;
}

export function isCreateInspectionRoute(route: string): boolean {
  return route === DOCUMENT_INTAKE_CREATE_ROUTE;
}
