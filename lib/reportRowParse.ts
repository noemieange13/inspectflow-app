/**
 * Lecture défensive des colonnes viewer / notif depuis une ligne `reports`
 * (types PostgREST / vues / JSON peuvent varier).
 */
export function parseClientEmailFromRow(
  row: Record<string, unknown>,
): string | null {
  const v = row.client_email;
  if (typeof v === "string" && v.trim()) return v.trim();
  return null;
}

/**
 * `first_view_notified` attendu boolean ; tolère quelques formes string héritées.
 */
export function parseFirstViewNotifiedFromRow(
  row: Record<string, unknown>,
): boolean | null {
  return coerceFirstViewNotified(row.first_view_notified);
}

function coerceFirstViewNotified(v: unknown): boolean | null {
  if (v === true || v === false) return v;
  if (v === "true" || v === "t" || v === "1") return true;
  if (v === "false" || v === "f" || v === "0") return false;
  return null;
}
