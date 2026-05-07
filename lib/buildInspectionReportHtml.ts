import {
  INSPECTOR_PROFILE_PAYLOAD_KEY,
  parseCoverV1FromUnknown,
  parseInspectorProfileFromUnknown,
  getComplianceExportMode,
} from "@/lib/inspectionCoverPayload";
import { buildCoverSectionHtml } from "@/lib/coverSectionHtml";
import { buildQc2027HtmlFromPayload } from "@/lib/qc2027PdfTemplate";
import type { QcLegalClauseRow } from "@/lib/qcLegalClauses";

export type BuildHtmlFromReportPayloadOptions = {
  legalClauseRows?: QcLegalClauseRow[];
  /** QC + rapport EN : clauses FR parallèles (PDF). */
  legalClauseRowsFrForQc?: QcLegalClauseRow[];
};

/**
 * HTML minimal pour reports-pdf (payload.html), à partir de lignes defects / observations.
 * Colonnes tolérantes : schéma réel peut varier.
 */

/** Évite l'injection HTML lorsque le contenu vient du payload (titres, libellés, etc.). */
export function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** Styles communs pour le rendu PDF (html2pdf / Edge). */
export const REPORT_BASE_PRINT_CSS =
  "body{font-family:'Segoe UI',Arial,Helvetica,sans-serif;padding:36px 42px;line-height:1.45;color:#0f172a;font-size:14px}" +
  "h1{font-size:26px;font-weight:700;margin-bottom:0.35em}h2{font-size:17px;font-weight:600;margin-top:1.1em}" +
  "h3{font-size:15px;font-weight:600;margin-top:0.85em}.ok{color:#15803d}.warn{color:#c2410c}.bad{color:#b91c1c}" +
  ".header h1{margin-bottom:0}.header .subtitle{color:#475569;font-size:15px}" +
  ".inspectflow-cover h2{margin-top:0;font-size:18px}";

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

function buildCoverStandaloneHtml(
  payload: Record<string, unknown>,
  coverBlock: string,
  t: ReturnType<typeof i18n>,
): string {
  const parts: string[] = [];
  parts.push(
    `<!DOCTYPE html><html lang="${t.htmlLang}"><head><meta charset="utf-8"><title>${t.defaultTitle}</title>`,
  );
  parts.push(`<style>${REPORT_BASE_PRINT_CSS}</style>`);
  parts.push("</head><body>");
  const title =
    typeof payload.title === "string" && payload.title.trim()
      ? payload.title.trim()
      : t.defaultTitle;
  parts.push(
    `<div class="header"><h1>Inspect<span class="brand">Flow</span></h1><p class="subtitle">${escapeHtml(title)}</p></div>`,
  );
  parts.push(coverBlock);
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
  parts.push(
    `<p style="color:#64748b;font-size:14px;margin-top:1.5em">Contenu structuré (sections / constats) à compléter depuis le rapport InspectFlow.</p>`,
  );
  parts.push(
    `<div class="footer" style="margin-top:2em;font-size:12px;color:#64748b">Inspect<strong>Flow</strong> — ${
      t.htmlLang === "en"
        ? "Automated building inspection report."
        : "Rapport d'inspection automatisé."
    }</div>`,
  );
  parts.push("</body></html>");
  return parts.join("");
}

/** Marqueurs pour fusionner / remplacer la couverture dans un HTML déjà stocké (`payload.html`). */
export const COVER_HTML_INJECT_BEGIN = "<!-- inspectflow-cover-injected -->";
export const COVER_HTML_BLOCK_START = "<!-- inspectflow-cover-start -->";
export const COVER_HTML_BLOCK_END = "<!-- inspectflow-cover-end -->";

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Retire une couverture injectée précédemment (paires de marqueurs ou legacy une section).
 */
export function stripInjectedCoverFromCustomHtml(html: string): string {
  const modern = new RegExp(
    escapeRe(COVER_HTML_INJECT_BEGIN) +
      escapeRe(COVER_HTML_BLOCK_START) +
      "[\\s\\S]*?" +
      escapeRe(COVER_HTML_BLOCK_END),
    "g",
  );
  let h = html.replace(modern, "");
  h = h.replace(
    new RegExp(
      `${escapeRe(COVER_HTML_INJECT_BEGIN)}\\s*<section class="inspectflow-cover"[\\s\\S]*?<\\/section>`,
      "gi",
    ),
    "",
  );
  return h;
}

/**
 * Insère le bloc couverture après `<body…>` dans un document HTML complet, ou le préfixe si pas de body.
 */
export function mergeCoverIntoCustomHtml(fullHtml: string, coverBlock: string): string {
  if (!coverBlock.trim()) return fullHtml;

  const cleaned = stripInjectedCoverFromCustomHtml(fullHtml);
  const wrapped =
    `${COVER_HTML_INJECT_BEGIN}${COVER_HTML_BLOCK_START}${coverBlock}${COVER_HTML_BLOCK_END}`;

  const bodyMatch = cleaned.match(/<body[^>]*>/i);
  if (bodyMatch && bodyMatch.index !== undefined) {
    const insertAt = bodyMatch.index + bodyMatch[0].length;
    return cleaned.slice(0, insertAt) + wrapped + cleaned.slice(insertAt);
  }

  return `${wrapped}\n${cleaned}`;
}

export type GenericRow = Record<string, unknown>;

/**
 * Produit un HTML utilisable par `reports-pdf` à partir du JSON `reports.payload`.
 * Priorité : **`payload.sections`** (Zero Draft) et défauts / observations **avant** `payload.html`.
 * Sinon un `payload.html` long (gabarit / import) est utilisé, avec fusion `cover_v1` si présent.
 * Tout texte interpolé est échappé.
 */
