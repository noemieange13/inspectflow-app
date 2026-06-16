import { generateReportAccessToken } from "@/lib/reportAccessToken";
import { defaultCoverPayloadV1 } from "@/lib/inspectionCoverPayload";

function stringField(input: Record<string, unknown>, key: string): string {
  const value = input[key];
  return typeof value === "string" ? value.trim() : "";
}

function firstStringField(input: Record<string, unknown>, keys: string[]): string {
  for (const key of keys) {
    const value = stringField(input, key);
    if (value) return value;
  }
  return "";
}

function languageField(input: Record<string, unknown>): "fr" | "en" {
  return stringField(input, "language") === "en" ? "en" : "fr";
}

export type CreateInspectionInsert = {
  payload: Record<string, unknown>;
  access_token: string;
  created_at: string;
};

/**
 * Legacy quick-start endpoint input is intentionally small; every report it creates
 * must still be tokenized and use the canonical cover payload shape.
 */
export function buildCreateInspectionInsert(
  raw: unknown,
  now = new Date(),
): CreateInspectionInsert {
  const input = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  const cover = defaultCoverPayloadV1();
  const createdAt = now.toISOString();

  const clientName = firstStringField(input, ["clientName", "client_nom", "requerants"]);
  const address = firstStringField(input, ["address", "propriete_adresse"]);
  const inspectionType = firstStringField(input, ["inspectionType", "type_propriete"]);

  cover.requerants = firstStringField(input, ["requerants", "clientName", "client_nom"]);
  cover.conditions_meteo = stringField(input, "conditions_meteo");
  cover.date_heure_affichage = stringField(input, "date_heure") || cover.date_heure_affichage;
  cover.date_heure_iso = createdAt;
  cover.duree_inspection = stringField(input, "duree_inspection");
  cover.propriete = {
    ...cover.propriete,
    adresse: address,
    type_propriete: inspectionType,
    annee_construction: stringField(input, "annee_construction"),
    client_nom: clientName,
    client_telephone: stringField(input, "client_telephone"),
    client_courriel: stringField(input, "client_courriel"),
  };
  cover.description_sommaire = {
    ...cover.description_sommaire,
    mode: "manuel",
  };
  cover.generated_description_text = stringField(input, "description_sommaire") || null;
  cover.condition_generale = stringField(input, "condition_generale");
  const orientation = stringField(input, "orientation_facade");
  cover.orientation_facade =
    orientation === "nord" || orientation === "sud" || orientation === "est" || orientation === "ouest"
      ? orientation
      : "";

  return {
    payload: {
      cover_v1: cover,
      language: languageField(input),
      created_at: createdAt,
    },
    access_token: generateReportAccessToken(),
    created_at: createdAt,
  };
}
