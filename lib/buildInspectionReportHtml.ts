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

type ReportLanguage = "fr" | "en";

function getReportLanguage(payload: Record<string, unknown>): ReportLanguage {
  const candidate = payload.language ?? payload.lang;
  return candidate === "en" ? "en" : "fr";
}

function i18n(language: ReportLanguage) {
  return language === "en"
    ? {
      htmlLang: "en",
      defaultTitle: "Report",
      scoreLabel: "Score",
      inspectionTitle: "Inspection report",
      defectsTitle: "Issues",
      observationsTitle: "Observations",
      complianceTitle: "Compliance checks (Canada)",
      bilingualFrameworkTitle:
        "Bilingual notice — Canadian building inspection framework",
      legalNoticeTitle: "Legal notice",
      referencesTitle: "Reference candidates",
      elementFallback: "Item",
      clientSectionTitle: "Client summary",
      technicalSummaryTitle: "Technical summary",
      severityLabel: "Severity",
      findingObservation: "Observation",
      findingAnalysis: "Analysis",
      findingRecommendation: "Recommendation",
    }
    : {
      htmlLang: "fr",
      defaultTitle: "Rapport",
      scoreLabel: "Score",
      inspectionTitle: "Rapport d'inspection",
      defectsTitle: "Defauts",
      observationsTitle: "Observations",
      complianceTitle: "Points de conformite (Canada)",
      bilingualFrameworkTitle:
        "Avis bilingue — cadre d'inspection des batiments au Canada",
      legalNoticeTitle: "Avis legal",
      referencesTitle: "References candidates",
      elementFallback: "Element",
      clientSectionTitle: "Compte rendu à l'intention du client",
      technicalSummaryTitle: "Synthèse technique",
      severityLabel: "Gravité",
      findingObservation: "Observation",
      findingAnalysis: "Analyse",
      findingRecommendation: "Recommandation",
    };
}

function statusCssClass(status: string): "ok" | "warn" | "bad" {
  if (status === "OK") return "ok";
  if (status === "À réparer" || /répar/i.test(status) || /repair/i.test(status)) {
    return "warn";
  }
  return "bad";
}

type SectionItem = { label?: unknown; status?: unknown };
type Section = { title?: unknown; items?: unknown };
type ComplianceChecklistItem = {
  title?: unknown;
  requirement?: unknown;
  status?: unknown;
  reference_candidates?: unknown;
};

function renderBilingualNoticeParagraphs(
  compliance: Record<string, unknown>,
  t: ReturnType<typeof i18n>,
): string {
  const raw = compliance.bilingual_notice;
  if (!raw || typeof raw !== "object") return "";

  const rec = raw as Record<string, unknown>;
  const fr = Array.isArray(rec.fr)
    ? rec.fr.filter((x): x is string => typeof x === "string" && x.trim().length > 0)
    : [];
  const en = Array.isArray(rec.en)
    ? rec.en.filter((x): x is string => typeof x === "string" && x.trim().length > 0)
    : [];
  if (fr.length === 0 && en.length === 0) return "";

  const frBlock = fr.length > 0
    ? `<div lang="fr" style="margin-bottom:1.25em"><strong>Français</strong>${
      fr.map((p) => `<p>${escapeHtml(p)}</p>`).join("")
    }</div>`
    : "";
  const enBlock = en.length > 0
    ? `<div lang="en" style="margin-bottom:1.25em"><strong>English</strong>${
      en.map((p) => `<p>${escapeHtml(p)}</p>`).join("")
    }</div>`
    : "";

  return `<h2>${escapeHtml(t.bilingualFrameworkTitle)}</h2>${frBlock}${enBlock}`;
}

export type GenericRow = Record<string, unknown>;

/**
 * Produit un HTML utilisable par `reports-pdf` à partir du JSON `reports.payload`.
 * Priorité : `payload.html` déjà valide → sinon `payload.sections` → sinon défauts / observations.
 * Tout texte interpolé est échappé.
 */
