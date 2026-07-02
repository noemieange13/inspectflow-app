import type { LayoutTextBlock } from "@/lib/document_parsers/steveFieldSheetParser";

/** Layout blocks simulating OCR output from a Steve field sheet scan. */
export const STEVE_FIELD_SHEET_LAYOUT: LayoutTextBlock[] = [
  { text: "Inspect-Habitation", x: 20, y: 20, width: 180, height: 14, confidence: 0.99 },
  {
    text: "Check-list for Report/pour rapport",
    x: 20,
    y: 38,
    width: 320,
    height: 14,
    confidence: 0.99,
  },
  { text: "Date:", x: 30, y: 90, width: 42, height: 12, confidence: 0.98 },
  { text: "12 juin 2024", x: 220, y: 91, width: 110, height: 12, confidence: 0.91 },
  { text: "2. Adresse:", x: 30, y: 112, width: 78, height: 12, confidence: 0.98 },
  {
    text: "2404 Rue de la Reine des Prés, Mont-Laurier",
    x: 220,
    y: 113,
    width: 360,
    height: 14,
    confidence: 0.84,
  },
  { text: "Type de bâtiment:", x: 30, y: 134, width: 120, height: 12, confidence: 0.98 },
  { text: "Unifamiliale", x: 220, y: 135, width: 100, height: 12, confidence: 0.88 },
  {
    text: "Année de Construction:",
    x: 30,
    y: 156,
    width: 150,
    height: 12,
    confidence: 0.98,
  },
  { text: "1990", x: 220, y: 157, width: 40, height: 12, confidence: 0.92 },
  {
    text: "Orientation de la façade:",
    x: 30,
    y: 178,
    width: 160,
    height: 12,
    confidence: 0.98,
  },
  { text: "Sud", x: 220, y: 179, width: 30, height: 12, confidence: 0.89 },
  { text: "Toiture:", x: 30, y: 200, width: 60, height: 12, confidence: 0.98 },
  { text: "Bardeaux d'asphalte", x: 220, y: 201, width: 140, height: 12, confidence: 0.87 },
  { text: "Année toiture:", x: 30, y: 222, width: 90, height: 12, confidence: 0.98 },
  { text: "2015", x: 220, y: 223, width: 40, height: 12, confidence: 0.9 },
  { text: "Chauffage:", x: 30, y: 244, width: 72, height: 12, confidence: 0.98 },
  { text: "Plinthes électriques", x: 220, y: 245, width: 130, height: 12, confidence: 0.86 },
  {
    text: "fissure côté droit",
    x: 12,
    y: 130,
    width: 120,
    height: 12,
    confidence: 0.78,
  },
  {
    text: "Vérifier drain français au printemps",
    x: 650,
    y: 130,
    width: 220,
    height: 12,
    confidence: 0.83,
  },
];

export const STEVE_FIELD_SHEET_TEXT = `
Inspect-Habitation
Check-list for Report/pour rapport
Date:
Adresse:
Type de bâtiment:
Année de Construction:
Orientation de la façade:
Toiture:
Chauffage:
`;

export const EMAIL_SAMPLE = `
From: Jean Client <jean.client@example.com>
Subject: Inspection pré-achat

Client: Jean Dupont
Courriel pour l'inspection de la propriété.
`;

export const OLD_REPORT_SAMPLE = `
RAPPORT D'INSPECTION PRÉ-ACHAT
REQUÉRANT(S): Jean Dupont
ADRESSE: 100 ancienne adresse, Gatineau
TYPE DE PROPRIÉTÉ: jumelé
ANNÉE DE CONSTRUCTION: 1988
Toiture: Membrane élastomère
Chauffage: Mazout
`;

export const DV_SAMPLE = `
Déclaration du vendeur
DV #12345
Acheteur : Jean Dupont
Adresse : 2404 Rue de la Reine des Prés, Mont-Laurier
Une infiltration au sous-sol a été réparée.
`;
