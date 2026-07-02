export type DeliveryTimelineEntry = {
  id: string;
  label: string;
  at: string;
};

export type RawDeliveryTimelineRow = {
  id: string;
  event_type: string;
  metadata?: Record<string, unknown> | null;
  created_at: string;
};

export function formatDeliveryTimelineDate(iso: string, language: "fr" | "en" = "fr"): string {
  try {
    return new Date(iso).toLocaleString(language === "en" ? "en-CA" : "fr-CA", {
      dateStyle: "medium",
      timeStyle: "short",
    });
  } catch {
    return iso;
  }
}

export function mapAuditRowToTimelineEntry(
  row: RawDeliveryTimelineRow,
  language: "fr" | "en" = "fr",
): DeliveryTimelineEntry | null {
  const meta = row.metadata ?? {};
  const action = typeof meta.action === "string" ? meta.action : "";

  if (row.event_type === "pdf_generated") {
    return {
      id: row.id,
      at: row.created_at,
      label: language === "en" ? "Report created" : "Rapport créé",
    };
  }

  if (row.event_type === "inspector_modified" && action === "report_sent_to_client") {
    return {
      id: row.id,
      at: row.created_at,
      label: language === "en" ? "Sent to client" : "Envoyé au client",
    };
  }

  return null;
}

export function buildDeliveryTimeline(
  rows: RawDeliveryTimelineRow[],
  opts?: { reportCreatedAt?: string | null; language?: "fr" | "en" },
): DeliveryTimelineEntry[] {
  const language = opts?.language ?? "fr";
  const mapped = rows
    .map((row) => mapAuditRowToTimelineEntry(row, language))
    .filter((e): e is DeliveryTimelineEntry => e !== null);

  if (opts?.reportCreatedAt) {
    const hasCreated = mapped.some((e) => e.label.includes("Rapport") || e.label.includes("Report"));
    if (!hasCreated) {
      mapped.unshift({
        id: "report-created",
        at: opts.reportCreatedAt,
        label: language === "en" ? "Inspection started" : "Inspection démarrée",
      });
    }
  }

  return mapped.sort((a, b) => new Date(a.at).getTime() - new Date(b.at).getTime());
}
