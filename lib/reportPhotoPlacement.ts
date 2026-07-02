/**
 * Phase 8V — Placement photos → système / composante (couche au-dessus de Photo Intelligence).
 */

export type PhotoKnowledgeHint = {
  tag: string;
  system_id: string;
  component_id: string;
  inventory_field_id?: string;
  defect_candidate?: string;
};

export const PHOTO_KNOWLEDGE_HINTS: readonly PhotoKnowledgeHint[] = [
  { tag: "electrical_panel", system_id: "electricite", component_id: "electricite_panneau_principal" },
  { tag: "electrical_panel_photo", system_id: "electricite", component_id: "electricite_panneau_principal" },
  { tag: "photo.electrical_panel", system_id: "electricite", component_id: "electricite_panneau_principal" },
  { tag: "ground_wire", system_id: "electricite", component_id: "electricite_mise_terre" },
  { tag: "ground_wire_photo", system_id: "electricite", component_id: "electricite_mise_terre" },
  { tag: "photo.ground_wire", system_id: "electricite", component_id: "electricite_mise_terre" },
  { tag: "service_entry", system_id: "electricite", component_id: "electricite_entree" },
  { tag: "gfci", system_id: "electricite", component_id: "electricite_ddfi" },
  { tag: "smoke_detector", system_id: "electricite", component_id: "electricite_detecteurs" },
  { tag: "water_heater", system_id: "plomberie", component_id: "plomberie_chauffe_eau" },
  { tag: "roof_covering", system_id: "toiture", component_id: "toiture_revetement" },
  { tag: "foundation_crack", system_id: "structure", component_id: "structure_fondation" },
  { tag: "exterior_siding", system_id: "exterieur", component_id: "exterieur_revetement" },
  { tag: "wood_floor", system_id: "interieur", component_id: "interieur_planchers", inventory_field_id: "salon" },
  { tag: "wood_floor_photo", system_id: "interieur", component_id: "interieur_planchers", inventory_field_id: "salon" },
  { tag: "photo.wood_floor", system_id: "interieur", component_id: "interieur_planchers", inventory_field_id: "salon" },
  { tag: "interieur_planchers_salon", system_id: "interieur", component_id: "interieur_planchers", inventory_field_id: "salon" },
] as const;

export type PhotoPlacementInput = {
  photo_id: string;
  system_hint?: string;
  component_hint?: string;
  inventory_field_hint?: string;
  defect_candidate?: string;
};

export function resolvePhotoKnowledgePlacement(
  input: PhotoPlacementInput,
): { system_id: string; component_id: string; inventory_field_id?: string } | null {
  const hints = [input.component_hint, input.system_hint].filter(Boolean) as string[];

  for (const hint of hints) {
    const normalized = hint.trim().toLowerCase();
    const match = PHOTO_KNOWLEDGE_HINTS.find(
      (row) =>
        row.tag.toLowerCase() === normalized ||
        row.component_id.toLowerCase() === normalized ||
        row.system_id.toLowerCase() === normalized,
    );
    if (match) {
      return {
        system_id: match.system_id,
        component_id: match.component_id,
        inventory_field_id: match.inventory_field_id,
      };
    }
  }

  if (input.component_hint?.startsWith("electricite_")) {
    return { system_id: "electricite", component_id: input.component_hint };
  }

  if (input.component_hint === "interieur_planchers" && input.inventory_field_hint === "salon") {
    return {
      system_id: "interieur",
      component_id: "interieur_planchers",
      inventory_field_id: "salon",
    };
  }

  return null;
}

export function groupPhotosByComponent(
  photos: PhotoPlacementInput[],
): Map<string, string[]> {
  const map = new Map<string, string[]>();
  for (const photo of photos) {
    const placement = resolvePhotoKnowledgePlacement(photo);
    if (!placement) continue;
    const key = placement.component_id;
    const list = map.get(key) ?? [];
    list.push(photo.photo_id);
    map.set(key, list);
  }
  return map;
}
