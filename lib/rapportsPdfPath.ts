/**
 * Clé objet dans le bucket Supabase `rapports-pdf` (sans nom de bucket).
 * À utiliser à l’upload et pour `reports.pdf_path` — doit matcher le fichier dans Storage.
 */
export function rapportsPdfStorageKey(userId: string, reportId: string): string {
  return `${userId.trim()}/${reportId.trim()}.pdf`;
}