/** Tolère `sections` sérialisé en chaîne JSON (certaines écritures JSONB / imports). */
function normalizeSectionsFromPayload(raw: unknown): unknown[] | null {
  if (Array.isArray(raw) && raw.length > 0) return raw;
  if (typeof raw === "string") {
    try {
      const parsed = JSON.parse(raw) as unknown;
      if (Array.isArray(parsed) && parsed.length > 0) return parsed;
    } catch {
      /* ignore */
    }
  }
  return null;
}

export function buildHtmlFromReportPayload(
  payload: Record<string, unknown> | null | undefined,
  options?: BuildHtmlFromReportPayloadOptions,
): string | null {
  if (!payload || typeof payload !== "object") return null;
  const language = getReportLanguage(payload);
  const t = i18n(language);

  const coverParsed = parseCoverV1FromUnknown(payload.cover_v1);
  const profileParsed = parseInspectorProfileFromUnknown(
    payload[INSPECTOR_PROFILE_PAYLOAD_KEY],
  );
  const coverBlock =
    coverParsed != null
      ? buildCoverSectionHtml(coverParsed, profileParsed)
      : "";

  const sectionsRaw =
    normalizeSectionsFromPayload(payload.sections) ?? [];
  if (sectionsRaw.length > 0) {
    if (
      coverParsed != null &&
      getComplianceExportMode(coverParsed) === "QC_2027"
    ) {
      const qcDoc = buildQc2027HtmlFromPayload(
        payload,
        coverParsed,
        profileParsed,
        sectionsRaw,
        {
          language,
          basePrintCss: REPORT_BASE_PRINT_CSS,
          defaultTitle: t.defaultTitle,
          legalClauseRows: options?.legalClauseRows,
          legalClauseRowsFrForQc: options?.legalClauseRowsFrForQc,
        },
      );
      if (qcDoc) return qcDoc;
    }

    const parts: string[] = [];
    parts.push(
      `<!DOCTYPE html><html lang="${t.htmlLang}"><head><meta charset="utf-8"><title>${t.defaultTitle}</title>`,
    );
    parts.push(`<style>${REPORT_BASE_PRINT_CSS}</style>`);
    parts.push("</head><body>");

    const title =
      typeof payload.title === "string" && payload.title.trim()
        ? payload.title
        : t.defaultTitle;
    parts.push(`<div class="header"><h1>Inspect<span class="brand">Flow</span></h1><p class="subtitle">${escapeHtml(title)}</p></div>`);

    if (coverBlock) {
      parts.push(coverBlock);
    }

    if (payload.score != null && String(payload.score).length > 0) {
      parts.push(`<h2>${t.scoreLabel}: ${escapeHtml(String(payload.score))}</h2>`);
    }

    const bsv1 = payload.building_summary_v1;
    if (bsv1 && typeof bsv1 === "object") {
      const s = bsv1 as Record<string, unknown>;
      const ms = typeof s.score === "number" ? s.score : null;
      const lf =
        language === "en"
          ? typeof s.label_en === "string"
            ? s.label_en
            : ""
          : typeof s.label_fr === "string"
            ? s.label_fr
            : "";
      const cost =
        typeof s.estimated_cost_cad === "number" ? s.estimated_cost_cad : 0;
      const hr =
        s.review_recommended === true ||
        s.high_risk === true ||
        s.score_below_60 === true ||
        s.intrinsic_high_risk === true;
      if (ms != null) {
        parts.push(
          `<div class="building-summary-v1" style="margin:1.25em 0;padding:1em;border:1px solid #cbd5e1;border-radius:8px;background:#f8fafc">`,
        );
        parts.push(
          `<h2>${escapeHtml(language === "en" ? "Building score (market model)" : "Score bâtiment (modèle marché)")}</h2>`,
        );
        parts.push(
          `<p style="font-size:18px;font-weight:700">${escapeHtml(String(ms))} / 100 — ${escapeHtml(lf.trim() || "—")}</p>`,
        );
        if (cost > 0) {
          parts.push(
            `<p style="font-size:13px;color:#475569">${escapeHtml(language === "en" ? "Indicative repair cost" : "Coût travaux indicatif")}: ${escapeHtml(String(Math.round(cost / 100) * 100))} $ CAD</p>`,
          );
        }
        if (hr) {
          parts.push(
            `<p class="bad" style="font-size:13px">${escapeHtml(language === "en" ? "Elevated risk — confirm with professionals." : "Risque élevé — valider avec des professionnels.")}</p>`,
          );
        }
        parts.push(`</div>`);
      }
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
      coverBlock ? { coverHtml: coverBlock } : undefined,
    );
  }

  const direct = payload.html;
  if (typeof direct === "string" && isHtmlLongEnough(direct)) {
    if (!coverBlock) return direct;
    return mergeCoverIntoCustomHtml(direct, coverBlock);
  }

  if (coverBlock) {
    return buildCoverStandaloneHtml(payload, coverBlock, t);
  }

  return null;
}

export function buildInspectionReportHtml(
  defects: GenericRow[],
  observations: GenericRow[],
  language: ReportLanguage = "fr",
  options?: { coverHtml?: string },
): string {
  const t = i18n(language);
  const parts: string[] = [];
  parts.push(
    `<!DOCTYPE html><html lang="${t.htmlLang}"><head><meta charset="utf-8"><title>${t.defaultTitle}</title><style>${REPORT_BASE_PRINT_CSS}</style></head><body>`,
  );
  if (options?.coverHtml) {
    parts.push(options.coverHtml);
  }
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
