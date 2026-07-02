/**
 * Indices terrain sur `photos` — n'influencent pas observation_id ni report_photo_selection.
 */
export type PhotoCaptureMode = "camera" | "bulk_import";

export type PhotoCaptureContext = {
  capture_mode: PhotoCaptureMode;
  original_timestamp: string | null;
  sequence_number: number | null;
};

export function parseCaptureMode(raw: unknown): PhotoCaptureMode | null {
  return raw === "camera" || raw === "bulk_import" ? raw : null;
}

export function parseOriginalTimestamp(raw: unknown): string | null {
  if (raw == null || raw === "") return null;
  if (typeof raw !== "string" && typeof raw !== "number") return null;
  const d = new Date(typeof raw === "number" ? raw : raw.trim());
  return Number.isFinite(d.getTime()) ? d.toISOString() : null;
}

export function parseSequenceNumber(raw: unknown): number | null {
  if (raw == null || raw === "") return null;
  const n = typeof raw === "number" ? raw : Number.parseInt(String(raw).trim(), 10);
  if (!Number.isFinite(n) || n < 0) return null;
  return Math.trunc(n);
}

export function parsePhotoCaptureContextFromForm(form: FormData): PhotoCaptureContext | null {
  const mode = parseCaptureMode(form.get("capture_mode"));
  if (!mode) return null;
  return {
    capture_mode: mode,
    original_timestamp: parseOriginalTimestamp(form.get("original_timestamp")),
    sequence_number: parseSequenceNumber(form.get("sequence_number")),
  };
}

/** Contexte pour enrichir le prompt vision (parcours inspection, pas lien constat). */
export function formatCaptureContextForVisionPrompt(
  ctx: PhotoCaptureContext | null | undefined,
  language: "fr" | "en",
): string {
  if (!ctx) return "";
  const parts: string[] = [];
  if (language === "en") {
    parts.push(`Capture mode: ${ctx.capture_mode === "camera" ? "field camera" : "bulk import after visit"}.`);
    if (ctx.sequence_number != null) {
      parts.push(`Sequence in session/batch: ${ctx.sequence_number} (ordering hint only, not a finding link).`);
    }
    if (ctx.original_timestamp) {
      parts.push(`Original capture time: ${ctx.original_timestamp}.`);
    }
  } else {
    parts.push(
      `Mode de prise : ${ctx.capture_mode === "camera" ? "caméra terrain" : "import massif post-visite"}.`,
    );
    if (ctx.sequence_number != null) {
      parts.push(
        `Numéro de séquence dans la session ou le lot : ${ctx.sequence_number} (indice d'ordre uniquement, pas un lien constat).`,
      );
    }
    if (ctx.original_timestamp) {
      parts.push(`Heure de capture d'origine : ${ctx.original_timestamp}.`);
    }
  }
  return parts.join("\n");
}
