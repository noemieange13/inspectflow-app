import { escapeHtml } from "@/lib/buildInspectionReportHtml";
import type { SellerDisclosureV1 } from "@/lib/document-intelligence";
import { readSellerDisclosureV1FromPayload } from "@/lib/report_template_engine/sellerDisclosureSection";
import { readInspectionWeatherFromPayload } from "@/lib/weather/inspectionWeather";
import { EN_LEGAL_CLAUSE_DEFINITIONS } from "@/lib/report_legal_sections_engine/enClauses";
import {
  OWNER_DISCLOSURE_DEFAULT_INTRO_FR,
  QC_LEGAL_CLAUSE_DEFINITIONS,
} from "@/lib/report_legal_sections_engine/qcClauses";
import type {
  InspectionConditionsV1,
  InspectionLimitationsV1,
  LegalClauseDefinition,
  LegalClauseSnapshot,
  LegalFrontMatterContext,
  LegalSectionCode,
  LegalSectionsV1,
  OwnerDisclosureV1,
} from "@/lib/report_legal_sections_engine/types";
import {
  INSPECTION_CONDITIONS_V1_KEY,
  INSPECTION_LIMITATIONS_V1_KEY,
  LEGAL_SECTIONS_V1_KEY,
  OWNER_DISCLOSURE_V1_KEY,
} from "@/lib/report_legal_sections_engine/types";
import { toWriterLanguage, type ReportLocale } from "@/lib/reportLocale";

const FRONT_MATTER_ORDER: LegalSectionCode[] = [
  "owner_disclosure",
  "inspection_scope",
  "accessibility_limitations",
  "orientation_notice",
  "carbon_monoxide_note",
  "specialist_nb",
  "component_life_expectancy",
  "photos_notice",
  "report_usage",
];

const LIMITATION_LABELS_FR: Record<keyof Omit<InspectionLimitationsV1, "other" | "inspector_confirmed">, string> = {
  attic_not_accessible: "Grenier / combles non accessibles",
  crawlspace_not_accessible: "Vide sanitaire / sous-sol non accessible",
  roof_snow_covered: "Toiture couverte de neige",
  electrical_panel_blocked: "Panneau électrique inaccessible",
  garage_limited_access: "Accès limité au garage",
};

const LIMITATION_LABELS_EN: Record<keyof Omit<InspectionLimitationsV1, "other" | "inspector_confirmed">, string> = {
  attic_not_accessible: "Attic / loft not accessible",
  crawlspace_not_accessible: "Crawl space / basement not accessible",
  roof_snow_covered: "Roof covered with snow",
  electrical_panel_blocked: "Electrical panel blocked",
  garage_limited_access: "Limited garage access",
};

function esc(s: string): string {
  return escapeHtml(s);
}

function clauseDefinitionsForLocale(locale: ReportLocale): LegalClauseDefinition[] {
  return toWriterLanguage(locale) === "en"
    ? EN_LEGAL_CLAUSE_DEFINITIONS
    : QC_LEGAL_CLAUSE_DEFINITIONS;
}

export function buildLegalSectionsSnapshotV1(
  locale: ReportLocale,
  capturedAt = new Date().toISOString(),
): LegalSectionsV1 {
  return {
    version: "8U",
    locale,
    captured_at: capturedAt,
    clauses: clauseDefinitionsForLocale(locale).map((def) => ({
      code: def.code,
      title: def.title,
      body: def.body,
      locked: true as const,
    })),
  };
}

