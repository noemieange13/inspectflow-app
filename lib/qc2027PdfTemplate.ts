/**
 * Gabarit PDF orienté grille QC 2027 (ordre des sections figé, clauses en fin de document).
 * Utilisé lorsque `getComplianceExportMode(cover) === "QC_2027"` et `payload.sections` est non vide.
 */

import { PDF_AI_NARRATIVE_ANCHOR } from "@/lib/pdfAiNarrativeAnchor";
import {
  fixedLimitationClausesFr,
  formatInspectorLimitationsBody,
  LIMITATIONS_FIXED_CLAUSE_VERSION,
} from "@/lib/limitations";
import {
  effectiveComplianceNote,
  type InspectionCoverPayloadV1,
  type InspectorProfileV1,
} from "@/lib/inspectionCoverPayload";
import {
  aggregatePhotosForQcSystem,
  QC_MIN_PHOTOS_BY_SYSTEM,
  QC_SYSTEM_CODES,
  QC_SYSTEM_ZONE_GROUPS,
  type QcSystemCode,
} from "@/lib/qcSystemSections";
import { computeQcBuildingIndexScore } from "@/lib/qcBuildingIndexScore";
import {
  groupClausesBySection,
  type QcLegalClauseRow,
} from "@/lib/qcLegalClauses";
import { shouldFetchQuebecFrenchParallel } from "@/lib/qcLegalClauseSnapshot";
import {
  parseObservationPhotoUrlsFromPayload,
  renderObservationPhotosHtml,
} from "@/lib/reportObservationPhotos";

