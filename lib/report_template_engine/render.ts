import { escapeHtml, REPORT_BASE_PRINT_CSS } from "@/lib/buildInspectionReportHtml";
import {
  fixedLimitationClausesFr,
  formatInspectorLimitationsBody,
  LIMITATIONS_FIXED_CLAUSE_VERSION,
} from "@/lib/limitations";
import { formatBuildingProfileDescriptionFr } from "@/lib/buildingProfile";
import { parseCoverV1FromUnknown } from "@/lib/inspectionCoverPayload";
import {
  groupClausesBySection,
  type QcLegalClauseRow,
} from "@/lib/qcLegalClauses";
import {
  orderedPageBlocks,
  PROFESSIONAL_REPORT_CSS,
} from "@/lib/report_template_engine/layout";
import { professionalTemplateLocale } from "@/lib/report_template_engine/locales";
import type { ProfessionalReportTemplate } from "@/lib/report_template_engine/types";
import type { ReportLocale } from "@/lib/reportLocale";
import { toWriterLanguage } from "@/lib/reportLocale";

export type RenderProfessionalOptions = {
  legalClauseRows?: QcLegalClauseRow[];
};

function esc(s: string): string {
  return escapeHtml(s);
}

function imgTag(url: string | null | undefined, className: string): string {
  const u = url?.trim();
  if (!u) return "";
  if (u.startsWith("data:image/") && u.length >= 900_000) return "";
  if (!u.startsWith("data:image/") && !/^https?:\/\//i.test(u)) return "";
  return `<img src=${JSON.stringify(u)} alt="" class="${className}"/>`;
}

export function buildLimitationsHtml(
  payload: Record<string, unknown>,
  locale: ReportLocale,
): string {
  const cover = parseCoverV1FromUnknown(payload.cover_v1);
  if (!cover) return "";
  const lang = toWriterLanguage(locale);
  const limBody = formatInspectorLimitationsBody(cover).trim();
  const fixedLim = fixedLimitationClausesFr();
  const L = professionalTemplateLocale(locale);

  if (!limBody && fixedLim.length === 0) return "";

  const fixedList =
    fixedLim.length > 0
      ? `<p class="pro-muted" style="margin:0.75em 0 0.35em;font-size:12px;font-weight:600">${
          lang === "en"
            ? `Standard clauses (non-editable — ref. ${esc(LIMITATIONS_FIXED_CLAUSE_VERSION)})`
            : `Clauses types (non modifiables — réf. ${esc(LIMITATIONS_FIXED_CLAUSE_VERSION)})`
        }</p><ul style="margin:0.25em 0 0;padding-left:1.25em;font-size:13px;line-height:1.4">` +
        fixedLim.map((line) => `<li>${esc(line)}</li>`).join("") +
        `</ul>`
      : "";

  return (
    `<section class="pro-break"><h2>${esc(L.limitationsTitle)}</h2>` +
    (limBody
      ? `<p style="white-space:pre-wrap;line-height:1.45">${esc(limBody)}</p>`
      : "") +
    fixedList +
    `</section>`
  );
}

export function buildLegalClausesHtml(
  payload: Record<string, unknown>,
  locale: ReportLocale,
  rows?: QcLegalClauseRow[],
): string {
  const compliance =
    payload.compliance && typeof payload.compliance === "object"
      ? (payload.compliance as Record<string, unknown>)
      : null;
  const legalNotice =
    compliance && typeof compliance.legal_notice === "string"
      ? compliance.legal_notice.trim()
      : "";
  const cover = parseCoverV1FromUnknown(payload.cover_v1);
  const notes = cover?.notes_conformite?.trim() ?? "";

  const clauseHtml =
    rows && rows.length > 0
      ? (() => {
          const grouped = groupClausesBySection(rows);
          const parts: string[] = [];
          for (const [section, sectionRows] of Object.entries(grouped)) {
            parts.push(`<h3 style="font-size:15px;margin-top:0.85em">${esc(section)}</h3>`);
            parts.push('<ul style="margin:0.35em 0;padding-left:1.25em">');
            for (const clause of sectionRows) {
              parts.push(`<li style="margin:0.35em 0">${esc(clause)}</li>`);
            }
            parts.push("</ul>");
          }
          return parts.join("");
        })()
      : "";

  const body = [notes, legalNotice].filter(Boolean).join("\n\n");
  if (!body && !clauseHtml) return "";

  const L = professionalTemplateLocale(locale);
  return (
    `<section class="pro-break"><h2>${esc(L.legalTitle)}</h2>` +
    (body
      ? `<p style="white-space:pre-wrap;line-height:1.45">${esc(body).replace(/\n\n/g, "</p><p>")}</p>`
      : "") +
    clauseHtml +
    `</section>`
  );
}

function renderCover(template: ProfessionalReportTemplate): string {
  const { cover, branding } = template;
  const facade = imgTag(cover.facadePhotoUrl, "pro-cover-facade");
  const logo = imgTag(branding.logoUrl ?? cover.logoUrl, "pro-cover-logo");
  return (
    `<section class="pro-cover">` +
    logo +
    `<p class="pro-muted" style="margin:0 0 0.5em;font-weight:600">${esc(branding.companyName || cover.companyName)}</p>` +
    `<h1 class="pro-cover-title">${esc(cover.title)}</h1>` +
    facade +
    `<p><strong>${esc(professionalTemplateLocale(template.locale).coverAddress)}:</strong> ${esc(cover.address)}</p>` +
    `<p><strong>${esc(professionalTemplateLocale(template.locale).coverClient)}:</strong> ${esc(cover.clientName)}</p>` +
    `<p><strong>${esc(professionalTemplateLocale(template.locale).coverDate)}:</strong> ${esc(cover.inspectionDate)}</p>` +
    `<p><strong>${esc(professionalTemplateLocale(template.locale).coverInspector)}:</strong> ${esc(cover.inspectorName)}</p>` +
    `<p><strong>${esc(professionalTemplateLocale(template.locale).coverCertification)}:</strong> ${esc(cover.certification)}</p>` +
    (cover.weatherSummary
      ? `<p><strong>${esc(professionalTemplateLocale(template.locale).coverWeather)}:</strong> ${esc(cover.weatherSummary)}</p>`
      : "") +
    `</section>`
  );
}

function renderInfo(template: ProfessionalReportTemplate): string {
  const L = professionalTemplateLocale(template.locale);
  const {
    branding,
    cover,
    propertySnapshot,
    buildingProfile,
  } = template;
  const lang = template.locale.startsWith("en") ? "en" : "fr";
  const infoTitle =
    lang === "en" ? "Inspection information" : "Informations sur l'inspection";
  const buildingTitle =
    lang === "en" ? "Building description" : "Description sommaire du bâtiment";

  const buildingRows = buildingProfile
    ? formatBuildingProfileDescriptionFr(buildingProfile)
        .split("\n")
        .filter(Boolean)
        .map(
          (line) => {
            const idx = line.indexOf(":");
            if (idx <= 0) return `<p>${esc(line)}</p>`;
            const label = line.slice(0, idx).trim();
            const value = line.slice(idx + 1).trim();
            return `<p><strong>${esc(label)}</strong><br/>${esc(value)}</p>`;
          },
        )
        .join("")
    : propertySnapshot
      ? [
          ["Type", propertySnapshot.building.type || propertySnapshot.property.type],
          ["Année", propertySnapshot.building.year || propertySnapshot.property.year],
          [
            lang === "en" ? "Exterior cladding" : "Revêtement extérieur",
            propertySnapshot.building.facade_material,
          ],
          [lang === "en" ? "Roof" : "Toiture", propertySnapshot.building.roof_covering],
          [lang === "en" ? "Foundation" : "Fondation", propertySnapshot.building.foundation_type],
          [lang === "en" ? "Structure" : "Structure", propertySnapshot.building.structure_type],
          [lang === "en" ? "Heating" : "Chauffage", propertySnapshot.building.heating_type],
        ]
          .filter(([, value]) => typeof value === "string" && value.trim().length > 0)
          .map(
            ([label, value]) =>
              `<p><strong>${esc(String(label))}</strong><br/>${esc(String(value))}</p>`,
          )
          .join("")
      : "";

  return (
    `<section><h2>${esc(infoTitle)}</h2>` +
    `<div class="pro-info-grid">` +
    `<div class="pro-info-box">` +
    `<p><strong>${esc(L.coverClient)}</strong><br/>${esc(propertySnapshot?.client.name || cover.clientName)}</p>` +
    `<p><strong>${esc(L.coverAddress)}</strong><br/>${esc(propertySnapshot?.property.address || cover.address)}</p>` +
    `<p><strong>${esc(L.coverDate)}</strong><br/>${esc(propertySnapshot?.inspection.date || cover.inspectionDate)}</p>` +
    `</div>` +
    `<div class="pro-info-box">` +
    `<p><strong>${esc(L.coverInspector)}</strong><br/>${esc(propertySnapshot?.inspection.inspector || cover.inspectorName)}</p>` +
    `<p><strong>${esc(L.coverCertification)}</strong><br/>${esc(cover.certification)}</p>` +
    (branding.phone ? `<p>${esc(branding.phone)}</p>` : "") +
    (branding.email ? `<p>${esc(branding.email)}</p>` : "") +
    `</div></div>` +
    (buildingRows
      ? `<h3 style="margin:1.25em 0 0.5em;font-size:15px">${esc(buildingTitle)}</h3>` +
        `<div class="pro-info-box">${buildingRows}</div>`
      : "") +
    `</section>`
  );
}

function renderLegalFrontMatter(template: ProfessionalReportTemplate): string {
  if (!template.legalFrontMatterHtml.trim()) return "";
  return template.legalFrontMatterHtml;
}

function renderExecutiveSummary(template: ProfessionalReportTemplate): string {
  const L = professionalTemplateLocale(template.locale);
  const cards = template.executiveSummary.buckets
    .map(
      (b) =>
        `<div class="pro-exec-card">` +
        `<p style="margin:0">${b.emoji} ${esc(b.label)}</p>` +
        `<p class="pro-exec-count">${b.count}</p>` +
        `</div>`,
    )
    .join("");
  return (
    `<section class="pro-break"><h2>${esc(L.executiveTitle)}</h2>` +
    `<p class="pro-muted">${template.executiveSummary.totalFindings} ${L.executiveTitle.toLowerCase()}</p>` +
    `<div class="pro-exec-grid">${cards}</div></section>`
  );
}

function renderPriorityFindings(template: ProfessionalReportTemplate): string {
  const L = professionalTemplateLocale(template.locale);
  const items = template.priorityFindings
    .map((f) => {
      const photo = imgTag(f.primaryPhotoUrl, "pro-photo");
      return (
        `<div class="pro-priority">` +
        `<h3 style="margin:0 0 0.35em;font-size:16px">${esc(f.title)}</h3>` +
        photo +
        `<p style="margin:0.5em 0;line-height:1.45">${esc(f.summary)}</p>` +
        `<p class="pro-muted" style="margin:0;font-size:12px">${esc(L.pageRef)}: ${esc(f.pageRef)} · ${esc(f.observationId.slice(0, 8))}</p>` +
        `</div>`
      );
    })
    .join("");
  return `<section class="pro-break"><h2>${esc(L.priorityTitle)}</h2>${items}</section>`;
}

function renderSections(template: ProfessionalReportTemplate): string {
  const L = professionalTemplateLocale(template.locale);
  const lang = toWriterLanguage(template.locale);
  const steveTitle =
    lang === "en" ? "Inspection findings (Steve order)" : "Constats d'inspection (ordre Steve)";
  const steveBlock = template.steveFindingsHtml.trim()
    ? `<section class="pro-break pro-steve-findings"><h2 style="margin:0 0 0.75em;border-bottom:2px solid #1d4ed8;padding-bottom:0.35em">${esc(steveTitle)}</h2>${template.steveFindingsHtml}</section>`
    : "";

  const legacySections = template.sections
    .map((sec) => {
      const findings = sec.findings
        .map((f) => {
          const photos = f.photoUrls
            .map((u) => imgTag(u, "pro-photo"))
            .join("");
          return (
            `<div class="pro-finding">` +
            `<h4 style="margin:0 0 0.35em">${esc(f.title)}</h4>` +
            (f.severityLabel
              ? `<p class="pro-muted"><em>${esc(L.severity)}: ${esc(f.severityLabel)}</em></p>`
              : "") +
            (f.observation
              ? `<p><strong>${esc(L.observation)}:</strong> ${esc(f.observation)}</p>`
              : "") +
            (f.analysis
              ? `<p><strong>${esc(L.analysis)}:</strong> ${esc(f.analysis)}</p>`
              : "") +
            (f.recommendation
              ? `<p><strong>${esc(L.recommendation)}:</strong> ${esc(f.recommendation)}</p>`
              : "") +
            photos +
            `</div>`
          );
        })
        .join("");
      return (
        `<section class="pro-section pro-break">` +
        `<h2 style="margin:0 0 0.75em;border-bottom:2px solid #1d4ed8;padding-bottom:0.35em">${esc(sec.title)}</h2>` +
        findings +
        `</section>`
      );
    })
    .join("");
  return steveBlock + legacySections;
}

function renderAnnex(template: ProfessionalReportTemplate): string {
  const L = professionalTemplateLocale(template.locale);
  const groups = template.photoLayout.annexGroups
    .map((g) => {
      const thumbs = g.photoUrls
        .map((u) => `<img src=${JSON.stringify(u)} alt="" class="pro-annex-thumb"/>`)
        .join("");
      return `<h3 style="margin:1em 0 0.5em">${esc(g.label)}</h3><div class="pro-annex-grid">${thumbs}</div>`;
    })
    .join("");
  if (!groups) return "";
  return `<section class="pro-break"><h2>${esc(L.annexTitle)}</h2>${groups}</section>`;
}

function renderSignature(template: ProfessionalReportTemplate): string {
  return template.attestationHtml || "";
}

const BLOCK_RENDERERS: Record<
  string,
  (t: ProfessionalReportTemplate) => string
> = {
  cover: renderCover,
  info: renderInfo,
  reader_notice: (t) => t.readerNoticeHtml,
  legal_front_matter: renderLegalFrontMatter,
  executive_summary: renderExecutiveSummary,
  priority_findings: renderPriorityFindings,
  sections: renderSections,
  conclusion: (t) => t.conclusionHtml,
  attestation: (t) => t.attestationHtml,
  annex: renderAnnex,
  limitations: (t) => t.limitationsHtml,
  legal_clauses: (t) => t.legalClausesHtml,
  signature: renderSignature,
};

/** Render full professional report HTML from template model. */
export function renderProfessionalReportHtml(
  template: ProfessionalReportTemplate,
  locale?: ReportLocale,
): string {
  const loc = locale ?? template.locale;
  const lang = toWriterLanguage(loc);
  const L = professionalTemplateLocale(loc);
  const blocks = orderedPageBlocks(template);

  const parts: string[] = [];
  parts.push(
    `<!DOCTYPE html><html lang="${lang}"><head><meta charset="utf-8"><title>${esc(L.reportTitle)}</title>`,
  );
  parts.push(
    `<style>${REPORT_BASE_PRINT_CSS}${PROFESSIONAL_REPORT_CSS}</style></head><body>`,
  );

  for (const block of blocks) {
    const fn = BLOCK_RENDERERS[block];
    if (fn) parts.push(fn(template));
  }

  parts.push(
    `<div class="footer" style="margin-top:2em;font-size:12px;color:#64748b">Inspect<strong>Flow</strong> — ${
      lang === "en"
        ? "Professional inspection report. This document does not constitute legal certification."
        : "Rapport d'inspection professionnel. Ce document ne constitue pas une certification légale."
    }</div>`,
  );
  parts.push("</body></html>");
  return parts.join("");
}
