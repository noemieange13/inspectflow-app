import type { LockedLegalClause } from "@/lib/legalClauses/qc/version";
import { QC_CLAUSE_VERSION, QC_PROVINCE } from "@/lib/legalClauses/qc/version";

export const ATTESTATION_TITLE_FR = "ATTESTATION";
export const ATTESTATION_TITLE_EN = "ATTESTATION";

export const ATTESTATION_INTRO_FR =
  "L'inspecteur soussigné certifie :";
export const ATTESTATION_INTRO_EN =
  "The undersigned inspector certifies:";

export const ATTESTATION_ADVISORY_FR =
  "Vous êtes avisé de ne prendre aucune décision sans être certain d'avoir clairement compris les observations contenues dans ce rapport.";
export const ATTESTATION_ADVISORY_EN =
  "You are advised not to make any decision unless you clearly understand the observations contained in this report.";

function clause(id: string, content: string): LockedLegalClause {
  return {
    id,
    province: QC_PROVINCE,
    version: QC_CLAUSE_VERSION,
    title: ATTESTATION_TITLE_FR,
    content,
    locked: true,
  };
}

export const ATTESTATION_CLAUSES_FR: readonly LockedLegalClause[] = [
  clause(
    "attestation_no_interest",
    "N'avoir aucun intérêt présent ou futur dans ladite propriété.",
  ),
  clause(
    "attestation_no_influence",
    "Que les observations ont été constatées sans aucune influence extérieure.",
  ),
  clause(
    "attestation_no_omission",
    "N'avoir omis ou négligé volontairement aucun fait important se rapportant à la présente inspection.",
  ),
] as const;

export const ATTESTATION_CLAUSES_EN: readonly LockedLegalClause[] = [
  clause(
    "attestation_no_interest",
    "To have no present or future interest in the said property.",
  ),
  clause(
    "attestation_no_influence",
    "That the observations were recorded without any external influence.",
  ),
  clause(
    "attestation_no_omission",
    "Not to have knowingly omitted or neglected any material fact relating to this inspection.",
  ),
] as const;

export function attestationClausesForLocale(locale: "fr" | "en"): readonly LockedLegalClause[] {
  return locale === "en" ? ATTESTATION_CLAUSES_EN : ATTESTATION_CLAUSES_FR;
}
