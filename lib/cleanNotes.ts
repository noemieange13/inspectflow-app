/**
 * Post-traitement léger après OCR / transcription (réduction bruit, répétitions évidentes).
 */
export function cleanNotes(text: string): string {
  let s = text.replace(/\r\n/g, "\n").replace(/\n{3,}/g, "\n\n");
  s = s.replace(/[ \t\f\v]+/g, " ");
  s = s.replace(/\s+\n/g, "\n").replace(/\n\s+/g, "\n");

  const parts = s.split(/\n/).map((l) => l.trim()).filter(Boolean);
  const seen = new Set<string>();
  const out: string[] = [];
  for (const line of parts) {
    const key = line.slice(0, 160).toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(line);
  }

  return out.join("\n").trim();
}
