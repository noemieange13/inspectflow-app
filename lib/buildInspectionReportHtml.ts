/**
 * HTML minimal pour reports-pdf (payload.html), à partir de lignes defects / observations.
 * Colonnes tolérantes : schéma réel peut varier.
 */

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export type GenericRow = Record<string, unknown>;

export function buildInspectionReportHtml(
  defects: GenericRow[],
  observations: GenericRow[],
): string {
  const parts: string[] = [];
  parts.push(
    '<!DOCTYPE html><html lang="fr"><head><meta charset="utf-8"><title>Rapport</title></head><body>',
  );
  parts.push("<h1>Rapport d'inspection</h1>");

  if (defects.length > 0) {
    parts.push("<h2>Défauts</h2><ul>");
    for (const d of defects) {
      const title = String(d.title ?? d.category ?? "Élément");
      const desc = d.description != null ? String(d.description) : "";
      const sev = d.severity != null ? String(d.severity) : "";
      const rec =
        d.recommendation != null ? String(d.recommendation) : "";
      parts.push(
        `<li><strong>${escapeHtml(title)}</strong>` +
          (sev ? ` <em>(${escapeHtml(sev)})</em>` : "") +
          (desc ? `<br/>${escapeHtml(desc)}` : "") +
          (rec ? `<br/><small>${escapeHtml(rec)}</small>` : "") +
          `</li>`,
      );
    }
    parts.push("</ul>");
  }

  if (observations.length > 0) {
    parts.push("<h2>Observations</h2><ul>");
    for (const o of observations) {
      const bits = [
        o.categorie,
        o.element,
        o.probleme,
        o.gravite != null ? String(o.gravite) : null,
      ].filter((x) => x != null && String(x).length > 0);
      const line = bits.map((x) => String(x)).join(" — ");
      const rec =
        o.recommandation != null ? String(o.recommandation) : "";
      parts.push(
        `<li>${escapeHtml(line)}` +
          (rec ? `<br/><small>${escapeHtml(rec)}</small>` : "") +
          `</li>`,
      );
    }
    parts.push("</ul>");
  }

  parts.push("</body></html>");
  return parts.join("");
}

export function isHtmlLongEnough(html: string, min = 20): boolean {
  return typeof html === "string" && html.length >= min;
}