export function buildHtmlFromReportPayload(
  payload: Record<string, unknown> | null | undefined,
): string | null {
  if (!payload || typeof payload !== "object") return null;
  const language = getReportLanguage(payload);
  const t = i18n(language);

  const direct = payload.html;
  if (typeof direct === "string" && isHtmlLongEnough(direct)) {
    return direct;
  }

  const sectionsRaw = payload.sections;
  if (Array.isArray(sectionsRaw) && sectionsRaw.length > 0) {
    const parts: string[] = [];
    parts.push(
      `<!DOCTYPE html><html lang="${t.htmlLang}"><head><meta charset="utf-8"><title>${t.defaultTitle}</title>`,
    );
    parts.push(
      "<style>body{font-family:Arial,sans-serif;padding:40px}h1{font-size:26px}h2{font-size:18px}h3{font-size:16px}.ok{color:green}.warn{color:orange}.bad{color:red}</style>",
    );
    parts.push("</head><body>");

    const title =
      typeof payload.title === "string" && payload.title.trim()
        ? payload.title
        : t.defaultTitle;
    parts.push(`<div class="header"><h1>Inspect<span class="brand">Flow</span></h1><p class="subtitle">${escapeHtml(title)}</p></div>`);

    if (payload.score != null && String(payload.score).length > 0) {
      parts.push(`<h2>${t.scoreLabel}: ${escapeHtml(String(payload.score))}</h2>`);
    }

    const clientSectionRaw = payload.client_section;
    if (typeof clientSectionRaw === "string" && clientSectionRaw.trim()) {
      parts.push(
        `<div class="client-summary" style="margin-bottom:1.5em;padding:1em;border:1px solid #cbd5e1;border-radius:8px;background:#f8fafc">`,
      );
      parts.push(`<h2>${escapeHtml(t.clientSectionTitle)}</h2>`);
      for (const para of clientSectionRaw
        .split(/\n\n+/)
        .map((p) => p.trim())
        .filter((p) => p.length > 0)) {
        parts.push(`<p>${escapeHtml(para)}</p>`);
      }
      parts.push(`</div>`);
    }

    if (typeof payload.summary === "string" && payload.summary.trim()) {
      parts.push(`<h2>${escapeHtml(t.technicalSummaryTitle)}</h2>`);
      parts.push(`<p>${escapeHtml(payload.summary.trim())}</p>`);
    }

    for (const sec of sectionsRaw) {
      if (!sec || typeof sec !== "object") continue;
      const s = sec as Section & {
        observation?: unknown;
        analysis?: unknown;
        recommendation?: unknown;
        severity?: unknown;
      };
      const secTitle = s.title != null ? String(s.title) : "";
      const items = Array.isArray(s.items) ? s.items : [];
      const obs =
        typeof s.observation === "string" ? s.observation.trim() : "";
      const ana = typeof s.analysis === "string" ? s.analysis.trim() : "";
      const rec =
        typeof s.recommendation === "string" ? s.recommendation.trim() : "";
      const sev = typeof s.severity === "string" ? s.severity.trim() : "";

      if (items.length > 0) {
        parts.push(`<h3>${escapeHtml(secTitle)}</h3><ul>`);
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
      } else if (obs || ana || rec || secTitle || sev) {
        parts.push(`<h3>${escapeHtml(secTitle)}</h3>`);
        if (sev) {
          parts.push(
            `<p><em>${escapeHtml(t.severityLabel)}: ${escapeHtml(sev)}</em></p>`,
          );
        }
        if (obs) {
          parts.push(
            `<p><strong>${escapeHtml(t.findingObservation)}:</strong> ${escapeHtml(obs)}</p>`,
          );
        }
        if (ana) {
          parts.push(
            `<p><strong>${escapeHtml(t.findingAnalysis)}:</strong> ${escapeHtml(ana)}</p>`,
          );
        }
        if (rec) {
          parts.push(
            `<p><strong>${escapeHtml(t.findingRecommendation)}:</strong> ${escapeHtml(rec)}</p>`,
          );
        }
      }
    }

    const compliance =
      payload.compliance && typeof payload.compliance === "object"
        ? (payload.compliance as Record<string, unknown>)
        : null;
    if (compliance) {
      const legalNotice = typeof compliance.legal_notice === "string"
        ? compliance.legal_notice.trim()
        : "";
      const checklist = Array.isArray(compliance.checklist)
        ? compliance.checklist as ComplianceChecklistItem[]
        : [];
      parts.push(`<h2>${t.complianceTitle}</h2>`);
      if (legalNotice) {
        parts.push(
          `<p><strong>${t.legalNoticeTitle}:</strong> ${escapeHtml(legalNotice)}</p>`,
        );
      }
      if (checklist.length > 0) {
        parts.push("<ul>");
        for (const item of checklist) {
          const title = item.title != null ? String(item.title) : "";
          const requirement = item.requirement != null
            ? String(item.requirement)
            : "";
          const status = item.status != null ? String(item.status) : "to_verify";
          const refs = Array.isArray(item.reference_candidates)
            ? item.reference_candidates.map((x) => String(x)).filter((x) =>
              x.length > 0
            )
            : [];
          parts.push(
            `<li><strong>${escapeHtml(title)}</strong> (${escapeHtml(status)})` +
              (requirement ? `<br/>${escapeHtml(requirement)}` : "") +
              (refs.length > 0
                ? `<br/><small>${escapeHtml(t.referencesTitle)}: ${
                  escapeHtml(refs.join(" | "))
                }</small>`
                : "") +
              "</li>",
          );
        }
        parts.push("</ul>");
      }

      const bilingualHtml = renderBilingualNoticeParagraphs(compliance, t);
      if (bilingualHtml) parts.push(bilingualHtml);
    }

    parts.push(`<div class="footer">Inspect<strong>Flow</strong> — ${
      t.htmlLang === "en"
        ? "Automated building inspection report. This document does not constitute legal certification."
        : "Rapport d'inspection automatisé. Ce document ne constitue pas une certification légale."
    }</div>`);
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
      language,
    );
  }

  return null;
}

export function buildInspectionReportHtml(
  defects: GenericRow[],
  observations: GenericRow[],
  language: ReportLanguage = "fr",
): string {
  const t = i18n(language);
  const parts: string[] = [];
  parts.push(
    `<!DOCTYPE html><html lang="${t.htmlLang}"><head><meta charset="utf-8"><title>${t.defaultTitle}</title></head><body>`,
  );
  parts.push(`<h1>${t.inspectionTitle}</h1>`);

  if (defects.length > 0) {
    parts.push(`<h2>${t.defectsTitle}</h2><ul>`);
    for (const d of defects) {
      const title = String(d.title ?? d.category ?? t.elementFallback);
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
    parts.push(`<h2>${t.observationsTitle}</h2><ul>`);
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