function esc(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

const QC_SYSTEM_TITLE_FR: Record<QcSystemCode, string> = {
  toiture: "Toiture",
  structure: "Structure",
  electricite: "Électricité",
  plomberie: "Plomberie",
  chauffage: "Chauffage",
  isolation: "Isolation",
  ventilation: "Ventilation",
};

const QC_SYSTEM_TITLE_EN: Record<QcSystemCode, string> = {
  toiture: "Roof",
  structure: "Structure",
  electricite: "Electrical",
  plomberie: "Plumbing",
  chauffage: "Heating",
  isolation: "Insulation",
  ventilation: "Ventilation",
};

/** Ordre logique des blocs dans le PDF (traçabilité / doc produit). */
export const PDF_QC_BLOCK_ORDER = [
  "cover",
  "executive_summary",
  "limitations",
  "qc_systems",
  "photo_coverage",
  "critical_observations",
  "general_recommendations",
  "legal_clauses",
  "signature",
  "compliance_audit",
] as const;

export const REPORT_QC2027_SUPPLEMENT_CSS =
  ".qc-break{page-break-before:always}" +
  ".qc-cover{border:1px solid #cbd5e1;border-radius:8px;padding:1.25em 1.5em;background:#fff;margin-bottom:0}" +
  ".qc-muted{color:#64748b;font-size:13px}" +
  ".qc-section-sys{border:1px solid #e2e8f0;border-radius:8px;padding:0.9em 1em;margin:0.75em 0;background:#fafafa}" +
  ".qc-finding{margin:0.6em 0;padding-left:0.5em;border-left:3px solid #94a3b8}" +
  ".qc-finding-sev-high{border-left-color:#b91c1c;background:#fff1f2}" +
  ".qc-finding-sev-med{border-left-color:#ea580c;background:#fff7ed}" +
  ".qc-finding-sev-low{border-left-color:#16a34a;background:#f0fdf4}" +
  ".qc-exec-grid{display:flex;flex-direction:column;gap:12px;margin:1em 0}" +
  ".qc-card{border:1px solid #e2e8f0;border-radius:8px;padding:14px 16px;background:#fff}" +
  ".qc-card.qc-sev-high{border-color:#fecaca;background:#fff1f2}" +
  ".qc-card.qc-sev-med{border-color:#fed7aa;background:#fffbeb}" +
  ".severity-high{color:#b00020;font-weight:700}" +
  ".severity-medium{color:#c2410c;font-weight:600}" +
  ".severity-low{color:#15803d}" +
  "table.qc-photo-grid{width:100%;border-collapse:collapse;font-size:13px;margin:0.5em 0}" +
  "table.qc-photo-grid th,table.qc-photo-grid td{border:1px solid #cbd5e1;padding:6px 8px;text-align:left}" +
  "table.qc-photo-grid th{background:#f1f5f9}" +
  ".qc-toc-wrap{border:1px solid #e2e8f0;border-radius:10px;padding:1em 1.1em;background:linear-gradient(180deg,#fafafa 0%,#fff 100%);margin-bottom:0}" +
  ".qc-score-num{font-size:28px;font-weight:800;color:#0f172a;letter-spacing:-0.02em}" +
  ".qc-badge{display:inline-block;padding:6px 14px;border-radius:999px;font-size:13px;font-weight:600}" +
  ".qc-badge-ok{background:#ecfdf3;color:#166534;border:1px solid #bbf7d0}" +
  ".qc-badge-warn{background:#fffbeb;color:#9a3412;border:1px solid #fde68a}" +
  ".qc-badge-bad{background:#fef2f2;color:#991b1b;border:1px solid #fecaca}" +
  ".qc-audit-wrap{border:1px solid #cbd5e1;border-radius:8px;padding:0.9em 1.05em;margin:1.25em 0 0;background:#f8fafc;font-size:12px;line-height:1.45;color:#334155}" +
  ".qc-audit-pass{color:#166534;font-weight:700}" +
  ".qc-audit-warn{color:#9a3412;font-weight:700}" +
  ".qc-audit-snap{margin-top:0.65em;padding-top:0.55em;border-top:1px dashed #cbd5e1;font-size:11px;color:#475569}";

type ReportLanguage = "fr" | "en";

type ParsedEntry = { zone: string; severity: string };

type SectionRow = {
  id?: unknown;
  title?: unknown;
  observation?: unknown;
  analysis?: unknown;
  recommendation?: unknown;
  severity?: unknown;
};

function parseEntriesFromPayload(payload: Record<string, unknown>): ParsedEntry[] {
  const raw = payload.entries;
  if (!Array.isArray(raw)) return [];
  const out: ParsedEntry[] = [];
  for (const row of raw) {
    if (!row || typeof row !== "object") continue;
    const o = row as Record<string, unknown>;
    const zone = typeof o.zone === "string" ? o.zone : "";
    const severity = typeof o.severity === "string" ? o.severity : "low";
    if (zone) out.push({ zone, severity });
  }
  return out;
}

function parsePhotosByZone(payload: Record<string, unknown>): Partial<Record<string, number>> {
  const pcv = payload.photos_coverage_v1;
  if (!pcv || typeof pcv !== "object") return {};
  const rec = pcv as Record<string, unknown>;
  const bz = rec.by_zone;
  if (!bz || typeof bz !== "object" || Array.isArray(bz)) return {};
  const out: Partial<Record<string, number>> = {};
  for (const [k, v] of Object.entries(bz as Record<string, unknown>)) {
    if (typeof v === "number" && Number.isFinite(v) && v >= 0) out[k] = v;
  }
  return out;
}

function labels(lang: ReportLanguage) {
  return lang === "en"
    ? {
      docTitle: "Residential inspection report",
      brandSubtitle: "InspectFlow — QC-aligned template",
      coverAddr: "Address",
      coverClient: "Client",
      coverInspector: "Inspector",
      coverLicense: "Licence / certification no.",
      coverDate: "Date / time",
      coverWeather: "Weather conditions",
      execTitle: "Executive summary",
      execConstats: "Main findings overview",
      major: "Major concerns (high severity)",
      minor: "Other findings (low / medium)",
      riskGlobal: "Overall risk (payload)",
      limitationsTitle: "Inspection limitations",
      declared: "Declared by inspector",
      fixedClauses: "Standard clauses (not editable — ref.",
      systemsTitle: "Mandatory system sections (QC)",
      description: "Description / observations",
      state: "Severity",
      anomalies: "Finding",
      reco: "Recommendation",
      noneDoc: "No structured finding mapped to this system in the current entries.",
      photoTitle: "Photo coverage by zone (field evidence)",
      zoneCol: "Zone / system",
      countCol: "Photos",
      minCol: "QC min. (when coverage declared)",
      critTitle: "Important observations (high severity)",
      genRecoTitle: "General recommendations",
      legalTitle: "Legal notices & clauses",
      compliancePack: "Compliance profile",
      signTitle: "Inspector",
      signName: "Name",
      signLic: "Licence",
      signCo: "Company",
      photoNote:
        "Digital photos are stored in the InspectFlow file. This table reflects zone counts declared at export.",
    }
    : {
      docTitle: "Rapport d'inspection résidentielle",
      brandSubtitle: "InspectFlow — gabarit aligné grille QC",
      coverAddr: "Adresse",
      coverClient: "Client",
      coverInspector: "Inspecteur",
      coverLicense: "Numéro de licence / certification",
      coverDate: "Date / heure",
      coverWeather: "Conditions météo",
      execTitle: "Sommaire exécutif",
      execConstats: "Résumé des constats principaux",
      major: "Points à gravité élevée",
      minor: "Autres constats (faible / moyenne gravité)",
      riskGlobal: "Niveau de risque global (données rapport)",
      limitationsTitle: "Limitations de l'inspection",
      declared: "Limitations déclarées par l'inspecteur",
      fixedClauses: "Clauses types (non modifiables — réf.",
      systemsTitle: "Sections systèmes obligatoires (QC — ordre fixe)",
      description: "Description / observations",
      state: "Gravité",
      anomalies: "Constat",
      reco: "Recommandation",
      noneDoc:
        "Aucun constat structuré n'est rattaché à ce système dans les entrées courantes.",
      photoTitle: "Couverture photographique par zone (preuve terrain)",
      zoneCol: "Zone / système",
      countCol: "Photos",
      minCol: "Min. QC (si répartition déclarée)",
      critTitle: "Observations importantes (gravité élevée)",
      genRecoTitle: "Recommandations générales",
      legalTitle: "Clauses légales et avis",
      compliancePack: "Profil de conformité",
      signTitle: "Signature / identité inspecteur",
      signName: "Nom",
      signLic: "Numéro de licence",
      signCo: "Entreprise",
      photoNote:
        "Les clichés numériques sont conservés dans le dossier InspectFlow. Le tableau reflète les comptages par zone déclarés à l'export.",
    };
}

function tocAndBuildingIndexBlock(
  payload: Record<string, unknown>,
  entries: ParsedEntry[],
  lang: ReportLanguage,
): string {
  const score = computeQcBuildingIndexScore(payload, entries);

  let badgeClass = "qc-badge-ok";
  let badgeText =
    lang === "en" ? "Satisfactory overall" : "État satisfaisant";
  if (score < 55) {
    badgeClass = "qc-badge-bad";
    badgeText = lang === "en" ? "Attention required" : "Attention requise";
  } else if (score < 75) {
    badgeClass = "qc-badge-warn";
    badgeText =
      lang === "en" ? "Monitoring recommended" : "Surveillance recommandée";
  }

  const tocTitle = lang === "en" ? "Contents" : "Table des matières";
  const items =
    lang === "en"
      ? [
          "Cover",
          "Executive summary",
          "Limitations",
          "QC system sections",
          "Photo coverage",
          "High-severity observations",
          "General recommendations",
          "Legal clauses",
          "Inspector",
        ]
      : [
          "Couverture",
          "Sommaire exécutif",
          "Limitations",
          "Sections systèmes (QC)",
          "Couverture photographique",
          "Observations critiques",
          "Recommandations générales",
          "Clauses légales",
          "Inspecteur",
        ];

  const scoreTitle =
    lang === "en" ? "Building summary index" : "Indice global du bâtiment";

  const bsv1 = payload.building_summary_v1;
  let marketBlock = "";
  if (bsv1 && typeof bsv1 === "object") {
    const s = bsv1 as Record<string, unknown>;
    const ms = typeof s.score === "number" ? s.score : null;
    const lf =
      (lang === "en"
        ? typeof s.label_en === "string"
          ? s.label_en
          : ""
        : typeof s.label_fr === "string"
          ? s.label_fr
          : "") || (typeof s.label_fr === "string" ? s.label_fr : "");
    const cost =
      typeof s.estimated_cost_cad === "number" ? s.estimated_cost_cad : 0;
    const hr =
      s.review_recommended === true ||
      s.high_risk === true ||
      s.score_below_60 === true ||
      s.intrinsic_high_risk === true;
    if (ms != null) {
      const costLine =
        cost > 0
          ? `<p style="margin:0.35em 0 0;font-size:12px" class="qc-muted">${esc(
              lang === "en"
                ? "Indicative repair budget (severity heuristic)"
                : "Budget travaux indicatif (heuristique gravité)",
            )}: ${esc(String(Math.round(cost / 100) * 100))} $ CAD</p>`
          : "";
      const riskLine = hr
        ? `<p class="bad" style="margin:0.35em 0 0;font-size:12px">${esc(
            lang === "en"
              ? "Elevated risk flagged — confirm with qualified professionals."
              : "Risque élevé signalé — valider avec des professionnels compétents.",
          )}</p>`
        : "";
      marketBlock = `
  <div class="qc-score-row" style="margin-top:1em;padding-top:1em;border-top:1px solid #e2e8f0">
    <div>
      <h3 style="margin:0 0 0.35em;font-size:15px">${esc(
        lang === "en" ? "Market-style score" : "Score décisionnel (marché)",
      )}</h3>
      <div class="qc-score-num">${ms} / 100</div>
      ${lf.trim() ? `<p style="margin:0.35em 0 0;font-size:14px">${esc(lf.trim())}</p>` : ""}
    </div>
  </div>
  ${costLine}
  ${riskLine}`;
    }
  }

  return `
<section class="qc-break qc-toc-wrap">
  <h2 style="margin-top:0">${esc(tocTitle)}</h2>
  <ol style="margin:0.5em 0;padding-left:1.25em;line-height:1.6;font-size:13px">
    ${items.map((it) => `<li>${esc(it)}</li>`).join("")}
  </ol>
  <div class="qc-score-row" style="margin-top:1.25em;display:flex;align-items:center;gap:16px;flex-wrap:wrap">
    <div>
      <h3 style="margin:0 0 0.35em;font-size:15px">${esc(scoreTitle)}</h3>
      <div class="qc-score-num">${score} / 100</div>
    </div>
    <div class="qc-badge ${badgeClass}">${esc(badgeText)}</div>
  </div>
  <p class="qc-muted" style="margin:0.75em 0 0;font-size:12px">${esc(
    lang === "en"
      ? "Indicative index from severities and declared risk — not a building code compliance score."
      : "Indice indicatif dérivé des gravités et du risque déclaré — non substitut à une conformité réglementaire.",
  )}</p>
  ${marketBlock}
</section>`.trim();
}

function coverLogoHtml(profile: InspectorProfileV1 | null): string {
  if (
    profile?.logo_data_url &&
    profile.logo_data_url.startsWith("data:image/") &&
    profile.logo_data_url.length < 900_000
  ) {
    return `<div style="margin-top:1em"><img src=${JSON.stringify(profile.logo_data_url)} alt="" style="max-height:84px;object-fit:contain" /></div>`;
  }
  return "";
}

function buildCoverPage(
  cover: InspectionCoverPayloadV1,
  profile: InspectorProfileV1 | null,
  lang: ReportLanguage,
): string {
  const L = labels(lang);
  const p = cover.propriete;
  const row = (k: string, v: string) =>
    v.trim()
      ? `<p style="margin:0.4em 0"><strong>${esc(k)}</strong> ${esc(v.trim())}</p>`
      : "";
  return `
<section class="qc-cover">
  <p class="qc-muted" style="margin:0 0 0.5em">${esc(L.brandSubtitle)}</p>
  <h1 style="margin:0 0 0.5em;font-size:24px">${esc(L.docTitle)}</h1>
  ${row(L.coverAddr, p.adresse)}
  ${row(L.coverClient, p.client_nom)}
  ${row(L.coverInspector, cover.inspecteur_nom)}
  ${row(L.coverLicense, cover.inspecteur_numero_certification)}
  ${row(L.coverDate, cover.date_heure_affichage)}
  ${row(L.coverWeather, cover.conditions_meteo)}
  ${coverLogoHtml(profile)}
</section>`.trim();
}

function findingSeverityClass(sev: string): string {
  const s = sev.toLowerCase();
  if (/élev|high|haut|majeur|crit|important/i.test(s)) return "qc-finding-sev-high";
  if (/moyen|medium|modér/i.test(s)) return "qc-finding-sev-med";
  return "qc-finding-sev-low";
}

function executiveBlock(
  payload: Record<string, unknown>,
  entries: ParsedEntry[],
  sections: SectionRow[],
  lang: ReportLanguage,
): string {
  const L = labels(lang);
  const majors = entries.filter((e) => e.severity === "high").length;
  const minors = entries.filter((e) => e.severity !== "high").length;

  const majorLines: string[] = [];
  const mediumLines: string[] = [];
  entries.forEach((e, i) => {
    const sec = sections[i];
    const title = sec?.title != null ? String(sec.title).trim() : "";
    const obs =
      typeof sec?.observation === "string" ? sec.observation.trim() : "";
    const line = title && obs ? `${title} — ${obs}` : title || obs;
    if (!line) return;
    if (e.severity === "high") majorLines.push(line);
    else mediumLines.push(line);
  });

  const majorList = majorLines.length > 0
    ? `<ul style="margin:0.35em 0;padding-left:1.25em">${majorLines.map((l) => `<li>${esc(l)}</li>`).join("")}</ul>`
    : `<p class="qc-muted">—</p>`;
  const mediumList = mediumLines.length > 0
    ? `<ul style="margin:0.35em 0;padding-left:1.25em">${mediumLines.map((l) => `<li>${esc(l)}</li>`).join("")}</ul>`
    : `<p class="qc-muted">—</p>`;

  const execCards = `
  <div class="qc-exec-grid">
    <div class="qc-card qc-sev-high">
      <p class="severity-high" style="margin:0 0 0.5em">${lang === "en" ? "Major issues" : "Problèmes majeurs"}</p>
      ${majorList}
    </div>
    <div class="qc-card qc-sev-med">
      <p class="severity-medium" style="margin:0 0 0.5em">${lang === "en" ? "Items to monitor" : "Points à surveiller"}</p>
      ${mediumList}
    </div>
  </div>`;

  const bullets = `<ul style="margin:0.5em 0;padding-left:1.25em">
    <li><strong>${esc(L.major)}</strong> — ${majors}</li>
    <li><strong>${esc(L.minor)}</strong> — ${minors}</li>
  </ul>`;

  const risk =
    typeof payload.risk_level === "string"
      ? `<p class="qc-muted" style="margin:0.35em 0">${esc(L.riskGlobal)} : <strong>${esc(
          String(payload.risk_level),
        )}</strong></p>`
      : "";

  const summary =
    typeof payload.summary === "string" ? payload.summary.trim() : "";
  const summaryP = summary
    ? `<p style="white-space:pre-wrap;line-height:1.45">${esc(summary)}</p>`
    : "";

  const client =
    typeof payload.client_section === "string" ? payload.client_section.trim() : "";
  const clientBlock = client
    ? `<div style="margin-top:1em;padding:0.85em;border:1px solid #e2e8f0;border-radius:8px;background:#fff">
        <h4 style="margin:0 0 0.35em;font-size:14px">${esc(
          lang === "en" ? "Client-facing summary" : "Langage accessible (client)",
        )}</h4>
        ${client.split(/\n\n+/).map((p) => `<p style="white-space:pre-wrap;margin:0.35em 0">${esc(p.trim())}</p>`).join("")}
      </div>`
    : "";

  return `
<section>
  <h2 style="margin-top:0">${esc(L.execTitle)}</h2>
  <h3 style="font-size:16px;margin:0.5em 0">${esc(L.execConstats)}</h3>
  ${execCards}
  <h3 style="font-size:15px;margin:1em 0 0.35em">${esc(
    lang === "en" ? "Counts" : "Synthèse quantitative",
  )}</h3>
  ${bullets}
  ${risk}
  ${summaryP}
  ${PDF_AI_NARRATIVE_ANCHOR}
  ${clientBlock}
</section>`.trim();
}

function limitationsBlock(cover: InspectionCoverPayloadV1, lang: ReportLanguage): string {
  const L = labels(lang);
  const body = formatInspectorLimitationsBody(cover).trim();
  const fixed = fixedLimitationClausesFr();
  return `
<section class="qc-break">
  <h2>${esc(L.limitationsTitle)}</h2>
  <h3 style="font-size:15px">${esc(L.declared)}</h3>
  ${
    body
      ? `<p style="white-space:pre-wrap;line-height:1.45">${esc(body)}</p>`
      : `<p class="qc-muted">—</p>`
  }
  <h3 style="font-size:15px;margin-top:1em">${esc(L.fixedClauses)} ${esc(LIMITATIONS_FIXED_CLAUSE_VERSION)})</h3>
  <ul style="margin:0.35em 0;padding-left:1.25em;font-size:13px;line-height:1.45">
    ${fixed.map((line) => `<li>${esc(line)}</li>`).join("")}
  </ul>
</section>`.trim();
}

function systemsBlock(
  payload: Record<string, unknown>,
  sections: SectionRow[],
  entries: ParsedEntry[],
  lang: ReportLanguage,
): string {
  const L = labels(lang);
  const titles = lang === "en" ? QC_SYSTEM_TITLE_EN : QC_SYSTEM_TITLE_FR;
  const observationPhotoUrls = parseObservationPhotoUrlsFromPayload(payload);

  const blocks: string[] = [];
  for (const code of QC_SYSTEM_CODES) {
    const zones = QC_SYSTEM_ZONE_GROUPS[code];
    const indices: number[] = [];
    entries.forEach((e, i) => {
      if (zones.some((z) => z === e.zone)) indices.push(i);
    });

    let inner = "";
    if (indices.length === 0) {
      inner = `<p class="qc-muted">${esc(L.noneDoc)}</p>`;
    } else {
      inner = indices
        .map((idx) => {
          const sec = sections[idx];
          if (!sec) return "";
          const title = sec.title != null ? String(sec.title) : "";
          const obs =
            typeof sec.observation === "string" ? sec.observation.trim() : "";
          const ana = typeof sec.analysis === "string" ? sec.analysis.trim() : "";
          const rec =
            typeof sec.recommendation === "string" ? sec.recommendation.trim() : "";
          const sev =
            typeof sec.severity === "string" ? sec.severity.trim() : "";
          const sevClass = findingSeverityClass(sev || "low");
          const observationId =
            typeof sec.id === "string" && sec.id.trim().length > 0 ? sec.id.trim() : "";
          const photosHtml = observationId
            ? renderObservationPhotosHtml(observationPhotoUrls[observationId] ?? [])
            : "";
          return `
<div class="qc-finding ${sevClass}">
  <h4 style="margin:0 0 0.35em;font-size:14px">${esc(title)}</h4>
  ${sev ? `<p style="margin:0.25em 0"><em>${esc(L.state)} : ${esc(sev)}</em></p>` : ""}
  ${obs ? `<p style="margin:0.35em 0"><strong>${esc(L.anomalies)}</strong> ${esc(obs)}</p>` : ""}
  ${ana ? `<p style="margin:0.35em 0">${esc(ana)}</p>` : ""}
  ${rec ? `<p style="margin:0.35em 0"><strong>${esc(L.reco)}</strong> ${esc(rec)}</p>` : ""}
  ${photosHtml}
</div>`;
        })
        .join("");
    }

    blocks.push(`
<div class="qc-section-sys">
  <h3 style="margin:0 0 0.5em;font-size:16px">${esc(titles[code])}</h3>
  ${inner}
</div>`);
  }

  return `
<section class="qc-break">
  <h2>${esc(L.systemsTitle)}</h2>
  ${blocks.join("")}
</section>`.trim();
}

function photoCoverageBlock(
  payload: Record<string, unknown>,
  lang: ReportLanguage,
): string {
  const L = labels(lang);
  const byZone = parsePhotosByZone(payload);
  const keys = Object.keys(byZone);
  if (keys.length === 0) {
    return `
<section class="qc-break">
  <h2>${esc(L.photoTitle)}</h2>
  <p class="qc-muted">${esc(
    lang === "en"
      ? "No per-zone photo counts were declared on this export."
      : "Aucun comptage par zone n'a été déclaré sur cet export.",
  )}</p>
</section>`.trim();
  }

  const titles = lang === "en" ? QC_SYSTEM_TITLE_EN : QC_SYSTEM_TITLE_FR;
  const rows: string[] = [];
  for (const code of QC_SYSTEM_CODES) {
    const n = aggregatePhotosForQcSystem(byZone, code);
    const min = QC_MIN_PHOTOS_BY_SYSTEM[code];
    rows.push(
      `<tr><td>${esc(titles[code])}</td><td>${n}</td><td>${min}</td></tr>`,
    );
  }

  return `
<section class="qc-break">
  <h2>${esc(L.photoTitle)}</h2>
  <p class="qc-muted" style="margin-bottom:0.75em">${esc(L.photoNote)}</p>
  <table class="qc-photo-grid">
    <thead><tr><th>${esc(L.zoneCol)}</th><th>${esc(L.countCol)}</th><th>${esc(L.minCol)}</th></tr></thead>
    <tbody>${rows.join("")}</tbody>
  </table>
</section>`.trim();
}

function criticalObservationsBlock(
  sections: SectionRow[],
  entries: ParsedEntry[],
  lang: ReportLanguage,
): string {
  const L = labels(lang);
  const parts: string[] = [];
  entries.forEach((e, i) => {
    if (e.severity !== "high") return;
    const sec = sections[i];
    if (!sec) return;
    const title = sec.title != null ? String(sec.title) : "";
    const obs =
      typeof sec.observation === "string" ? sec.observation.trim() : "";
    if (title || obs) {
      parts.push(`<li style="margin:0.35em 0"><strong>${esc(title)}</strong> — ${esc(obs)}</li>`);
    }
  });
  if (parts.length === 0) {
    return `
<section class="qc-break">
  <h2>${esc(L.critTitle)}</h2>
  <p class="qc-muted">—</p>
</section>`.trim();
  }
  return `
<section class="qc-break">
  <h2>${esc(L.critTitle)}</h2>
  <ul style="margin:0;padding-left:1.25em">${parts.join("")}</ul>
</section>`.trim();
}

function generalRecoBlock(payload: Record<string, unknown>, lang: ReportLanguage): string {
  const L = labels(lang);
  const note =
    typeof payload.inspector_note === "string" ? payload.inspector_note.trim() : "";
  const body = note || "";
  return `
<section class="qc-break">
  <h2>${esc(L.genRecoTitle)}</h2>
  ${
    body
      ? `<p style="white-space:pre-wrap;line-height:1.45">${esc(body)}</p>`
      : `<p class="qc-muted">${esc(
          lang === "en"
            ? "No general recommendation note (inspector_note) on file."
            : "Aucune note générale (inspector_note) enregistrée.",
        )}</p>`
  }
</section>`.trim();
}

function renderReferenceClausesHtml(
  rows: QcLegalClauseRow[] | undefined,
  lang: ReportLanguage,
): string {
  if (!rows || rows.length === 0) return "";
  const grouped = groupClausesBySection(rows);
  const title =
    lang === "en"
      ? "Reference clauses (registry — CA + province)"
      : "Clauses de référence (registre — CA + province)";
  const parts: string[] = [];
  parts.push(`<h3 style="font-size:15px;margin-top:1em">${esc(title)}</h3>`);
  for (const [section, clauses] of Object.entries(grouped)) {
    parts.push(
      `<h4 style="font-size:14px;margin:0.75em 0 0.35em">${esc(section)}</h4>`,
    );
    parts.push(
      `<ul style="margin:0.25em 0;padding-left:1.25em;font-size:13px;line-height:1.45">`,
    );
    for (const c of clauses) {
      parts.push(`<li>${esc(c)}</li>`);
    }
    parts.push(`</ul>`);
  }
  return parts.join("");
}

/** Libellé français officiel en parallèle d’un rapport EN (Québec). */
function renderQuebecFrenchParallelClausesHtml(
  rows: QcLegalClauseRow[] | undefined,
): string {
  if (!rows || rows.length === 0) return "";
  const grouped = groupClausesBySection(rows);
  const parts: string[] = [];
  parts.push(
    `<h3 style="font-size:15px;margin-top:1.25em">${esc(
      "Clauses de référence — texte français (Québec)",
    )}</h3>`,
  );
  parts.push(
    `<p class="qc-muted" style="font-size:12px;line-height:1.4;margin:0.35em 0 0.75em">${esc(
      "Le texte français est reproduit pour clarté juridique (Charte de la langue française). Il complète la version anglaise du rapport sans la remplacer.",
    )}</p>`,
  );
  parts.push(`<div lang="fr">`);
  for (const [section, clauses] of Object.entries(grouped)) {
    parts.push(
      `<h4 style="font-size:14px;margin:0.75em 0 0.35em">${esc(section)}</h4>`,
    );
    parts.push(
      `<ul style="margin:0.25em 0;padding-left:1.25em;font-size:13px;line-height:1.45">`,
    );
    for (const c of clauses) {
      parts.push(`<li>${esc(c)}</li>`);
    }
    parts.push(`</ul>`);
  }
  parts.push(`</div>`);
  return parts.join("");
}

function bilingualNoticeFragment(
  compliance: Record<string, unknown>,
  lang: ReportLanguage,
): string {
  const raw = compliance.bilingual_notice;
  if (!raw || typeof raw !== "object") return "";
  const rec = raw as Record<string, unknown>;
  const fr = Array.isArray(rec.fr)
    ? rec.fr.filter((x): x is string => typeof x === "string" && x.trim().length > 0)
    : [];
  const en = Array.isArray(rec.en)
    ? rec.en.filter((x): x is string => typeof x === "string" && x.trim().length > 0)
    : [];
  if (fr.length === 0 && en.length === 0) return "";
  const title =
    lang === "en"
      ? "Bilingual notice — Canadian building inspection framework"
      : "Avis bilingue — cadre d'inspection des bâtiments au Canada";
  const frBlock =
    fr.length > 0
      ? `<div lang="fr" style="margin-bottom:1em"><strong>Français</strong>${
        fr.map((p) => `<p>${esc(p)}</p>`).join("")
      }</div>`
      : "";
  const enBlock =
    en.length > 0
      ? `<div lang="en" style="margin-bottom:1em"><strong>English</strong>${
        en.map((p) => `<p>${esc(p)}</p>`).join("")
      }</div>`
      : "";
  return `<h3 style="font-size:15px;margin-top:1em">${esc(title)}</h3>${frBlock}${enBlock}`;
}

function legalClausesBlock(
  cover: InspectionCoverPayloadV1,
  payload: Record<string, unknown>,
  lang: ReportLanguage,
  legalRows: QcLegalClauseRow[] | undefined,
  legalRowsFrForQc: QcLegalClauseRow[] | undefined,
): string {
  const L = labels(lang);
  const compliance =
    payload.compliance && typeof payload.compliance === "object"
      ? (payload.compliance as Record<string, unknown>)
      : null;
  const legal =
    compliance && typeof compliance.legal_notice === "string"
      ? compliance.legal_notice.trim()
      : "";
  const pack = cover.compliance_profile_v1?.clauses_pack_version ?? "QC_2027_v1";
  const mode = cover.compliance_profile_v1?.mode ?? "QC_2027";
  const note = effectiveComplianceNote(cover).trim();
  const bilingual = compliance ? bilingualNoticeFragment(compliance, lang) : "";
  const registry = renderReferenceClausesHtml(legalRows, lang);
  const frParallel =
    lang === "en" &&
    cover.conformite_juridiction === "ca_qc" &&
    legalRowsFrForQc &&
    legalRowsFrForQc.length > 0
      ? renderQuebecFrenchParallelClausesHtml(legalRowsFrForQc)
      : "";

  return `
<section class="qc-break">
  <h2>${esc(L.legalTitle)}</h2>
  <p style="font-size:13px"><strong>${esc(L.compliancePack)}</strong> — ${esc(mode)} / ${esc(pack)}</p>
  ${
    note
      ? `<p style="white-space:pre-wrap;line-height:1.45;margin:0.75em 0">${esc(note)}</p>`
      : ""
  }
  ${legal ? `<p style="white-space:pre-wrap;line-height:1.45">${esc(legal)}</p>` : ""}
  ${bilingual}
  ${registry}
  ${frParallel}
</section>`.trim();
}

function complianceAuditLabels(lang: ReportLanguage) {
  return lang === "en"
    ? {
      sectionTitle: "Compliance record (audit)",
      passTitle: "Compliance: PASS",
      partialTitle: "Compliance: review required",
      bulletSystems: "QC 2027 mandatory system sections present",
      bulletClausesBilingual: "Clause registry includes EN + FR (Quebec English report)",
      bulletClausesMono: "Clause registry included for export language",
      bulletBilingualGap:
        "Bilingual clause trace incomplete (QC + English requires FR + EN in snapshot)",
      bulletSnapshotOk: "Clause snapshot recorded in report file",
      bulletSnapshotMissing: "No clause snapshot in report file metadata",
      snapTitle: "Compliance snapshot (embedded record)",
      packLabel: "Clause pack",
      genLabel: "Generated at (ISO 8601)",
      langLabel: "Languages in snapshot",
      shaLabel: "SHA-256 (canonical clause_snapshot JSON)",
      shaLegacy: "Integrity digest not recorded (legacy export)",
      disclaimer:
        "Technical compliance metadata — not a legal certificate. External counsel remains responsible for legal review.",
    }
    : {
      sectionTitle: "Enregistrement conformité (audit)",
      passTitle: "Conformité : CONFORME",
      partialTitle: "Conformité : révision requise",
      bulletSystems: "Sections systèmes obligatoires QC 2027 présentes",
      bulletClausesBilingual:
        "Registre des clauses EN + FR (rapport anglais, Québec)",
      bulletClausesMono: "Registre des clauses inclus pour la langue d’export",
      bulletBilingualGap:
        "Trace bilingue incomplète (QC + anglais : instantané FR+EN requis)",
      bulletSnapshotOk: "Instantané des clauses enregistré dans le fichier rapport",
      bulletSnapshotMissing:
        "Aucun instantané de clauses dans les métadonnées du rapport",
      snapTitle: "Instantané conformité (preuve embarquée)",
      packLabel: "Paquet de clauses",
      genLabel: "Horodatage (ISO 8601)",
      langLabel: "Langues dans l’instantané",
      shaLabel: "SHA-256 (JSON canonique clause_snapshot)",
      shaLegacy: "Empreinte d’intégrité absente (export antérieur)",
      disclaimer:
        "Métadonnées techniques de conformité — ne constitue pas une certification juridique.",
    };
}

function parseClauseSnapshotRowsFromCompliance(
  raw: unknown,
): Array<{ clause_code: string; language: ReportLanguage }> {
  if (!Array.isArray(raw)) return [];
  const out: Array<{ clause_code: string; language: ReportLanguage }> = [];
  for (const row of raw) {
    if (!row || typeof row !== "object") continue;
    const r = row as Record<string, unknown>;
    const code = typeof r.clause_code === "string" ? r.clause_code.trim() : "";
    const lg = r.language;
    if (!code) continue;
    if (lg === "en" || lg === "fr") out.push({ clause_code: code, language: lg });
  }
  return out;
}

/** Pied / encadré audit : lit `payload.compliance` (écrit par ensureReportPayloadHtml). */
function complianceAuditSectionHtml(
  cover: InspectionCoverPayloadV1,
  payload: Record<string, unknown>,
  lang: ReportLanguage,
): string {
  const rawComp = payload.compliance;
  if (!rawComp || typeof rawComp !== "object") return "";
  const c = rawComp as Record<string, unknown>;
  const pack =
    typeof c.clause_snapshot_pack === "string" && c.clause_snapshot_pack.trim()
      ? c.clause_snapshot_pack.trim()
      : "";
  const generatedAt =
    typeof c.clause_snapshot_generated_at === "string" &&
    c.clause_snapshot_generated_at.trim()
      ? c.clause_snapshot_generated_at.trim()
      : "";
  const sha =
    typeof c.clause_snapshot_sha256 === "string" && c.clause_snapshot_sha256.trim()
      ? c.clause_snapshot_sha256.trim()
      : "";
  const snapshot = parseClauseSnapshotRowsFromCompliance(c.clause_snapshot);

  if (!pack && !generatedAt && !sha && snapshot.length === 0) return "";

  const L = complianceAuditLabels(lang);
  const langs = new Set<ReportLanguage>();
  for (const row of snapshot) langs.add(row.language);
  const langsDisplay =
    langs.size === 0
      ? "—"
      : [...langs].sort((a, b) => a.localeCompare(b)).map((x) => x.toUpperCase()).join(" + ");

  const needBilingual = shouldFetchQuebecFrenchParallel(
    cover.conformite_juridiction,
    lang,
  );
  const hasEn = langs.has("en");
  const hasFr = langs.has("fr");
  const bilingualOk = !needBilingual || (hasEn && hasFr);
  const hasSnapshot = snapshot.length > 0;

  const pass = hasSnapshot && bilingualOk;
  const statusClass = pass ? "qc-audit-pass" : "qc-audit-warn";
  const statusTitle = pass ? L.passTitle : L.partialTitle;

  const bullets: string[] = [];
  bullets.push(`<li>${esc(L.bulletSystems)}</li>`);
  if (needBilingual) {
    bullets.push(
      `<li>${esc(bilingualOk ? L.bulletClausesBilingual : L.bulletBilingualGap)}</li>`,
    );
  } else {
    bullets.push(`<li>${esc(L.bulletClausesMono)}</li>`);
  }
  bullets.push(
    `<li>${esc(hasSnapshot ? L.bulletSnapshotOk : L.bulletSnapshotMissing)}</li>`,
  );

  const snapLines: string[] = [];
  if (pack) {
    snapLines.push(
      `<div><strong>${esc(L.packLabel)}</strong> — ${esc(pack)}</div>`,
    );
  }
  if (generatedAt) {
    snapLines.push(
      `<div><strong>${esc(L.genLabel)}</strong> — ${esc(generatedAt)}</div>`,
    );
  }
  snapLines.push(
    `<div><strong>${esc(L.langLabel)}</strong> — ${esc(langsDisplay)}</div>`,
  );
  if (sha) {
    snapLines.push(
      `<div style="margin-top:0.35em;word-break:break-all"><strong>${esc(L.shaLabel)}</strong> — ${esc(sha)}</div>`,
    );
  } else if (hasSnapshot) {
    snapLines.push(
      `<div class="qc-muted" style="margin-top:0.35em">${esc(L.shaLegacy)}</div>`,
    );
  }

  return `
<section class="qc-audit-wrap" aria-label="${esc(L.sectionTitle)}">
  <h3 style="font-size:13px;margin:0 0 0.45em;color:#0f172a">${esc(L.sectionTitle)}</h3>
  <p class="${statusClass}" style="margin:0 0 0.5em;font-size:13px">${esc(statusTitle)}</p>
  <ul style="margin:0;padding-left:1.2em">${bullets.join("")}</ul>
  <div class="qc-audit-snap">
    <div style="font-weight:600;margin-bottom:0.35em;color:#0f172a">${esc(L.snapTitle)}</div>
    ${snapLines.join("")}
  </div>
  <p class="qc-muted" style="margin:0.65em 0 0;font-size:10px;line-height:1.35">${esc(L.disclaimer)}</p>
</section>`.trim();
}

function signatureBlock(
  cover: InspectionCoverPayloadV1,
  profile: InspectorProfileV1 | null,
  lang: ReportLanguage,
): string {
  const L = labels(lang);
  const raw = profile?.signature_data_url?.trim();
  const sigImg =
    raw &&
    (raw.startsWith("data:image/") || raw.startsWith("http")) &&
    raw.length < 900_000
      ? `<div style="margin-top:0.75em"><img src=${JSON.stringify(raw)} alt="" style="max-width:220px;max-height:96px;object-fit:contain"/></div>`
      : "";
  return `
<section class="qc-break">
  <h2>${esc(L.signTitle)}</h2>
  <p><strong>${esc(L.signName)}</strong> ${esc(cover.inspecteur_nom.trim() || "—")}</p>
  <p><strong>${esc(L.signLic)}</strong> ${esc(cover.inspecteur_numero_certification.trim() || "—")}</p>
  <p><strong>${esc(L.signCo)}</strong> ${esc(cover.compagnie.trim() || "—")}</p>
  ${sigImg}
</section>`.trim();
}

export function buildQc2027HtmlFromPayload(
  payload: Record<string, unknown>,
  cover: InspectionCoverPayloadV1,
  profile: InspectorProfileV1 | null,
  sectionsRaw: unknown[],
  opts: {
    language: ReportLanguage;
    basePrintCss: string;
    defaultTitle: string;
    /** Clauses (langue du rapport), injectées dans le PDF */
    legalClauseRows?: QcLegalClauseRow[];
    /** QC + rapport EN : texte français des mêmes clauses (référence légale). */
    legalClauseRowsFrForQc?: QcLegalClauseRow[];
  },
): string | null {
  const sections = sectionsRaw.filter((x) => x && typeof x === "object") as SectionRow[];
  if (sections.length === 0) return null;

  const entries = parseEntriesFromPayload(payload);
  const lang = opts.language;

  const title =
    typeof payload.title === "string" && payload.title.trim()
      ? payload.title.trim()
      : opts.defaultTitle;

  const parts: string[] = [];
  parts.push(
    `<!DOCTYPE html><html lang="${lang}"><head><meta charset="utf-8"><title>${esc(title)}</title>`,
  );
  parts.push(
    `<style>${opts.basePrintCss}${REPORT_QC2027_SUPPLEMENT_CSS}</style></head><body>`,
  );
  parts.push(
    `<div class="header" style="margin-bottom:1em"><h1 style="font-size:22px;margin:0">Inspect<span class="brand">Flow</span></h1><p class="subtitle qc-muted" style="margin:0.25em 0 0">${esc(
      title,
    )}</p></div>`,
  );

  parts.push(buildCoverPage(cover, profile, lang));
  parts.push(tocAndBuildingIndexBlock(payload, entries, lang));
  parts.push(executiveBlock(payload, entries, sections, lang));
  parts.push(limitationsBlock(cover, lang));
  parts.push(systemsBlock(payload, sections, entries, lang));
  parts.push(photoCoverageBlock(payload, lang));
  parts.push(criticalObservationsBlock(sections, entries, lang));
  parts.push(generalRecoBlock(payload, lang));
  parts.push(
    legalClausesBlock(
      cover,
      payload,
      lang,
      opts.legalClauseRows,
      opts.legalClauseRowsFrForQc,
    ),
  );
  parts.push(signatureBlock(cover, profile, lang));
  parts.push(complianceAuditSectionHtml(cover, payload, lang));

  parts.push(
    `<div class="footer" style="margin-top:2em;font-size:12px;color:#64748b">Inspect<strong>Flow</strong> — ${
      lang === "en"
        ? "Automated inspection report. This document does not constitute legal certification."
        : "Rapport d'inspection automatisé. Ce document ne constitue pas une certification légale."
    }</div>`,
  );
  parts.push("</body></html>");
  return parts.join("");
}
