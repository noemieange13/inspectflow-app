import type { LegalClauseDefinition } from "@/lib/report_legal_sections_engine/types";
import {
  CARBON_MONOXIDE_DEFAULT_COMMENTS_FR,
  CARBON_MONOXIDE_NOTE_BODY_FR,
  ORIENTATION_READING_BODY_FR,
  ORIENTATION_READING_SECTION_TITLE,
} from "@/lib/report_template_engine/sellerDisclosureSection";

export const OWNER_DISCLOSURE_DEFAULT_INTRO_FR =
  "Nous sommes assurés de faire remplir par le vendeur le document « Divulgation du propriétaire vendeur » concernant les conditions de la résidence que seule sa connaissance de la propriété et son expérience passée pourraient révéler.";

export const SPECIALIST_NB_BODY_FR =
  "Certains éléments du bâtiment peuvent requérir une évaluation par un ou des spécialistes, notamment : les systèmes électriques, la plomberie, les structures majeures, les systèmes de chauffage et de climatisation, les fondations et les éléments environnementaux (amiante, moisissures, radon). L'inspecteur en bâtiment n'est pas un ingénieur, un électricien, un plombier ou un expert en environnement. Toute anomalie ou limite signalée dans ce rapport devrait être évaluée par le spécialiste concerné avant la finalisation de la transaction.\n\nCe rapport est exclusivement rédigé à l'intention du client signé. Il ne peut être utilisé à d'autres fins sans le consentement écrit de l'inspecteur.";

export const QC_LEGAL_CLAUSE_DEFINITIONS: LegalClauseDefinition[] = [
  {
    code: "inspection_scope",
    title: "PORTÉE ET LIMITES DE L'INSPECTION",
    body:
      "Cette inspection consiste en une inspection visuelle des composantes facilement accessibles du bâtiment au moment de l'inspection. Elle vise à identifier les indices visibles pouvant révéler des déficiences ou conditions nécessitant une attention particulière.\n\nL'inspection ne constitue pas une garantie contre les vices cachés et ne permet pas de prédire l'apparition future de problèmes non visibles lors de l'inspection.",
  },
  {
    code: "accessibility_limitations",
    title: "LIMITES D'ACCÈS ET CONDITIONS",
    body:
      "Certaines composantes peuvent ne pas avoir été inspectées en raison des conditions présentes lors de l'inspection, notamment la présence de neige, glace, mobilier, biens personnels, revêtements, finitions ou tout autre obstacle limitant l'accès ou la visibilité.",
  },
  {
    code: "owner_disclosure",
    title: "DÉCLARATION DU PROPRIÉTAIRE",
    body: OWNER_DISCLOSURE_DEFAULT_INTRO_FR,
  },
  {
    code: "orientation_notice",
    title: ORIENTATION_READING_SECTION_TITLE,
    body: ORIENTATION_READING_BODY_FR,
  },
  {
    code: "carbon_monoxide_note",
    title: "Note",
    body: `${CARBON_MONOXIDE_NOTE_BODY_FR}\n\nCommentaires :\n${CARBON_MONOXIDE_DEFAULT_COMMENTS_FR}`,
  },
  {
    code: "specialist_nb",
    title: "N.B.",
    body: SPECIALIST_NB_BODY_FR,
  },
  {
    code: "component_life_expectancy",
    title: "DURÉE DE VIE DES COMPOSANTES",
    body:
      "Toute mention concernant l'âge, l'état ou la durée de vie restante d'une composante constitue une estimation basée sur les observations visibles au moment de l'inspection et ne représente aucune garantie.",
  },
  {
    code: "photos_notice",
    title: "PHOTOGRAPHIES",
    body:
      "Les photographies incluses au rapport servent à illustrer certaines observations. Elles ne représentent pas nécessairement toutes les conditions observées lors de l'inspection.",
  },
  {
    code: "report_usage",
    title: "UTILISATION DU RAPPORT",
    body:
      "Ce rapport est préparé exclusivement pour le client identifié au rapport et selon les conditions convenues au contrat d'inspection.",
  },
];

export function getQcClauseDefinition(code: LegalClauseDefinition["code"]): LegalClauseDefinition {
  const row = QC_LEGAL_CLAUSE_DEFINITIONS.find((c) => c.code === code);
  if (!row) throw new Error(`Missing QC legal clause: ${code}`);
  return row;
}
