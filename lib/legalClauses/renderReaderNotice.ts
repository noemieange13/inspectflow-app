/**
 * Phase 8V.4 — Rendu AVIS AU LECTEUR (clauses verrouillées, jamais IA).
 */

import {
  readerNoticeClausesForLocale,
  readerNoticeTitleForLocale,
} from "@/lib/legalClauses/qc/readerNotice";
import type { ReportLocale } from "@/lib/reportLocale";
import { toWriterLanguage } from "@/lib/reportLocale";

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function buildReaderNoticeHtml(locale: ReportLocale): string {
  const lang = toWriterLanguage(locale);
  const title = readerNoticeTitleForLocale(lang);
  const clauses = readerNoticeClausesForLocale(lang);

  const body = clauses
    .map(
      (c) =>
        `<h3 style="margin:1em 0 0.35em;font-size:14px;font-weight:700">${escapeHtml(c.title)}</h3>` +
        `<p style="white-space:pre-wrap;line-height:1.65;margin:0 0 0.75em">${escapeHtml(c.content)}</p>`,
    )
    .join("");

  return (
    `<section class="pro-break pro-reader-notice" data-block="reader_notice">` +
    `<h2 style="margin:0 0 0.75em;font-size:17px;font-weight:800;letter-spacing:0.03em">${escapeHtml(title)}</h2>` +
    body +
    `</section>`
  );
}
