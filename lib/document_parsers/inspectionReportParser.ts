/**
 * Phase 8U — parse professional inspection report labels (Steve format).
 * Phase 8U+ — exterior faces + facade orientation.
 * Pilot #0.3 — multiline labels, section-aware address, normalized matching.
 */
export type InspectionReportOrientation = {
  facade_direction: "nord" | "sud" | "est" | "ouest" | "";
  confidence: number;
  source: "previous_report";
};

export type InspectionReportBuildingFields = {
  type: string | null;
  year: string | null;
  facade_material: string | null;
  sides_material: string | null;
  rear_material: string | null;
  roof_covering: string | null;
  foundation_type: string | null;
  structure_type: string | null;
  heating_type: string | null;
};

export type InspectionReportParseResult = {
  client: { name: string | null };
  property: { address: string | null; city: string | null };
  inspection: { date: string | null };
  building: InspectionReportBuildingFields;
  orientation: InspectionReportOrientation | null;
};

const STEVE_STOP_LABELS = [
  "REQUÉRANT(S)",
  "REQUERANT(S)",
  "REQUÉRANTS",
  "REQUERANTS",
  "REQUERANT",
  "CLIENT(S)",
  "CLIENT",
  "NOM DU CLIENT",
  "ACHETEUR",
  "ACHETEUR(S)",
  "ADRESSE",
  "ADRESSE DU BIEN",
  "PROPRIÉTÉ INSPECTÉE",
  "PROPRIETE INSPECTEE",
  "IMMEUBLE INSPECTÉ",
  "IMMEUBLE INSPECTE",
  "LIEU DE L'INSPECTION",
  "DATE ET HEURE",
  "DATE D'INSPECTION",
  "DATE INSPECTION",
  "DATE / HEURE",
  "TYPE DE PROPRIÉTÉ",
  "TYPE DE PROPRIETE",
  "TYPE DE MAISON",
  "ANNÉE DE CONSTRUCTION",
  "ANNEE DE CONSTRUCTION",
  "CONSTRUIT EN",
  "DESCRIPTION SOMMAIRE DU BÂTIMENT",
  "DESCRIPTION SOMMAIRE DU BATIMENT",
  "RAPPORT D'INSPECTION",
  "RAPPORT D INSPECTION",
];

const CLIENT_LABELS = [
  "REQUÉRANT(S)",
  "REQUERANT(S)",
  "REQUÉRANTS",
  "REQUERANTS",
  "REQUÉRANTS :",
  "REQUERANTS :",
  "REQUERANT",
  "CLIENT(S)",
  "CLIENT",
  "Client",
  "NOM DU CLIENT",
  "ACHETEUR",
  "ACHETEUR(S)",
  "Acheteur",
];

const ADDRESS_LABELS = [
  "ADRESSE",
  "ADRESSE DU BIEN",
  "Adresse",
  "IMMEUBLE INSPECTÉ",
  "IMMEUBLE INSPECTE",
  "LIEU DE L'INSPECTION",
];

