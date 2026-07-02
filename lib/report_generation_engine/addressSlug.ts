import type { ReportLocale } from "@/lib/reportLocale";

/** Slug d'adresse pour noms de fichier PDF bilingues. */
export function addressSlugForPdf(address: string): string {
  const slug = address
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .replace(/[^\w\s-]/g, "")
    .replace(/\s+/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_|_$/g, "")
    .slice(0, 48);
  return slug.length > 0 ? slug : "Address";
}

export function buildInspectionPdfFilename(address: string, locale: ReportLocale): string {
  const slug = addressSlugForPdf(address);
  const suffix = locale === "en-CA" ? "EN" : "FR";
  return `Inspection_${slug}_${suffix}.pdf`;
}

export function pdfExportVariantSuffix(locale: ReportLocale): "fr" | "en" {
  return locale === "en-CA" ? "en" : "fr";
}
