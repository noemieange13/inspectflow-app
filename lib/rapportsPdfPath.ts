/**
 * Clé objet dans le bucket Supabase `rapports-pdf` (sans nom de bucket).
 * À utiliser à l’upload et pour `reports.pdf_path` — doit matcher le fichier dans Storage.
 *
 * Si `reportId` contient déjà `.pdf` (bug fréquent), on évite `…​.pdf.pdf`.
 */
export function rapportsPdfStorageKey(userId: string, reportId: string): string {
  const uid = userId.trim();
  const rid = reportId.trim().replace(/\.pdf$/i, "");
  return `${uid}/${rid}.pdf`;
}
