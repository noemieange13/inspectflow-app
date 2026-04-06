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

/** Nom de fichier seul (sans dossier) — ignorer le nom d’origine du fichier uploadé. */
export function rapportGeneratedFileName(): string {
  return `rapport-${Date.now()}.pdf`;
}

/**
 * `pdf_path` = exactement la clé Storage : `${user_id}/${fileName}`.
 * `fileName` = segment final uniquement (ex. `rapport-173….pdf`), pas de `/` ni `..`.
 */
export function rapportsPdfObjectPath(userId: string, fileName: string): string {
  const uid = userId.trim();
  const base = fileName.trim().replace(/^\/+/, "");
  if (!base || base.includes("/") || base.includes("\\") || base.includes("..")) {
    throw new Error("rapportsPdfObjectPath: fileName invalide");
  }
  if (!base.toLowerCase().endsWith(".pdf")) {
    throw new Error("rapportsPdfObjectPath: le fichier doit finir par .pdf");
  }
  return `${uid}/${base}`;
}
