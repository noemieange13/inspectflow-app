/**
 * Phase 8V.4 — Attestation inspecteur + bloc signature professionnelle.
 * Clauses verrouillées — jamais générées par IA.
 */

import type { CertificationEntry } from "@/lib/inspectorProfile";
import {
  attestationClausesForLocale,
  ATTESTATION_ADVISORY_EN,
  ATTESTATION_ADVISORY_FR,
  ATTESTATION_INTRO_EN,
  ATTESTATION_INTRO_FR,
  ATTESTATION_TITLE_EN,
  ATTESTATION_TITLE_FR,
} from "@/lib/legalClauses/qc/attestation";
import type { ReportLocale } from "@/lib/reportLocale";
import { toWriterLanguage } from "@/lib/reportLocale";
import type { ProfessionalBranding, CoverData } from "@/lib/report_template_engine/types";

export type InspectorAttestationInput = {
  locale: ReportLocale;
  branding: ProfessionalBranding;
  cover: CoverData;
  certificationEntries?: CertificationEntry[];
};

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function imgTag(url: string | null | undefined, className: string): string {
  if (!url?.trim()) return "";
  if (!url.startsWith("data:image/") && !/^https?:\/\//i.test(url)) return "";
  return `<img src=${JSON.stringify(url.trim())} alt="" class="${className}"/>`;
}

function renderCertificationBlock(
  entries: CertificationEntry[],
  locale: "fr" | "en",
): string {
  if (entries.length === 0) return "";

  const memberLabel = locale === "en" ? "Member" : "Membre";
  const parts: string[] = ['<div class="pro-cert-list" style="margin-top:0.75em">'];

  for (const entry of entries) {
    const association =
      entry.associationName?.trim() ||
      entry.association?.trim() ||
      "";
    const number =
      entry.memberNumber?.trim() ||
      entry.number?.trim() ||
      entry.license?.trim() ||
      "";
    if (!association && !number && !entry.logoUrl) continue;

    parts.push('<div class="pro-cert-entry" style="margin:0.5em 0">');
    if (entry.logoUrl?.trim()) {
      parts.push(imgTag(entry.logoUrl, "pro-cert-logo"));
    }
    if (association) {
      parts.push(`<p style="margin:0.15em 0;font-weight:700">${escapeHtml(association)}</p>`);
    }
    if (number) {
      parts.push(
        `<p style="margin:0.15em 0;font-size:13px">${escapeHtml(memberLabel)} ${escapeHtml(number)}</p>`,
      );
    }
    parts.push("</div>");
  }

  parts.push("</div>");
  return parts.join("");
}

export function buildInspectorAttestationHtml(input: InspectorAttestationInput): string {
  const lang = toWriterLanguage(input.locale);
  const title = lang === "en" ? ATTESTATION_TITLE_EN : ATTESTATION_TITLE_FR;
  const intro = lang === "en" ? ATTESTATION_INTRO_EN : ATTESTATION_INTRO_FR;
  const advisory = lang === "en" ? ATTESTATION_ADVISORY_EN : ATTESTATION_ADVISORY_FR;
  const clauses = attestationClausesForLocale(lang);
  const entries =
    input.certificationEntries?.length
      ? input.certificationEntries
      : resolveCertificationEntriesFromBranding(input.branding);

  const dateLabel = lang === "en" ? "Inspection date" : "Date d'inspection";
  const inspectorTitle = input.branding.inspectorTitle?.trim();

  const clauseItems = clauses
    .map((c) => `<li style="margin:0.35em 0">${escapeHtml(c.content)}</li>`)
    .join("");

  const signature = imgTag(input.branding.signatureUrl ?? input.cover.signatureUrl, "pro-sign");

  return (
    `<section class="pro-break pro-attestation" data-block="attestation">` +
    `<h2 style="margin:0 0 0.75em;font-size:17px;font-weight:800;letter-spacing:0.03em">${escapeHtml(title)}</h2>` +
    `<p style="font-weight:600;margin:0 0 0.5em">${escapeHtml(intro)}</p>` +
    `<ul style="margin:0 0 1em 1.25em;padding:0;line-height:1.65;font-size:14px">${clauseItems}</ul>` +
    `<p style="margin:0 0 1.25em;line-height:1.6;font-style:italic">${escapeHtml(advisory)}</p>` +
    `<div style="display:flex;flex-wrap:wrap;gap:2em;align-items:flex-start">` +
    `<div style="min-width:220px">` +
    `<p style="margin:0.25em 0"><strong>${escapeHtml(input.cover.inspectorName)}</strong></p>` +
    (inspectorTitle
      ? `<p style="margin:0.25em 0">${escapeHtml(inspectorTitle)}</p>`
      : "") +
    (input.branding.companyName
      ? `<p style="margin:0.25em 0">${escapeHtml(input.branding.companyName)}</p>`
      : "") +
    (input.branding.website
      ? `<p style="margin:0.25em 0;font-size:13px">${escapeHtml(input.branding.website)}</p>`
      : "") +
    (input.branding.phone
      ? `<p style="margin:0.25em 0;font-size:13px">${escapeHtml(input.branding.phone)}</p>`
      : "") +
    `<p style="margin:0.75em 0 0"><strong>${escapeHtml(dateLabel)}:</strong> ${escapeHtml(input.cover.inspectionDate)}</p>` +
    renderCertificationBlock(entries, lang) +
    `</div>` +
    `<div style="flex:1;min-width:180px">${signature}</div>` +
    `</div>` +
    `</section>`
  );
}

function resolveCertificationEntriesFromBranding(
  branding: ProfessionalBranding,
): CertificationEntry[] {
  if (branding.certificationEntries?.length) return branding.certificationEntries;
  if (!branding.certification.trim()) return [];
  return [
    {
      association: branding.certificationAssociation ?? undefined,
      number: branding.certification,
    },
  ];
}

export function resolveCertificationEntriesForPayload(
  payload: Record<string, unknown>,
  branding: ProfessionalBranding,
): CertificationEntry[] {
  if (branding.certificationEntries?.length) return branding.certificationEntries;

  const snap = payload.report_professional_snapshot_v1;
  if (snap && typeof snap === "object" && !Array.isArray(snap)) {
    const inspector = (snap as Record<string, unknown>).inspector;
    if (inspector && typeof inspector === "object" && !Array.isArray(inspector)) {
      const entries = (inspector as Record<string, unknown>).certification_entries;
      if (Array.isArray(entries) && entries.length > 0) {
        return entries.filter((e) => e && typeof e === "object") as CertificationEntry[];
      }
    }
  }

  return resolveCertificationEntriesFromBranding(branding);
}
