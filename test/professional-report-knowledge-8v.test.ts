/**
 * Phase 8V — Professional Inspector Report Knowledge Base (Steve Model)
 * `npm run test:professional-report-knowledge-8v`
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";

import {
  buildInspectionKnowledgeBaseV1,
  ELECTRICITE_SYSTEM,
  getInspectionComponentById,
  INTERIEUR_SYSTEM,
  listComponentsForSystem,
  NO_ANOMALY_OBSERVATION_FR,
  orderedInspectionSystems,
  resolveComponentInventoryItems,
} from "@/lib/inspectionKnowledgeBase";
import {
  applyProfessionalSnapshotToReportPayload,
  normalizeInspectorProfileInput,
} from "@/lib/inspectorProfile";
import {
  buildReportComponentBlock,
  renderReportComponentBlockHtml,
  resolveComponentLimitations,
  resolveComponentObservations,
} from "@/lib/reportKnowledgeWriter";
import {
  buildElectriciteReportHtml,
  buildHierarchicalReportHtml,
  buildSystemComponentBlocks,
  knowledgeBaseComponentOrder,
} from "@/lib/reportKnowledgeRenderer";
import {
  buildProfessionalReportTemplate,
  renderProfessionalReportHtml,
} from "@/lib/report_template_engine";
import {
  groupPhotosByComponent,
  resolvePhotoKnowledgePlacement,
} from "@/lib/reportPhotoPlacement";
import { applyDetailLevel } from "@/lib/report_writer_engine/inspectorStyle";

const ROOT = join(process.cwd());

function read(rel: string): string {
  return readFileSync(join(ROOT, rel), "utf8");
}

const SAMPLE_PROFILE = normalizeInspectorProfileInput({
  company_name: "InspectPro Inc.",
  display_name: "Steve Last",
  certification_number: "AIBQ-123",
  preferred_ui_language: "fr-CA",
  default_client_report_language: "fr-CA",
});

function basePayload(extra?: Record<string, unknown>): Record<string, unknown> {
  return applyProfessionalSnapshotToReportPayload(
    {
      cover_v1: {
        schema_version: 1,
        address: "123 Rue Example",
        propriete: { adresse: "123 Rue Example", client_nom: "Client" },
        inspecteur_nom: "Steve Last",
        inspecteur_numero_certification: "AIBQ-123",
        compagnie: "InspectPro Inc.",
        date_heure_affichage: "2026-06-18",
      },
      sections: [
        {
          id: "obs-1",
          title: "Électricité",
          observation: "Test",
          zone: "installation_electrique",
          severity: "medium",
        },
      ],
      entries: [
        {
          id: "obs-1",
          zone: "installation_electrique",
          issue: "electrical_risk",
          severity: "medium",
          note: "Test",
        },
      ],
      ...extra,
    },
    SAMPLE_PROFILE,
  );
}

describe("Phase 8V inspectionKnowledgeBase", () => {
  it("system with multiple components and component types", () => {
    assert.ok(ELECTRICITE_SYSTEM.components.length >= 7);
    assert.ok(INTERIEUR_SYSTEM.components.some((c) => c.componentType === "inventory"));
    const kb = buildInspectionKnowledgeBaseV1("fr-CA");
    assert.equal(kb.schema_version, 1);
    assert.ok(kb.systems.every((s) => s.components.every((c) => c.componentType)));
  });

  it("electricite complete: entree, panneau, circuits, mise a terre", () => {
    const titles = listComponentsForSystem("electricite").map((c) => c.title);
    assert.deepEqual(titles, [
      "Entrée électrique",
      "Panneau principal",
      "Panneaux distribution",
      "Câbles et circuits de dérivation",
      "Mise à la terre",
      "DDFT",
      "Détecteurs",
    ]);

    const entree = getInspectionComponentById("electricite_entree");
    assert.ok(entree?.component.subcomponents?.some((s) => /Branchement/i.test(s.title)));

    const panneau = getInspectionComponentById("electricite_panneau_principal")!.component;
    assert.ok(panneau.standardCharacteristics?.length);
    assert.ok(panneau.standardLimitations.some((l) => /dégagement/i.test(l)));

    const cables = getInspectionComponentById("electricite_cables_circuits")!.component;
    assert.ok(resolveComponentLimitations(cables).some((l) => /surchargés/i.test(l)));
    assert.ok(resolveComponentObservations(cables, null, "fr").some((o) => /cuivre/i.test(o)));

    const ground = getInspectionComponentById("electricite_mise_terre")!.component;
    assert.ok(resolveComponentObservations(ground, null, "fr").some((o) => /Ground/i.test(o)));
  });
});

describe("Phase 8V writer merge and render order", () => {
  it("limitations placed before observations in HTML", () => {
    const panneau = getInspectionComponentById("electricite_panneau_principal")!.component;
    const block = buildReportComponentBlock({
      system_id: "electricite",
      system_title: "ÉLECTRICITÉ",
      component: panneau,
      language: "fr",
    });
    const html = renderBlock(block);
    const limIdx = html.indexOf("Limitations");
    const charIdx = html.indexOf("Caractéristiques");
    const obsIdx = html.indexOf("Observations");
    assert.ok(limIdx >= 0 && charIdx > limIdx && obsIdx > charIdx);
  });

  it("normal observation is not treated as defect", () => {
    const panneaux = getInspectionComponentById("electricite_panneaux_distribution")!.component;
    const block = buildReportComponentBlock({
      system_id: "electricite",
      system_title: "ÉLECTRICITÉ",
      component: panneaux,
      language: "fr",
    });
    assert.equal(block.component_type, "technical");
    assert.ok(block.observations.some((o) => /panneau de distribution/i.test(o)));
    assert.equal(block.recommendation, undefined);
  });

  it("inventory planchers section with materials per room", () => {
    const planchers = getInspectionComponentById("interieur_planchers")!.component;
    const items = resolveComponentInventoryItems(planchers);
    assert.ok(items.some((i) => i.label === "Salon" && /bois franc/i.test(i.value)));
    assert.ok(items.some((i) => i.label === "Entrée" && /céramique/i.test(i.value)));

    const block = buildReportComponentBlock({
      system_id: "interieur",
      system_title: "INTÉRIEUR",
      component: planchers,
      language: "fr",
    });
    const html = renderBlock(block);
    assert.match(html, /Inventaire/);
    assert.match(html, /Salon : bois franc/);
    assert.match(html, /revêtements de planchers étaient en bon état/i);
  });

  it("standard comments present even without defect", () => {
    const detecteurs = getInspectionComponentById("electricite_detecteurs")!.component;
    const block = buildReportComponentBlock({
      system_id: "electricite",
      system_title: "ÉLECTRICITÉ",
      component: detecteurs,
      language: "fr",
    });
    assert.ok(block.observations.some((o) => o.includes(NO_ANOMALY_OBSERVATION_FR)));
    assert.ok(block.commentaires.length > 0);
  });

  it("defect_based block includes recommendation only when anomaly", () => {
    const fondation = getInspectionComponentById("structure_fondation")!.component;
    const block = buildReportComponentBlock({
      system_id: "structure",
      system_title: "STRUCTURE",
      component: fondation,
      finding: {
        schema_version: 1,
        component_id: "structure_fondation",
        section: "Structure",
        component: "Fondation",
        observation: "Fissure horizontale observée au solage.",
        commentaire: "Fissure typique de tassement; surveillance recommandée.",
        recommandation_optional: "Consulter un spécialiste en fondation.",
        severity: "mineur",
        photos: ["https://example.com/crack.jpg"],
      },
      language: "fr",
    });
    assert.equal(block.component_type, "defect_based");
    assert.match(renderBlock(block), /Recommandation/);
    assert.match(renderBlock(block), /spécialiste en fondation/);
  });

  it("8Q style shortens comments but keeps mandatory limitations", () => {
    const cables = getInspectionComponentById("electricite_cables_circuits")!.component;
    const longComment =
      "Première phrase. Deuxième phrase avec détail. Troisième phrase encore plus longue.";
    const block = buildReportComponentBlock({
      system_id: "electricite",
      system_title: "ÉLECTRICITÉ",
      component: cables,
      finding: {
        schema_version: 1,
        component_id: "electricite_cables_circuits",
        section: "Électricité",
        component: "Câbles",
        observation: "Câbles en cuivre identifiés.",
        commentaire: longComment,
        severity: "none",
        photos: [],
      },
      inspector_style: {
        version: "1",
        detail_level: "concise",
        tone: "direct",
        photo_density: "standard",
        recommendation_style: "short_action",
      },
      language: "fr",
    });
    assert.ok(block.limitations.length >= 3);
    const shortened = applyDetailLevel(longComment, "concise", "fr");
    assert.ok(shortened.split(/(?<=[.!?])\s+/).length <= 2);
  });
});

describe("Phase 8V photo placement", () => {
  it("maps electrical_panel_photo to Panneau principal", () => {
    const p = resolvePhotoKnowledgePlacement({
      photo_id: "p1",
      component_hint: "electrical_panel_photo",
    });
    assert.equal(p?.system_id, "electricite");
    assert.equal(p?.component_id, "electricite_panneau_principal");
  });

  it("maps ground_wire_photo to Mise a terre", () => {
    const p = resolvePhotoKnowledgePlacement({
      photo_id: "p2",
      component_hint: "ground_wire_photo",
    });
    assert.equal(p?.component_id, "electricite_mise_terre");
  });

  it("maps wood_floor_photo to Interieur Planchers", () => {
    const p = resolvePhotoKnowledgePlacement({
      photo_id: "p3",
      component_hint: "wood_floor_photo",
    });
    assert.equal(p?.system_id, "interieur");
    assert.equal(p?.component_id, "interieur_planchers");
    assert.equal(p?.inventory_field_id, "salon");
  });

  it("groups photos under correct component", () => {
    const map = groupPhotosByComponent([
      { photo_id: "panel.jpg", component_hint: "electrical_panel_photo" },
      { photo_id: "floor.jpg", component_hint: "wood_floor_photo" },
    ]);
    assert.deepEqual(map.get("electricite_panneau_principal"), ["panel.jpg"]);
    assert.deepEqual(map.get("interieur_planchers"), ["floor.jpg"]);
  });
});

describe("Phase 8V Steve report structure", () => {
  it("electricite report order matches Steve model", () => {
    const payload = basePayload({
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
            component_hint: "wood_floor_photo",
          },
        ],
      },
    });

    const html = buildElectriciteReportHtml(payload, "fr-CA");
    const order = knowledgeBaseComponentOrder("electricite");
    let lastIdx = -1;
    for (const id of order) {
      const title = getInspectionComponentById(id)?.component.title ?? id;
      const idx = html.indexOf(title);
      assert.ok(idx > lastIdx, `order ${title}`);
      lastIdx = idx;
    }
    assert.match(html, /panel\.jpg/);
  });

  it("full hierarchical HTML in professional template (PDF 8L path)", () => {
    const html = renderProfessionalReportHtml(
      buildProfessionalReportTemplate(basePayload(), { locale: "fr-CA" })!,
    );
    assert.match(html, /data-system-id="electricite"/);
    assert.match(html, /data-system-id="interieur"/);
    assert.match(html, /Inventaire/);
    assert.match(html, /Salon : bois franc/);
    assert.doesNotMatch(read("app/api/report-pdf/route.ts"), /reportKnowledgeRenderer/);
  });

  it("systems ordered structure to exterieur to interieur", () => {
    const ids = orderedInspectionSystems().map((s) => s.id);
    assert.ok(ids.indexOf("structure") < ids.indexOf("exterieur"));
    assert.ok(ids.indexOf("electricite") < ids.indexOf("interieur"));
  });

  it("complete report sections even without defects", () => {
    const html = buildHierarchicalReportHtml(basePayload(), "fr-CA");
    assert.match(html, /Limitations/);
    assert.match(html, /Observations/);
    assert.match(html, /Commentaires/);
    assert.match(html, /Aucune anomalie apparente/);
  });
});

describe("Phase 8V non-regression", () => {
  it("report_writer_engine core untouched", () => {
    assert.doesNotMatch(read("lib/report_writer_engine/writeObservation.ts"), /inspectionKnowledgeBase/);
  });

  it("inspectionKnowledgeBase.ts is canonical source", () => {
    assert.match(read("lib/inspectionKnowledgeBase.ts"), /componentType/);
    assert.match(read("lib/inspectionKnowledgeBase.ts"), /inventoryFields/);
  });
});

function renderBlock(block: ReturnType<typeof buildReportComponentBlock>): string {
  return renderReportComponentBlockHtml(block, "fr");
}
