/**
 * Cache synchrone bucket+path → URL publique (évite `getPublicUrl` répétés en grille).
 */
const publicUrlByBucketAndPath = new Map<string, string>();

export function getCachedPublicUrl(
  bucket: string,
  path: string,
  resolver: (objectPath: string) => string | null,
): string | null {
  const key = `${bucket}\0${path}`;
  const cached = publicUrlByBucketAndPath.get(key);
  if (cached) return cached;
  const url = resolver(path);
  if (url) publicUrlByBucketAndPath.set(key, url);
  return url ?? null;
}

/** Tests, changement de compte, ou après modification de bucket / env. */
export function clearPublicUrlCache(): void {
  publicUrlByBucketAndPath.clear();
}