export function parseLegalSectionsV1(raw: unknown): LegalSectionsV1 | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const o = raw as Record<string, unknown>;
  if (o.version !== "8U" || !Array.isArray(o.clauses)) return null;
  const clauses = o.clauses
    .filter((c) => c && typeof c === "object")
    .map((c) => {
      const row = c as Record<string, unknown>;
      if (typeof row.code !== "string" || typeof row.title !== "string" || typeof row.body !== "string") {
        return null;
      }
      return {
        code: row.code as LegalSectionCode,
        title: row.title,
        body: row.body,
        locked: true as const,
      };
    })
    .filter(Boolean) as LegalClauseSnapshot[];
  if (clauses.length === 0) return null;
  return {
    version: "8U",
    locale: (typeof o.locale === "string" ? o.locale : "fr-CA") as ReportLocale,
    captured_at: typeof o.captured_at === "string" ? o.captured_at : new Date().toISOString(),
    clauses,
  };
}

export function readLegalSectionsFromPayload(
  payload: Record<string, unknown>,
): LegalSectionsV1 | null {
  const top = parseLegalSectionsV1(payload[LEGAL_SECTIONS_V1_KEY]);
  if (top) return top;

  const snapshot = payload.report_professional_snapshot_v1;
  if (snapshot && typeof snapshot === "object") {
    const nested = (snapshot as Record<string, unknown>).legal_sections_v1;
    return parseLegalSectionsV1(nested);
  }
  return null;
}

export function parseInspectionConditionsV1(raw: unknown): InspectionConditionsV1 | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const o = raw as Record<string, unknown>;
  return {
    date: typeof o.date === "string" ? o.date : undefined,
    temperature: typeof o.temperature === "number" ? o.temperature : undefined,
    weather: typeof o.weather === "string" ? o.weather : undefined,
    snow_present: typeof o.snow_present === "boolean" ? o.snow_present : undefined,
    limitations: typeof o.limitations === "string" ? o.limitations.trim() : undefined,
  };
}

export function buildInspectionConditionsFromPayload(
  payload: Record<string, unknown>,
): InspectionConditionsV1 | null {
  const explicit = parseInspectionConditionsV1(payload[INSPECTION_CONDITIONS_V1_KEY]);
  if (explicit) return explicit;

  const weather = readInspectionWeatherFromPayload(payload);
  if (!weather) return null;

  return {
    date: weather.recorded_at,
    temperature: weather.temperature_c,
    weather: weather.condition,
    snow_present: /neige|snow/i.test(weather.condition),
    limitations: weather.notes ?? undefined,
  };
}

export function parseInspectionLimitationsV1(raw: unknown): InspectionLimitationsV1 | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const o = raw as Record<string, unknown>;
  return {
    attic_not_accessible:
      typeof o.attic_not_accessible === "boolean" ? o.attic_not_accessible : undefined,
    crawlspace_not_accessible:
      typeof o.crawlspace_not_accessible === "boolean" ? o.crawlspace_not_accessible : undefined,
    roof_snow_covered:
      typeof o.roof_snow_covered === "boolean" ? o.roof_snow_covered : undefined,
    electrical_panel_blocked:
      typeof o.electrical_panel_blocked === "boolean" ? o.electrical_panel_blocked : undefined,
    garage_limited_access:
      typeof o.garage_limited_access === "boolean" ? o.garage_limited_access : undefined,
    other: typeof o.other === "string" ? o.other.trim() : undefined,
    inspector_confirmed:
      typeof o.inspector_confirmed === "boolean" ? o.inspector_confirmed : undefined,
  };
}

export function readInspectionLimitationsFromPayload(
  payload: Record<string, unknown>,
): InspectionLimitationsV1 | null {
  return parseInspectionLimitationsV1(payload[INSPECTION_LIMITATIONS_V1_KEY]);
}

export function parseOwnerDisclosureV1(raw: unknown): OwnerDisclosureV1 | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const o = raw as Record<string, unknown>;
  if (typeof o.provided !== "boolean") return null;
  return {
    provided: o.provided,
    dv_number: typeof o.dv_number === "string" ? o.dv_number.trim() : undefined,
    received_date: typeof o.received_date === "string" ? o.received_date.trim() : undefined,
    extracted_comments:
      typeof o.extracted_comments === "string" ? o.extracted_comments.trim() : undefined,
  };
}

