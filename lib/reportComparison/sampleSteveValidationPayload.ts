/**
 * Payload échantillon pour /steve-validation et tests 8W.
 */
import { applyProfessionalSnapshotToReportPayload, normalizeInspectorProfileInput } from "@/lib/inspectorProfile";

const SAMPLE_PROFILE = normalizeInspectorProfileInput({
  company_name: "Inspect-Habitation",
  logo_url: "data:image/png;base64,LOGO8W",
  display_name: "Steve Charbonneau",
  professional_title: "Inspecteur en bâtiment",
  certifications: [
    { associationName: "AIBQ", memberNumber: "12345", logoUrl: "data:image/png;base64,AIBQ" },
  ],
  signature_image_url: "data:image/png;base64,SIG8W",
  preferred_ui_language: "fr-CA",
  default_client_report_language: "fr-CA",
});

export function buildSampleSteveValidationPayload(): Record<string, unknown> {
  return applyProfessionalSnapshotToReportPayload(
    {
      cover_v1: {
        schema_version: 1,
        address: "49 De Castagne, Gatineau",
        propriete: {
          adresse: "49 De Castagne, Gatineau",
          client_nom: "Mme Aimée Ina Mahoro",
        },
        inspecteur_nom: "Steve Charbonneau",
        inspecteur_numero_certification: "AIBQ #12345",
        compagnie: "Inspect-Habitation",
        date_heure_affichage: "2026-06-20",
      },
      building_profile_v1: {
        schema_version: 1,
        type: "jumelé",
        year_built: "1990",
      },
      sections: [
        {
          id: "obs-1",
          title: "Toiture",
          observation: "Bardeaux en bon état.",
          zone: "toiture",
          severity: "low",
        },
      ],
      entries: [
        {
          id: "obs-1",
          zone: "toiture",
          issue: "roof_wear",
          severity: "low",
          note: "Bardeaux en bon état.",
        },
      ],
      steve_photo_context_v1: {
        schema_version: 1,
        contexts: [
          {
            photo_id: "https://example.com/panel.jpg",
            inspection_section: "Électricité",
            component: "Panneau principal",
            component_id: "electrical_panel_photo",
          },
          {
            photo_id: "https://example.com/floor.jpg",
            inspection_section: "Intérieur",
            component: "Planchers",
            component_id: "wood_floor_photo",
          },
        ],
      },
    },
    SAMPLE_PROFILE,
    "2026-06-20T12:00:00.000Z",
  );
}

export const SAMPLE_LEGACY_STEVE_TEXT = `RAPPORT D'INSPECTION PRÉ-ACHAT
REQUÉRANT(S): Mme Aimée Ina Mahoro
ADRESSE: 49 De Castagne, Gatineau
DATE ET HEURE: 12 juin 2024, 09 h 00
TYPE DE PROPRIÉTÉ: jumelé
ANNÉE DE CONSTRUCTION: 1990
DESCRIPTION SOMMAIRE DU BÂTIMENT
Photo panneau électrique
Photo plancher salon`;
