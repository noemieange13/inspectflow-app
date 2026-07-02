import type { LockedLegalClause } from "@/lib/legalClauses/qc/version";
import { QC_CLAUSE_VERSION, QC_PROVINCE } from "@/lib/legalClauses/qc/version";

export const READER_NOTICE_TITLE_FR = "AVIS AU LECTEUR";
export const READER_NOTICE_TITLE_EN = "READER NOTICE";

function clause(id: string, title: string, content: string): LockedLegalClause {
  return {
    id,
    province: QC_PROVINCE,
    version: QC_CLAUSE_VERSION,
    title,
    content,
    locked: true,
  };
}

export const READER_NOTICE_CLAUSES_FR: readonly LockedLegalClause[] = [
  clause(
    "visual_inspection_only",
    "Inspection visuelle",
    "L'inspection réalisée est une inspection visuelle seulement, effectuée selon les conditions présentes lors de la visite. Seules les composantes accessibles ont été évaluées.",
  ),
  clause(
    "no_destructive_testing",
    "Méthode d'inspection",
    "Aucun démontage destructif n'a été effectué. Les systèmes ont été évalués selon leur fonctionnement apparent au moment de l'inspection.",
  ),
  clause(
    "no_future_guarantee",
    "Limites et garanties",
    "Ce rapport ne constitue aucune garantie quant à l'état futur du bâtiment ni un certificat de conformité du bâtiment aux codes et règlements en vigueur.",
  ),
  clause(
    "access_weather_limits",
    "Limites liées aux conditions",
    "L'inspection peut être limitée par la météo, l'accès, le mobilier, l'accumulation de neige ou des contraintes de sécurité.",
  ),
  clause(
    "report_purpose",
    "Objet du rapport",
    "L'inspection vise à identifier les déficiences apparentes observables au moment de l'inspection pouvant influencer la décision du client.",
  ),
  clause(
    "reader_responsibility",
    "Responsabilité du lecteur",
    "Le lecteur doit prendre connaissance du rapport complet et demander des précisions sur tout élément incompris.",
  ),
] as const;

export const READER_NOTICE_CLAUSES_EN: readonly LockedLegalClause[] = [
  clause(
    "visual_inspection_only",
    "Visual inspection",
    "The inspection performed is a visual inspection only, conducted under the conditions present at the time of the visit. Only accessible components were evaluated.",
  ),
  clause(
    "no_destructive_testing",
    "Inspection method",
    "No destructive disassembly was performed. Systems were evaluated based on their apparent operation at the time of inspection.",
  ),
  clause(
    "no_future_guarantee",
    "Limits and warranties",
    "This report does not constitute any warranty regarding the future condition of the building nor a certificate of building code compliance.",
  ),
  clause(
    "access_weather_limits",
    "Conditional limits",
    "The inspection may be limited by weather, access, furnishings, snow accumulation, or safety constraints.",
  ),
  clause(
    "report_purpose",
    "Purpose of the report",
    "The inspection aims to identify apparent deficiencies observable at the time of inspection that may influence the client's decision.",
  ),
  clause(
    "reader_responsibility",
    "Reader responsibility",
    "The reader must review the complete report and request clarification on any element that is not fully understood.",
  ),
] as const;

export function readerNoticeClausesForLocale(locale: "fr" | "en"): readonly LockedLegalClause[] {
  return locale === "en" ? READER_NOTICE_CLAUSES_EN : READER_NOTICE_CLAUSES_FR;
}

export function readerNoticeTitleForLocale(locale: "fr" | "en"): string {
  return locale === "en" ? READER_NOTICE_TITLE_EN : READER_NOTICE_TITLE_FR;
}