export function buildOwnerDisclosureFromPayload(
  payload: Record<string, unknown>,
): OwnerDisclosureV1 | null {
  const explicit = parseOwnerDisclosureV1(payload[OWNER_DISCLOSURE_V1_KEY]);
  if (explicit) return explicit;

  const seller = readSellerDisclosureV1FromPayload(payload);
  if (!seller?.received_before_inspection) return null;

  return {
    provided: true,
    dv_number: seller.dv_number,
    extracted_comments: buildSellerDisclosureCommentsFromDv(seller),
  };
}

function buildSellerDisclosureCommentsFromDv(dv: SellerDisclosureV1): string {
  const parts: string[] = [];
  if (typeof dv.seller_acquisition_year === "number") {
    parts.push(`Le vendeur déclare avoir acquis l'immeuble en ${dv.seller_acquisition_year}.`);
  }
  if (dv.dv_number?.trim()) {
    parts.push(`Déclaration du vendeur : DV ${dv.dv_number.trim()}.`);
  } else if (dv.received_before_inspection) {
    parts.push("Une déclaration du vendeur nous a été remise avant l'inspection.");
  }
  return parts.join(" ");
}

function resolveClauseBody(
  snapshot: LegalSectionsV1 | null,
  locale: ReportLocale,
  code: LegalSectionCode,
): LegalClauseDefinition {
  const lang = toWriterLanguage(locale);
  const snapshotLang = snapshot ? toWriterLanguage(snapshot.locale) : null;
  const fromSnapshot =
    snapshot && snapshotLang === lang
      ? snapshot.clauses.find((c) => c.code === code)
      : null;
  if (fromSnapshot) {
    return { code, title: fromSnapshot.title, body: fromSnapshot.body };
  }
  const defs = clauseDefinitionsForLocale(locale);
  const live = defs.find((c) => c.code === code);
  if (!live) throw new Error(`Missing legal clause ${code}`);
  return live;
}

function buildLimitationSupplement(
  limitations: InspectionLimitationsV1 | null,
  conditions: InspectionConditionsV1 | null,
  locale: ReportLocale,
): string {
  const lang = toWriterLanguage(locale);
  const labels = lang === "en" ? LIMITATION_LABELS_EN : LIMITATION_LABELS_FR;
  const bullets: string[] = [];

  if (limitations?.inspector_confirmed) {
    for (const key of Object.keys(labels) as Array<keyof typeof labels>) {
      if (limitations[key]) bullets.push(labels[key]);
    }
    if (limitations.other?.trim()) bullets.push(limitations.other.trim());
  }

  if (conditions?.limitations?.trim()) bullets.push(conditions.limitations.trim());
  if (conditions?.snow_present && !bullets.some((b) => /neige|snow/i.test(b))) {
    bullets.push(lang === "en" ? "Snow present during inspection" : "Neige présente lors de l'inspection");
  }

  if (bullets.length === 0) return "";
  const header =
    lang === "en" ? "Confirmed inspection limitations:" : "Limitations confirmées lors de l'inspection :";
  return `\n\n${header}\n${bullets.map((b) => `• ${b}`).join("\n")}`;
}

function buildOwnerDisclosureBody(
  clause: LegalClauseDefinition,
  owner: OwnerDisclosureV1 | null,
  locale: ReportLocale,
): string | null {
  if (!owner?.provided) return null;

  const lang = toWriterLanguage(locale);
  const intro =
    lang === "en"
      ? clause.body
      : OWNER_DISCLOSURE_DEFAULT_INTRO_FR;

  const parts = [intro];
  if (owner.dv_number?.trim()) {
    parts.push(
      lang === "en"
        ? `Seller disclosure: DV ${owner.dv_number.trim()}.`
        : `Déclaration du vendeur : DV ${owner.dv_number.trim()}.`,
    );
  }
  if (owner.extracted_comments?.trim()) {
    parts.push(owner.extracted_comments.trim());
  }
  if (owner.received_date?.trim()) {
    parts.push(
      lang === "en"
        ? `Received on ${owner.received_date.trim()}.`
        : `Reçue le ${owner.received_date.trim()}.`,
    );
  }
  return parts.join("\n\n");
}