function normalize(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

function normalizeLabel(label: string): string {
  return label
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[()]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

function splitLines(text: string): string[] {
  return text.replace(/\r\n/g, "\n").split("\n").map((line) => line.trim());
}

function isStopLabelLine(line: string, labels: string[] = STEVE_STOP_LABELS): boolean {
  const raw = line.trim();
  if (!raw) return false;
  const colonKey = raw.match(/^([^:]+):/);
  const candidate = normalizeLabel(colonKey?.[1] ?? raw.replace(/:$/, ""));
  return labels.some((label) => normalizeLabel(label) === candidate);
}

function readFollowingValueLines(
  lines: string[],
  startIdx: number,
  maxLines = 3,
): string | null {
  const parts: string[] = [];
  for (let i = startIdx; i < lines.length && parts.length < maxLines; i++) {
    const raw = lines[i]?.trim() ?? "";
    if (!raw) {
      if (parts.length > 0) break;
      continue;
    }
    if (isStopLabelLine(raw)) break;
    parts.push(normalize(raw));
  }
  const value = parts.join(", ").trim();
  return value ? value.slice(0, 200) : null;
}

function matchLabelOnLine(
  line: string,
  labels: string[],
): { label: string; sameLineValue: string | null } | null {
  const trimmed = line.trim();
  if (!trimmed) return null;

  const colonMatch = trimmed.match(/^([^:]+):\s*(.*)$/);
  if (colonMatch) {
    const key = normalizeLabel(colonMatch[1] ?? "");
    for (const label of labels) {
      if (normalizeLabel(label) === key) {
        const sameLineValue = normalize(colonMatch[2] ?? "");
        return { label, sameLineValue: sameLineValue || null };
      }
    }
  }

  const labelOnly = trimmed.replace(/:$/, "").trim();
  const keyOnly = normalizeLabel(labelOnly);
  for (const label of labels) {
    if (normalizeLabel(label) === keyOnly) {
      return { label, sameLineValue: null };
    }
  }

  return null;
}

export function extractLabeledValue(text: string, labels: string[]): string | null {
  const lines = splitLines(text).filter(Boolean);
  const normalizedLabels = new Set(labels.map(normalizeLabel));

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    const matched = matchLabelOnLine(line, labels);
    if (!matched) {
      const colon = line.match(/^([^:]+):\s*(.+)$/);
      if (colon) {
        const key = normalizeLabel(colon[1] ?? "");
        if (normalizedLabels.has(key)) {
          const value = normalize(colon[2] ?? "");
          if (value) return value.slice(0, 200);
        }
      }
      continue;
    }

    if (matched.sameLineValue) return matched.sameLineValue.slice(0, 200);

    const nextValue = readFollowingValueLines(lines, i + 1);
    if (nextValue) return nextValue;
  }

  for (const label of labels) {
    const escaped = label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const re = new RegExp(`${escaped}\\s*[:\\-]\\s*(.+?)(?:\\n|$)`, "i");
    const m = text.match(re);
    if (m?.[1]) {
      const value = normalize(m[1]);
      if (value) return value.slice(0, 200);
    }
  }

  return null;
}

function extractAddressFromSteveReport(text: string): string | null {
  const lines = splitLines(text);
  const sectionIdx = lines.findIndex((line) => {
    const key = normalizeLabel(line.replace(/:$/, ""));
    return key === "propriete inspectee" || key === "propriete inspecte";
  });

  if (sectionIdx >= 0) {
    const block = lines.slice(sectionIdx, sectionIdx + 20).join("\n");
    const fromSection = extractLabeledValue(block, ADDRESS_LABELS);
    if (fromSection) return fromSection;
  }

  return extractLabeledValue(text, ADDRESS_LABELS);
}

function extractDescriptionSommaireBlock(text: string): string {
  const lines = text.replace(/\r\n/g, "\n").split("\n");
  const startIdx = lines.findIndex((line) =>
    /description sommaire du b/i.test(normalizeLabel(line)),
  );
  if (startIdx < 0) return "";

  const out: string[] = [];
  for (let i = startIdx + 1; i < lines.length; i++) {
    const line = lines[i]?.trim() ?? "";
    if (!line) {
      if (out.length > 0) break;
      continue;
    }
    const normalized = normalizeLabel(line);
    if (
      out.length > 0 &&
      (normalized.startsWith("condition generale") ||
        normalized.startsWith("rapport d") ||
        normalized.startsWith("constat"))
    ) {
      break;
    }
    out.push(line);
  }
  return out.join("\n");
}

function extractFromDescriptionBlock(
  block: string,
  labels: string[],
): string | null {
  if (!block.trim()) return null;
  return extractLabeledValue(block, labels);
}

function extractOrientationBlock(text: string): string {
  const lines = text.replace(/\r\n/g, "\n").split("\n");
  const startIdx = lines.findIndex((line) =>
    /orientation de la facade/i.test(normalizeLabel(line)),
  );
  if (startIdx < 0) return "";

  const out: string[] = [];
  for (let i = startIdx; i < Math.min(lines.length, startIdx + 8); i++) {
    const line = lines[i]?.trim() ?? "";
    if (line) out.push(line);
  }
  return out.join("\n");
}

export function parseFacadeOrientationFromReport(text: string): InspectionReportOrientation | null {
  const block = extractOrientationBlock(text);
  if (!block.trim()) return null;

  const directions: Array<"nord" | "sud" | "est" | "ouest"> = [
    "nord",
    "sud",
    "est",
    "ouest",
  ];

  for (const direction of directions) {
    const checked = new RegExp(
      `\\b${direction}\\b[^\\n]*(?:[xX✓✔☑]|\\boui\\b)`,
      "i",
    );
    if (checked.test(block)) {
      return {
        facade_direction: direction,
        confidence: 0.95,
        source: "previous_report",
      };
    }
  }

  return null;
}

function extractSteveExteriorValue(block: string, labels: string[]): string | null {
  return extractLabeledValue(block, labels);
}

export function isPreviousInspectionReport(text: string): boolean {
  const normalized = text
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ");
  return (
    /rapport\s+d['']?\s*inspection/i.test(normalized) ||
    /inspection\s+pre-achat/i.test(normalized)
  );
}

export function parseInspectionReportText(rawText: string): InspectionReportParseResult {
  const text = rawText.replace(/\r\n/g, "\n");
  const descriptionBlock = extractDescriptionSommaireBlock(text);
  const fullHaystack = `${descriptionBlock}\n${text}`;

  const clientName = extractLabeledValue(text, CLIENT_LABELS) ?? null;
  const address = extractAddressFromSteveReport(text);

  let city: string | null = null;
  if (address?.includes(",")) {
    const parts = address.split(",").map((p) => p.trim()).filter(Boolean);
    if (parts.length >= 2) city = parts[parts.length - 2] ?? null;
  }

  const inspectionDate =
    extractLabeledValue(text, [
      "DATE ET HEURE",
      "DATE D'INSPECTION",
      "DATE INSPECTION",
      "DATE / HEURE",
    ]) ?? null;

  const buildingType =
    extractLabeledValue(text, [
      "TYPE DE PROPRIÉTÉ",
      "TYPE DE PROPRIETE",
      "Type de maison",
      "TYPE DE MAISON",
    ]) ??
    extractFromDescriptionBlock(descriptionBlock, ["TYPE DE MAISON", "Type de maison"]) ??
    null;

  const buildingYear =
    extractLabeledValue(text, [
      "ANNÉE DE CONSTRUCTION",
      "ANNEE DE CONSTRUCTION",
      "Construit en",
      "CONSTRUIT EN",
    ]) ??
    extractFromDescriptionBlock(descriptionBlock, ["CONSTRUIT EN", "Construit en"]) ??
    null;

  const frontMaterial =
    extractSteveExteriorValue(fullHaystack, [
      "Façade en",
      "Facade en",
      "FAÇADE EN",
      "REVÊTEMENT EXTÉRIEUR",
      "REVETEMENT EXTERIEUR",
      "FAÇADE AVANT",
      "FACADE AVANT",
    ]) ?? null;

  const sidesMaterial =
    extractSteveExteriorValue(fullHaystack, [
      "Côté de maison",
      "Cote de maison",
      "CÔTÉS",
      "COTES",
    ]) ?? null;

  const rearMaterial =
    extractSteveExteriorValue(fullHaystack, [
      "Arrière de maison",
      "Arriere de maison",
      "ARRIÈRE",
      "ARRIERE",
    ]) ?? null;

  const roofCovering =
    extractSteveExteriorValue(fullHaystack, [
      "Toiture",
      "TOITURE",
      "Couverture",
      "COUVERTURE",
    ]) ?? null;

  const foundationType =
    extractSteveExteriorValue(fullHaystack, [
      "Type de fondation",
      "TYPE DE FONDATION",
      "FONDATION",
    ]) ?? null;

  const structureType =
    extractSteveExteriorValue(fullHaystack, [
      "Type de Structure",
      "TYPE DE STRUCTURE",
      "STRUCTURE",
    ]) ?? null;

  const heatingType =
    extractSteveExteriorValue(fullHaystack, [
      "Type de chauffage du bâtiment",
      "Type de chauffage du batiment",
      "TYPE DE CHAUFFAGE",
      "CHAUFFAGE",
      "Système de chauffage",
    ]) ?? null;

  const orientation = parseFacadeOrientationFromReport(text);

  return {
    client: { name: clientName },
    property: { address, city },
    inspection: { date: inspectionDate },
    building: {
      type: buildingType,
      year: buildingYear,
      facade_material: frontMaterial,
      sides_material: sidesMaterial,
      rear_material: rearMaterial,
      roof_covering: roofCovering,
      foundation_type: foundationType,
      structure_type: structureType,
      heating_type: heatingType,
    },
    orientation,
  };
}
