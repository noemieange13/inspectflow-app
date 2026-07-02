export function trimStr(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const t = v.trim();
  return t.length ? t : null;
}

export function isDirectImageUrl(s: string): boolean {
  return (
    s.startsWith("http://") ||
    s.startsWith("https://") ||
    s.startsWith("data:") ||
    s.startsWith("blob:")
  );
}

/** `photo_url` en base : seulement les URLs complètes (`http` couvre http + https). */
export function isTrustedDbPhotoUrl(s: string): boolean {
  return s.startsWith("http");
}
