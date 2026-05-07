/**
 * Réduit le poids d’une data-URL image pour le stockage localStorage
 * (quota typique 5–10 Mo ; les JPEG plein cadre 4Mpx explosent le budget).
 */
export function compressDataUrlForStorage(
  dataUrl: string,
  maxEdge: number = 1000,
  quality = 0.72,
  mime: "image/jpeg" | "image/webp" = "image/jpeg",
): Promise<string> {
  if (!dataUrl.startsWith("data:image")) return Promise.resolve(dataUrl);
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const w = img.naturalWidth;
      const h = img.naturalHeight;
      if (w < 1 || h < 1) {
        resolve(dataUrl);
        return;
      }
      const scale = Math.min(1, maxEdge / Math.max(w, h));
      const tw = Math.max(1, Math.round(w * scale));
      const th = Math.max(1, Math.round(h * scale));
      const c = document.createElement("canvas");
      c.width = tw;
      c.height = th;
      const ctx = c.getContext("2d");
      if (!ctx) {
        resolve(dataUrl);
        return;
      }
      ctx.drawImage(img, 0, 0, tw, th);
      try {
        resolve(c.toDataURL(mime, quality));
      } catch {
        resolve(dataUrl);
      }
    };
    img.onerror = () => reject(new Error("Impossible de décoder l’image"));
    img.src = dataUrl;
  });
}
