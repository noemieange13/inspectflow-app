/**
 * EXIF utilities — extracts GPS coordinates, timestamp, orientation, and device
 * model from a File/Blob.  Uses exifr for reliable cross-browser parsing.
 * All failures are swallowed; caller always receives a (possibly empty) object.
 */

export interface ExifData {
  lat?: number;
  lng?: number;
  timestamp?: string;
  device?: string;
  orientation?: number;
}

/**
 * Parse EXIF metadata from an image File or Blob.
 * Returns an ExifData object; fields are undefined when not present in the file.
 */
export async function extractExif(file: File | Blob): Promise<ExifData> {
  try {
    // Dynamic import keeps exifr out of the critical path / SSR bundle.
    const exifr = await import("exifr");
    const parsed = await exifr.parse(file, {
      gps: true,
      tiff: true,
      exif: true,
      interop: false,
      ifd1: false,
      sanitize: true,
      reviveValues: true,
    });

    if (!parsed) return {};

    const result: ExifData = {};

    // GPS
    if (typeof parsed.latitude === "number" && Number.isFinite(parsed.latitude)) {
      result.lat = parsed.latitude;
    }
    if (typeof parsed.longitude === "number" && Number.isFinite(parsed.longitude)) {
      result.lng = parsed.longitude;
    }

    // Timestamp — prefer DateTimeOriginal, fall back to DateTime
    const dateRaw: unknown = parsed.DateTimeOriginal ?? parsed.DateTime ?? parsed.CreateDate;
    if (dateRaw instanceof Date && !isNaN(dateRaw.getTime())) {
      result.timestamp = dateRaw.toISOString();
    } else if (typeof dateRaw === "string" && dateRaw.length > 0) {
      // EXIF date strings: "YYYY:MM:DD HH:MM:SS"
      const normalized = dateRaw.replace(/^(\d{4}):(\d{2}):(\d{2})/, "$1-$2-$3");
      const d = new Date(normalized);
      if (!isNaN(d.getTime())) result.timestamp = d.toISOString();
    }

    // Device model
    const make: unknown = parsed.Make;
    const model: unknown = parsed.Model;
    if (typeof model === "string" && model.trim()) {
      const makeStr = typeof make === "string" && make.trim() ? make.trim() : "";
      const modelStr = model.trim();
      // Avoid duplicating the make if the model already starts with it
      result.device = makeStr && !modelStr.toLowerCase().startsWith(makeStr.toLowerCase())
        ? `${makeStr} ${modelStr}`
        : modelStr;
    }

    // Orientation (1-8 per EXIF spec)
    if (typeof parsed.Orientation === "number") {
      result.orientation = parsed.Orientation;
    }

    return result;
  } catch {
    // Graceful fallback — no EXIF data available
    return {};
  }
}

/**
 * Extract EXIF for multiple files in parallel.
 * Returns a Map keyed by file.name.
 */
export async function extractExifBatch(
  files: File[],
): Promise<Map<string, ExifData>> {
  const entries = await Promise.all(
    files.map(async (f) => {
      const data = await extractExif(f);
      return [f.name, data] as [string, ExifData];
    }),
  );
  return new Map(entries);
}

/**
 * Format compact GPS + time label for display under a thumbnail.
 * Example: "14:32 • 45.5°N 73.6°W"
 */
export function formatExifLabel(data: ExifData): string | null {
  const parts: string[] = [];

  if (data.timestamp) {
    try {
      const d = new Date(data.timestamp);
      const h = d.getHours().toString().padStart(2, "0");
      const m = d.getMinutes().toString().padStart(2, "0");
      parts.push(`${h}:${m}`);
    } catch { /* ignore */ }
  }

  if (data.lat !== undefined && data.lng !== undefined) {
    const latStr = `${Math.abs(data.lat).toFixed(1)}°${data.lat >= 0 ? "N" : "S"}`;
    const lngStr = `${Math.abs(data.lng).toFixed(1)}°${data.lng >= 0 ? "E" : "W"}`;
    parts.push(`${latStr} ${lngStr}`);
  }

  return parts.length > 0 ? parts.join(" • ") : null;
}
