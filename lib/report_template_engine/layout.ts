import type { ProfessionalPageBlock } from "@/lib/report_template_engine/constants";
import { PROFESSIONAL_PAGE_LAYOUT } from "@/lib/report_template_engine/constants";
import type { ProfessionalReportTemplate } from "@/lib/report_template_engine/types";

export { PROFESSIONAL_PAGE_LAYOUT };
export type { ProfessionalPageBlock };

/** CSS supplement for professional template — minimal polish on top of REPORT_BASE_PRINT_CSS. */
export const PROFESSIONAL_REPORT_CSS =
  ".pro-cover{text-align:center;padding:2.5em 2em;border:1px solid #cbd5e1;border-radius:12px;background:linear-gradient(180deg,#f8fafc 0%,#fff 100%);margin-bottom:1.5em;page-break-after:always}" +
  ".pro-cover-logo{max-height:88px;max-width:200px;object-fit:contain;margin-bottom:1em}" +
  ".pro-cover-facade{width:100%;max-height:280px;object-fit:cover;border-radius:8px;margin:1em 0;border:1px solid #e2e8f0}" +
  ".pro-cover-title{font-size:22px;font-weight:800;letter-spacing:0.04em;margin:0.5em 0;color:#0f172a}" +
  ".pro-info-grid{display:grid;grid-template-columns:1fr 1fr;gap:1.25em;margin:1.25em 0}" +
  ".pro-info-box{border:1px solid #e2e8f0;border-radius:8px;padding:1em 1.1em;background:#fafafa}" +
  ".pro-exec-grid{display:flex;gap:1em;flex-wrap:wrap;margin:1em 0}" +
  ".pro-exec-card{flex:1;min-width:140px;border:1px solid #e2e8f0;border-radius:10px;padding:1em;text-align:center}" +
  ".pro-exec-count{font-size:28px;font-weight:800;margin:0.25em 0}" +
  ".pro-priority{border-left:4px solid #b91c1c;padding:0.75em 1em;margin:0.75em 0;background:#fff1f2;border-radius:0 8px 8px 0}" +
  ".pro-section{border:1px solid #e2e8f0;border-radius:8px;padding:1em 1.15em;margin:1em 0;background:#fff;page-break-inside:avoid}" +
  ".pro-finding{margin:0.65em 0;padding-left:0.5em;border-left:3px solid #94a3b8}" +
  ".pro-photo{max-width:100%;max-height:240px;object-fit:contain;border:1px solid #e2e8f0;border-radius:6px;margin:0.5em 0}" +
  ".pro-annex-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin:0.75em 0}" +
  ".pro-annex-thumb{width:100%;height:120px;object-fit:cover;border-radius:4px;border:1px solid #e2e8f0}" +
  ".pro-break{page-break-before:always}" +
  ".pro-muted{color:#64748b;font-size:13px}" +
  ".pro-sign img{max-width:220px;max-height:96px;object-fit:contain;margin-top:0.5em}" +
  ".pro-cert-logo{max-height:48px;max-width:120px;object-fit:contain;margin:0.25em 0}";

export function orderedPageBlocks(
  template: ProfessionalReportTemplate,
): ProfessionalPageBlock[] {
  const blocks: ProfessionalPageBlock[] = ["cover", "info"];

  if (template.readerNoticeHtml.trim()) {
    blocks.push("reader_notice");
  }

  if (template.legalFrontMatterHtml.trim()) {
    blocks.push("legal_front_matter");
  }

  blocks.push("executive_summary");

  if (template.priorityFindings.length > 0) {
    blocks.push("priority_findings");
  }

  if (
    template.steveFindingsHtml.trim() ||
    template.sections.some((s) => s.findings.length > 0)
  ) {
    blocks.push("sections");
  }

  if (template.conclusionHtml.trim()) {
    blocks.push("conclusion");
  }

  if (template.attestationHtml.trim()) {
    blocks.push("attestation");
  }

  if (
    template.photoLayout.includeFullPhotoBank &&
    template.photoLayout.annexGroups.some((g) => g.photoUrls.length > 0)
  ) {
    blocks.push("annex");
  }

  if (template.limitationsHtml.trim()) {
    blocks.push("limitations");
  }

  if (template.legalClausesHtml.trim()) {
    blocks.push("legal_clauses");
  }

  return blocks;
}
