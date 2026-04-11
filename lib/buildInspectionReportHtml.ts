/**
 * HTML minimal pour reports-pdf (payload.html), à partir de lignes defects / observations.
 * Colonnes tolérantes : schéma réel peut varier.
 */

/** Évite l’injection HTML lorsque le contenu vient du payload (titres, libellés, etc.). */
export function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function statusCssClass(status: string): "ok" | "warn" | "bad" {
  if (status === "OK") return "ok";
  if (status === "À réparer" || /répar/i.test(status)) return "warn";
  return "bad";
}

type SectionItem = { label?: unknown; status?: unknown };
type Section = { title?: unknown; items?: unknown };

/**
 * Produit un HTML utilisable par `reports-pdf` à partir du JSON `reports.payload`.
 * Priorité : `payload.html` déjà valide → sinon `payload.sections` → sinon défauts / observations.
 * Tout texte interpolé est échappé.
 */
export function buildHtmlFromReportPayload(
  payload: Record<string, unknown> | null | undefined,
): string | null {
  if (!payload || typeof payload !== "object") return null;

  const direct = payload.html;
  if (typeof direct === "string" && isHtmlLongEnough(direct)) {
    return direct;
  }

  const sectionsRaw = payload.sections;
  if (Array.isArray(sectionsRaw) && sectionsRaw.length > 0) {
    const parts: string[] = [];
    parts.push(
      '<!DOCTYPE html><html lang="fr"><head><meta charset="utf-8"><title>Rapport</title>',
    );
    parts.push(
      "<style>body{font-family:Arial,sans-serif;padding:40px}h1{font-size:26px}h2{font-size:18px}h3{font-size:16px}.ok{color:green}.warn{color:orange}.bad{color:red}</style>",
    );
    parts.push("</head><body>");

    const title =
      typeof payload.title === "string" && payload.title.trim()
        ? payload.title
        : "Rapport";
    parts.push(`<h1>${escapeHtml(title)}</h1>`);

    if (payload.score != null && String(payload.score).length > 0) {
      parts.push(`<h2>Score : ${escapeHtml(String(payload.score))}</h2>`);
    }

    for (const sec of sectionsRaw) {
      if (!sec || typeof sec !== "object") continue;
      const s = sec as Section;
      const secTitle = s.title != null ? String(s.title) : "";
      parts.push(`<h3>${escapeHtml(secTitle)}</h3><ul>`);
      const items = Array.isArray(s.items) ? s.items : [];
      for (const item of items) {
        if (!item || typeof item !== "object") continue;
        const it = item as SectionItem;
        const label = it.label != null ? String(it.label) : "";
        const status = it.status != null ? String(it.status) : "";
        const cls = statusCssClass(status);
        parts.push(
          `<li class="${cls}">${escapeHtml(label)} — ${escapeHtml(status)}</li>`,
        );
      }
      parts.push("</ul>");
    }

    parts.push("</body></html>");
    return parts.join("");
  }

  const defects = Array.isArray(payload.defects) ? payload.defects : [];
  const observations = Array.isArray(payload.observations)
    ? payload.observations
    : [];
  if (defects.length > 0 || observations.length > 0) {
    return buildInspectionReportHtml(
      defects as GenericRow[],
      observations as GenericRow[],
    );
  }

  return null;
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