function buildCarbonMonoxideBody(
  clause: LegalClauseDefinition,
  recommendation?: string | null,
): string {
  const custom = recommendation?.trim();
  if (!custom) return clause.body;

  const marker = clause.body.includes("Commentaires :")
    ? "Commentaires :"
    : clause.body.includes("Comments:")
      ? "Comments:"
      : null;
  if (!marker) return `${clause.body}\n\n${custom}`;
  const [head] = clause.body.split(marker);
  return `${head.trim()}\n\n${marker}\n\n${custom}`;
}

function renderSectionHtml(title: string, body: string): string {
  return (
    `<section class="pro-legal-clause pro-break">` +
    `<h2 style="margin:1.25em 0 0.5em;font-size:17px">${esc(title)}</h2>` +
    `<p style="white-space:pre-wrap;line-height:1.45;margin:0">${esc(body).replace(/\n\n/g, "</p><p style=\"white-space:pre-wrap;line-height:1.45;margin:0.75em 0 0\">")}</p>` +
    `</section>`
  );
}

export function renderExteriorOverviewPhotoHtml(
  facadePhotoUrl: string | null | undefined,
  locale: ReportLocale,
): string {
  const url = facadePhotoUrl?.trim();
  if (!url) return "";
  if (!url.startsWith("data:image/") && !/^https?:\/\//i.test(url)) return "";

  const title =
    toWriterLanguage(locale) === "en" ? "Exterior overview" : "Vue extérieure";
  return (
    `<section class="pro-exterior-overview pro-break">` +
    `<h2 style="margin:1.25em 0 0.5em;font-size:17px">${esc(title)}</h2>` +
    `<img src=${JSON.stringify(url)} alt="" class="pro-photo" style="max-height:320px"/>` +
    `</section>`
  );
}

export function buildLegalFrontMatterHtml(
  payload: Record<string, unknown>,
  locale: ReportLocale,
  context: LegalFrontMatterContext,
): string {
  const snapshot = readLegalSectionsFromPayload(payload);
  const parts: string[] = [];

  for (const code of FRONT_MATTER_ORDER) {
    const clause = resolveClauseBody(snapshot, locale, code);

    if (code === "owner_disclosure") {
      const body = buildOwnerDisclosureBody(clause, context.ownerDisclosure, locale);
      if (body) parts.push(renderSectionHtml(clause.title, body));
      continue;
    }

    if (code === "accessibility_limitations") {
      const supplement = buildLimitationSupplement(context.limitations, context.conditions, locale);
      parts.push(renderSectionHtml(clause.title, `${clause.body}${supplement}`));
      continue;
    }

    if (code === "carbon_monoxide_note") {
      parts.push(
        renderSectionHtml(
          clause.title,
          buildCarbonMonoxideBody(clause, context.carbonMonoxideRecommendation),
        ),
      );
      continue;
    }

    parts.push(renderSectionHtml(clause.title, clause.body));
  }

  parts.push(renderExteriorOverviewPhotoHtml(context.facadePhotoUrl, locale));
  return parts.join("");
}

export function buildLegalFrontMatterContextFromPayload(
  payload: Record<string, unknown>,
  options?: { facadePhotoUrl?: string | null; carbonMonoxideRecommendation?: string | null },
): LegalFrontMatterContext {
  return {
    ownerDisclosure: buildOwnerDisclosureFromPayload(payload),
    conditions: buildInspectionConditionsFromPayload(payload),
    limitations: readInspectionLimitationsFromPayload(payload),
    carbonMonoxideRecommendation: options?.carbonMonoxideRecommendation ?? null,
    facadePhotoUrl: options?.facadePhotoUrl ?? null,
  };
}
