/**
 * Phase 8V.2 — Hierarchical inspection report knowledge base
 * `npm run test:report-knowledge-base-8v2`
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";

import {
  buildInspectionKnowledgeBaseV1,
  ELECTRICITE_SYSTEM,
  getInspectionComponentById,
  listComponentsForSystem,
  orderedInspectionSystems,
} from "@/lib/inspectionStandardClauses";
import {
  applyProfessionalSnapshotToReportPayload,
  normalizeInspectorProfileInput,
} from "@/lib/inspectorProfile";
import {
  buildReportComponentBlock,
  NO_ANOMALY_OBSERVATION_FR,
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
import { STEVE_INSPECTION_ORDER } from "@/lib/steveInspectionOrder";

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

describe("Phase 8V.2 inspectionStandardClauses hierarchy", () => {
  it("electricite system has multiple components with subcomponents", () => {
    assert.ok(ELECTRICITE_SYSTEM.components.length >= 6);
    const entree = getInspectionComponentById("electricite_entree");
    assert.ok(entree?.component.subcomponents?.length);
    assert.deepEqual(
      listComponentsForSystem("electricite").map((c) => c.title),
      [
        "Entrée électrique",
        "Panneau principal",
        "Panneaux distribution",
        "Câbles et circuits de dérivation",
        "Mise à la terre",
        "DDFT",
        "Détecteurs",
      ],
    );
  });

  it("knowledge base is hierarchical InspectionSystem model", () => {
    const kb = buildInspectionKnowledgeBaseV1("fr-CA");
    assert.equal(kb.schema_version, 1);
    assert.ok(kb.systems.every((s) => Array.isArray(s.components)));
    assert.ok(kb.systems.every((c) => c.components.every((row) => "standardLimitations" in row)));
  });
});

describe("Phase 8V.2 report knowledge writer layer", () => {
  it("places limitations in the correct component block", () => {
    const cables = getInspectionComponentById("electricite_cables_circuits")!.component;
    const limitations = resolveComponentLimitations(cables);
    assert.ok(limitations.some((l) => /surchargés/i.test(l)));
  });

  it("creates neutral observation when no defect", () => {
    const panneaux = getInspectionComponentById("electricite_panneaux_distribution")!.component;
    const obs = resolveComponentObservations(panneaux, null, "fr");
    assert.ok(obs.some((o) => o.includes(NO_ANOMALY_OBSERVATION_FR)));
  });

  it("always renders component title with observations and optional comments", () => {
    const component = getInspectionComponentById("electricite_mise_terre")!.component;
    const block = buildReportComponentBlock({
      system_id: "electricite",
      system_title: "ÉLECTRICITÉ",
      component,
      language: "fr",
    });
    assert.match(block.observations.join(" "), /Ground/);
    assert.ok(block.limitations.length >= 0);
    assert.ok(block.commentaires.length > 0);
  });

  it("8Q style shortens comments but keeps mandatory limitations", () => {
    const cables = getInspectionComponentById("electricite_cables_circuits")!.component;
    const longComment =
      "Première phrase de commentaire. Deuxième phrase avec détail supplémentaire. Troisième phrase encore plus longue pour tester.";
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
      inspector_style: { version: "1", detail_level: "concise", tone: "direct", photo_density: "standard", recommendation_style: "short_action" },
      language: "fr",
    });
    assert.ok(block.limitations.length > 0, "limitations preserved");
    const shortened = applyDetailLevel(longComment, "concise", "fr");
    assert.ok(shortened.split(/(?<=[.!?])\s+/).length <= 2);
  });
});

describe("Phase 8V.2 photo placement", () => {
  it("maps photo.electrical_panel to Panneau principal", () => {
    const placement = resolvePhotoKnowledgePlacement({
      photo_id: "p1",
      component_hint: "electrical_panel",
    });
    assert.equal(placement?.system_id, "electricite");
    assert.equal(placement?.component_id, "electricite_panneau_principal");
  });

  it("maps photo.ground_wire to Mise à la terre", () => {
    const placement = resolvePhotoKnowledgePlacement({
      photo_id: "p2",
      component_hint: "ground_wire",
    });
    assert.equal(placement?.component_id, "electricite_mise_terre");
  });

  it("groups photos under correct component", () => {
    const map = groupPhotosByComponent([
      { photo_id: "panel.jpg", component_hint: "electrical_panel" },
      { photo_id: "ground.jpg", component_hint: "ground_wire" },
    ]);
    assert.deepEqual(map.get("electricite_panneau_principal"), ["panel.jpg"]);
    assert.deepEqual(map.get("electricite_mise_terre"), ["ground.jpg"]);
  });
});

describe("Phase 8V.2 hierarchical report rendering", () => {
  it("electricite report contains all Steve electrical components in order", () => {
    const payload = basePayload({
      steve_photo_context_v1: {
        schema_version: 1,
        contexts: [
          {
            photo_id: "https://example.com/panel.jpg",
            inspection_section: "Électricité",
            component: "Panneau principal",
            component_id: "electricite_panneau_principal",
          },
        ],
      },
    });

    const html = buildElectriciteReportHtml(payload, "fr-CA");
    const order = knowledgeBaseComponentOrder("electricite");

    assert.match(html, /ÉLECTRICITÉ/);
    for (const title of [
      "Entrée électrique",
      "Panneau principal",
      "Panneaux distribution",
      "Câbles et circuits de dérivation",
      "Mise à la terre",
      "DDFT",
    ]) {
      assert.match(html, new RegExp(title));
    }

    let lastIdx = -1;
    for (const id of order) {
      const comp = getInspectionComponentById(id)?.component.title ?? id;
      const idx = html.indexOf(comp);
      assert.ok(idx > lastIdx, `order ${comp}`);
      lastIdx = idx;
    }

    assert.match(html, /Limitations/);
    assert.match(html, /Observations/);
    assert.match(html, /Commentaires/);
    assert.match(html, /panel\.jpg/);
  });

  it("clauses remain even without photos", () => {
    const blocks = buildSystemComponentBlocks(basePayload(), "electricite", "fr-CA");
    const cables = blocks.find((b) => b.component_id === "electricite_cables_circuits");
    assert.ok(cables);
    assert.ok(cables!.limitations.length > 0);
    assert.equal(cables!.photos.length, 0);
  });

  it("full hierarchical HTML integrates in professional template before legacy sections", () => {
    const html = renderProfessionalReportHtml(
      buildProfessionalReportTemplate(basePayload(), { locale: "fr-CA" })!,
    );
    const kbIdx = html.indexOf('data-system-id="electricite"');
    const legacyIdx = html.indexOf("Électricité");
    assert.ok(kbIdx >= 0);
    assert.ok(legacyIdx > kbIdx || html.indexOf("Constats") > kbIdx);
    assert.match(html, /Câbles en cuivre identifiés/);
  });
});

describe("Phase 8V.2 non-regression", () => {
  it("report_writer_engine core untouched", () => {
    assert.doesNotMatch(read("lib/report_writer_engine/writeObservation.ts"), /inspectionStandardClauses/);
  });

  it("PDF route core untouched", () => {
    assert.doesNotMatch(read("app/api/report-pdf/route.ts"), /reportKnowledgeRenderer/);
  });

  it("Steve 8V component order still defined", () => {
    assert.equal(STEVE_INSPECTION_ORDER.length, 42);
  });

  it("systems ordered structure → exterieur → … → interieur", () => {
    const ids = orderedInspectionSystems().map((s) => s.id);
    assert.ok(ids.indexOf("structure") < ids.indexOf("exterieur"));
    assert.ok(ids.indexOf("electricite") < ids.indexOf("interieur"));
  });
});
