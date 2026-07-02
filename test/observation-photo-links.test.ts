/**
 * Zero Draft : association photo ↔ constat via observation_id uniquement.
 * `npm run test:observation-photos`
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  collectValidObservationIds,
  createObservationId,
  ensureReportEntryIds,
  isObservationId,
  resolveUploadTargetObservationId,
} from "@/lib/observationIds";
import { buildHtmlFromReportPayload } from "@/lib/buildInspectionReportHtml";
import { buildStructuredReport, type ReportEntryInput } from "@/lib/reportNarrative";
import {
  auditObservationPhotoIntegrity,
  buildObservationPhotoUrlsById,
  parsePhotoObservationLinks,
  type ObservationPhotoRow,
} from "@/lib/reportObservationPhotos";

function entry(partial: Partial<ReportEntryInput> & Pick<ReportEntryInput, "zone" | "issue">): ReportEntryInput {
  return {
    id: createObservationId(),
    severity: "medium",
    note: "",
    ...partial,
  };
}

describe("observation_id stable sur les constats", () => {
  it("ensureReportEntryIds ne régénère pas un id existant", () => {
    const id = createObservationId();
    const rows = ensureReportEntryIds([
      { id, zone: "salon", issue: "water_infiltration", severity: "medium" },
    ]);
    assert.equal(rows[0]?.id, id);
  });

  it("buildStructuredReport propage entry.id vers section.id", () => {
    const id = createObservationId();
    const { sections } = buildStructuredReport([
      { id, zone: "fondation", issue: "crack_wall", severity: "high", note: "Fissure A" },
    ]);
    assert.equal((sections[0] as { id?: string }).id, id);
  });
});

describe("association auto à l'upload (cible constat)", () => {
  it("bouton constat → id explicite", () => {
    const a = entry({ zone: "salon", issue: "water_infiltration" });
    const b = entry({ zone: "fondation", issue: "crack_wall" });
    const target = resolveUploadTargetObservationId([a, b], a.id);
    assert.equal(target, a.id);
  });

  it("constat unique → auto sans clic", () => {
    const only = entry({ zone: "toiture", issue: "roof_wear" });
    assert.equal(resolveUploadTargetObservationId([only], null), only.id);
  });

  it("plusieurs constats sans cible → pas d'auto (évite mauvaise association)", () => {
    const a = entry({ zone: "salon", issue: "water_infiltration" });
    const b = entry({ zone: "fondation", issue: "crack_wall" });
    assert.equal(resolveUploadTargetObservationId([a, b], null), null);
  });
});

describe("scénario complet 5 constats × photos", () => {
  it("suppression photo, changement texte, réordonnancement — liens intacts", () => {
    const entries = ensureReportEntryIds([
      entry({ zone: "fondation", issue: "crack_wall", note: "C1" }),
      entry({ zone: "toiture", issue: "roof_wear", note: "C2" }),
      entry({ zone: "installation_electrique", issue: "electrical_risk", note: "C3" }),
      entry({ zone: "plomberie", issue: "plumbing_issue", note: "C4" }),
      entry({ zone: "sous_sol", issue: "humidity_mold", note: "C5" }),
    ]);
    assert.equal(entries.length, 5);

    const validIds = collectValidObservationIds(entries);
    assert.equal(validIds.size, 5);

    type SimPhoto = ObservationPhotoRow & { observation_id: string };
    let photos: SimPhoto[] = entries.flatMap((e, i) =>
      [1, 2, 3].map((n) => ({
        id: `photo-${e.id}-${n}`,
        observation_id: e.id!,
        storage_path: `path/${e.id}/${n}.jpg`,
        url: `https://cdn.example/${e.id}/${n}.jpg`,
      })),
    );
    assert.equal(photos.length, 15);

    photos = photos.filter((p) => !p.id.endsWith("-2"));
    assert.equal(photos.length, 10);

    const entriesTextChanged = entries.map((e, i) =>
      i === 2 ? { ...e, note: "Texte modifié électrique" } : e,
    );
    assert.equal(entriesTextChanged[2]?.note, "Texte modifié électrique");

    const reordered = [...entriesTextChanged].reverse();
    const validAfterReorder = collectValidObservationIds(reordered);
    assert.equal(validAfterReorder.size, 5);

    const urlMap = buildObservationPhotoUrlsById(photos, validAfterReorder);
    for (const e of reordered) {
      const urls = urlMap[e.id!] ?? [];
      assert.equal(urls.length, 2, `constat ${e.id} doit garder 2 photos`);
      for (const u of urls) {
        assert.match(u, new RegExp(e.id!.replace(/-/g, "\\-")));
      }
    }

    const integrity = auditObservationPhotoIntegrity(photos, validAfterReorder);
    assert.equal(integrity.excluded_photo_ids.length, 0);

    const { sections } = buildStructuredReport(reordered);
    const payload: Record<string, unknown> = {
      title: "Test",
      language: "fr",
      entries: reordered,
      sections,
      observation_photos_v1: {
        schema_version: 1,
        urls_by_observation_id: urlMap,
      },
      photo_integrity_v1: integrity,
    };

    const html = buildHtmlFromReportPayload(payload);
    assert.ok(html && html.length > 100);
    for (const e of reordered) {
      const url = urlMap[e.id!]![0]!;
      assert.ok(html!.includes(url), `PDF HTML doit inclure photo de ${e.id}`);
    }
  });

  it("photo orpheline exclue du PDF et signalée", () => {
    const e1 = entry({ zone: "salon", issue: "water_infiltration" });
    const valid = collectValidObservationIds([e1]);
    const rows: ObservationPhotoRow[] = [
      { id: "ok", observation_id: e1.id!, storage_path: "a.jpg", url: "https://x/a.jpg" },
      { id: "orphan", observation_id: null, storage_path: "b.jpg", url: "https://x/b.jpg" },
    ];
    const integrity = auditObservationPhotoIntegrity(rows, valid);
    assert.deepEqual(integrity.excluded_photo_ids, ["orphan"]);
    assert.equal(integrity.exclusion_reasons.orphan, "missing_observation_id");

    const urlMap = buildObservationPhotoUrlsById(rows, valid);
    assert.equal(Object.keys(urlMap).length, 1);
    assert.ok(urlMap[e1.id!]?.length === 1);
  });
});

describe("détachement immédiat (suppression constat)", () => {
  it("parsePhotoObservationLinks accepte observation_id null pour persistance", () => {
    const links = parsePhotoObservationLinks([
      { photo_id: "aaaaaaaa-bbbb-4ccc-dddd-eeeeeeeeeeee", observation_id: null },
    ]);
    assert.ok(links);
    assert.equal(links!.length, 1);
    assert.equal(links![0]!.observation_id, null);
  });

  it("après détachement simulé, les photos ne matchent plus le constat supprimé", () => {
    const obsId = createObservationId();
    const otherId = createObservationId();
    const valid = collectValidObservationIds([
      { id: otherId, zone: "salon", issue: "water_infiltration", severity: "medium" },
    ]);
    const rows: ObservationPhotoRow[] = [
      {
        id: "p-detached",
        observation_id: null,
        storage_path: "x.jpg",
        url: "https://cdn/x.jpg",
      },
    ];
    const integrity = auditObservationPhotoIntegrity(rows, valid);
    assert.deepEqual(integrity.excluded_photo_ids, ["p-detached"]);
    assert.equal(integrity.exclusion_reasons["p-detached"], "missing_observation_id");
    assert.equal(integrity.included_by_observation_id[obsId], undefined);
  });
});

describe("aucune association PDF par index / zone / texte / nom fichier", () => {
  it("buildObservationPhotoUrlsById ignore l'ordre des lignes et n'utilise que observation_id", () => {
    const idA = createObservationId();
    const idB = createObservationId();
    const valid = new Set([idA, idB]);
    const rows: ObservationPhotoRow[] = [
      { id: "p2", observation_id: idB, storage_path: null, url: "https://u/b" },
      { id: "p1", observation_id: idA, storage_path: null, url: "https://u/a" },
    ];
    const shuffled = [...rows].reverse();
    const map1 = buildObservationPhotoUrlsById(rows, valid);
    const map2 = buildObservationPhotoUrlsById(shuffled, valid);
    assert.deepEqual(map1, map2);
    assert.deepEqual(map1[idA], ["https://u/a"]);
    assert.deepEqual(map1[idB], ["https://u/b"]);
  });

  it("isObservationId rejette les clés non-UUID (ex. nom fichier)", () => {
    assert.equal(isObservationId("IMG_001.jpg"), false);
    assert.equal(isObservationId("salon"), false);
    assert.equal(isObservationId(createObservationId()), true);
  });
});

describe("Smart Inspection — observation_id sur photos", () => {
  it("applyPhotoPickAssignments lie photo_id → constat.id via indices API", async () => {
    const { applyPhotoPickAssignments, createSmartPhotoId } = await import(
      "@/lib/smartInspectionPhotos"
    );
    const constatId = createObservationId();
    const p1 = createSmartPhotoId();
    const p2 = createSmartPhotoId();
    const registry = new Map([
      [p1, { photo_id: p1, name: "a.jpg", observation_id: null }],
      [p2, { photo_id: p2, name: "b.jpg", observation_id: null }],
    ]);
    applyPhotoPickAssignments(
      [{ photo_id: p1 }, { photo_id: p2 }],
      { [constatId]: [1] },
      new Set([constatId]),
      registry,
    );
    assert.equal(registry.get(p1)?.observation_id, null);
    assert.equal(registry.get(p2)?.observation_id, constatId);
  });

  it("photosForConstat filtre strictement observation_id === constat.id", async () => {
    const { photosForConstat, createSmartPhotoId } = await import("@/lib/smartInspectionPhotos");
    const constatId = createObservationId();
    const otherId = createObservationId();
    const pool = [
      {
        photo_id: createSmartPhotoId(),
        observation_id: constatId,
        name: "linked.jpg",
      },
      {
        photo_id: createSmartPhotoId(),
        observation_id: otherId,
        name: "other.jpg",
      },
      {
        photo_id: createSmartPhotoId(),
        observation_id: null,
        name: "orphan.jpg",
      },
    ];
    const linked = photosForConstat({ id: constatId, photos: pool }, pool);
    assert.equal(linked.length, 1);
    assert.equal(linked[0]?.observation_id, constatId);
  });

  it("stripSmartSectionsForStorage conserve photo_id et observation_id", async () => {
    const { stripSmartSectionsForStorage, createSmartPhotoId } = await import(
      "@/lib/smartInspectionPhotos"
    );
    const constatId = createObservationId();
    const photoId = createSmartPhotoId();
    const stripped = stripSmartSectionsForStorage([
      {
        name: "Toiture",
        constats: [
          {
            id: constatId,
            title: "Test",
            photos: [],
            observation: "x",
          },
        ],
        photos_pool: [
          {
            photo_id: photoId,
            observation_id: constatId,
            name: "x.jpg",
            url: "data:image/png;base64,abc",
            base64: "data:image/png;base64,abc",
          },
        ],
      },
    ]);
    const saved = stripped[0]?.constats[0]?.photos[0];
    assert.equal(saved?.photo_id, photoId);
    assert.equal(saved?.observation_id, constatId);
    assert.equal(saved?.url, undefined);
    assert.equal(saved?.base64, undefined);
  });
});
