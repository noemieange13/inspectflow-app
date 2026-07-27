/**
 * Storage object keys for inspection notes must live under notes/<report_id>/.
 * Rejects path traversal and cross-report keys before service-role download.
 */
export function isOwnedInspectionNotePath(
  objectPath: string,
  reportId: string,
): boolean {
  const id = reportId.trim();
  if (!id) return false;

  const normalized = objectPath.trim().replace(/^\/+/, "");
  if (!normalized || normalized.includes("..") || normalized.includes("\\")) {
    return false;
  }

  const prefix = `notes/${id}/`;
  if (!normalized.startsWith(prefix)) return false;

  // Flat object under the report folder (matches upload path in process-notes route).
  const rest = normalized.slice(prefix.length);
  return rest.length > 0 && !rest.includes("/");
}
