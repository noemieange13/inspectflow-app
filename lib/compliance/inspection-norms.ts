/**
 * Normes d'inspection en bâtiment au Canada — données de conformité statiques.
 *
 * Sources :
 *  - AIBQ (Association des inspecteurs en bâtiment du Québec / QABI)
 *    Norme de pratique — https://aibq.qc.ca/media/1391/standard-of-practice_aibq.pdf
 *    Page composants — https://aibq.qc.ca/en/pre-purchase-inspection/
 *  - OAHI (Ontario Association of Home Inspectors)
 *    Standards of Practice (rev. PDF) — https://redbrickinspections.ca/wp-content/uploads/2015/06/StandardsofPractice-OAHI-Rev.pdf
 *    Page officielle — https://oahi.com/english/about/standards-of-practice.html
 *  - CAHPI (Canadian Association of Home & Property Inspectors)
 *    National Standards 2023 — https://www.cahpi.ca/en/home-inspectors/inspector-standards
 *
 * @module inspection-norms
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type ProvinceCode =
  | "QC"
  | "ON"
  | "BC"
  | "AB"
  | "MB"
  | "SK"
  | "NS"
  | "NB"
  | "PE"
  | "NL"
  | "NT"
  | "YT"
  | "NU"
  | "CA"; // national / général

export type NormBody = "AIBQ" | "OAHI" | "CAHPI" | "BC_GOVN" | "AB_GOVN";

export type SeverityLevel = "minor" | "moderate" | "major" | "safety";

export type SectionId =
  // AIBQ / CAHPI / OAHI — partagés (libellés varient)
  | "structural"
  | "exterior"
  | "roofing"
  | "plumbing"
  | "electrical"
  | "heating"
  | "cooling"
  | "interior"
  | "insulation"
  | "ventilation"
  | "occupant_safety"
  // Rapport seulement (non-systèmes physiques)
  | "cover_page"
  | "limitations"
  | "legal_clauses"
  | "summary";

export type LegalClauseCategory =
  | "scope"
  | "limitation"
  | "exclusion"
  | "liability"
  | "disclaimer"
  | "confidentiality";

// ---------------------------------------------------------------------------
// Province metadata
// ---------------------------------------------------------------------------

export interface ProvinceInfo {
  code: ProvinceCode;
  nameFr: string;
  nameEn: string;
  primaryBody: NormBody;
  /** URL de la norme principale */
  normUrl: string;
  /** Loi ou règlement encadrant l'inspection (si existant) */
  regulatoryFramework: string | null;
  /** TODO si manquant */
  _todo?: string;
}

/** @source AIBQ, OAHI, CAHPI, gouvernements provinciaux */
export const PROVINCES: Record<ProvinceCode, ProvinceInfo> = {
  QC: {
    code: "QC",
    nameFr: "Québec",
    nameEn: "Quebec",
    primaryBody: "AIBQ",
    normUrl: "https://aibq.qc.ca/media/1391/standard-of-practice_aibq.pdf",
    regulatoryFramework:
      "Loi sur le courtage immobilier (L.R.Q., c. C-73.2) — inspection pré-achat réglementée via contrat de courtage. " +
      "Norme de pratique AIBQ reconnue par les tribunaux et l'industrie. " +
      "Règlement visant à encadrer la profession d'inspecteur en bâtiment (échéance 2027).",
  },
  ON: {
    code: "ON",
    nameFr: "Ontario",
    nameEn: "Ontario",
    primaryBody: "OAHI",
    normUrl: "https://oahi.com/english/about/standards-of-practice.html",
    regulatoryFramework:
      "Ontario New Home Warranties Plan Act (TARION). " +
      "Home Inspection Act, 2017 (S.O. 2017, c. 5) — not yet fully proclaimed as of 2024. " +
      "OAHI Standards of Practice or CAHPI 2023 National SOP accepted.",
  },
  BC: {
    code: "BC",
    nameFr: "Colombie-Britannique",
    nameEn: "British Columbia",
    primaryBody: "CAHPI",
    normUrl: "https://www.bclaws.gov.bc.ca/civix/document/id/complete/statreg/09034_01",
    regulatoryFramework:
      "Home Inspector Licensing Regulation (B.C. Reg. 452/2009) — licensing mandatory since 2009. " +
      "Consumer Protection BC oversees licensing.",
  },
  AB: {
    code: "AB",
    nameFr: "Alberta",
    nameEn: "Alberta",
    primaryBody: "CAHPI",
    normUrl: "https://www.alberta.ca/home-inspectors",
    regulatoryFramework:
      "Service Alberta — Home Inspectors Designation Regulation (AR 197/2011). " +
      "Mandatory licensing since 2011.",
  },
  MB: {
    code: "MB",
    nameFr: "Manitoba",
    nameEn: "Manitoba",
    primaryBody: "CAHPI",
    normUrl: "https://www.cahpi.ca/en/home-inspectors/inspector-standards",
    regulatoryFramework: null,
    _todo: "TODO: Vérifier si réglementation provinciale MB adoptée — source: gouvernement Manitoba",
  },
  SK: {
    code: "SK",
    nameFr: "Saskatchewan",
    nameEn: "Saskatchewan",
    primaryBody: "CAHPI",
    normUrl: "https://www.cahpi.ca/en/home-inspectors/inspector-standards",
    regulatoryFramework: null,
    _todo: "TODO: Confirmer statut législatif SK — source: gouvernement Saskatchewan",
  },
  NS: {
    code: "NS",
    nameFr: "Nouvelle-Écosse",
    nameEn: "Nova Scotia",
    primaryBody: "CAHPI",
    normUrl: "https://www.cahpi.ca/en/home-inspectors/inspector-standards",
    regulatoryFramework: null,
  },
  NB: {
    code: "NB",
    nameFr: "Nouveau-Brunswick",
    nameEn: "New Brunswick",
    primaryBody: "CAHPI",
    normUrl: "https://www.cahpi.ca/en/home-inspectors/inspector-standards",
    regulatoryFramework: null,
  },
  PE: {
    code: "PE",
    nameFr: "Île-du-Prince-Édouard",
    nameEn: "Prince Edward Island",
    primaryBody: "CAHPI",
    normUrl: "https://www.cahpi.ca/en/home-inspectors/inspector-standards",
    regulatoryFramework: null,
  },
  NL: {
    code: "NL",
    nameFr: "Terre-Neuve-et-Labrador",
    nameEn: "Newfoundland and Labrador",
    primaryBody: "CAHPI",
    normUrl: "https://www.cahpi.ca/en/home-inspectors/inspector-standards",
    regulatoryFramework: null,
  },
  NT: {
    code: "NT",
    nameFr: "Territoires du Nord-Ouest",
    nameEn: "Northwest Territories",
    primaryBody: "CAHPI",
    normUrl: "https://www.cahpi.ca/en/home-inspectors/inspector-standards",
    regulatoryFramework: null,
  },
  YT: {
    code: "YT",
    nameFr: "Yukon",
    nameEn: "Yukon",
    primaryBody: "CAHPI",
    normUrl: "https://www.cahpi.ca/en/home-inspectors/inspector-standards",
    regulatoryFramework: null,
  },
  NU: {
    code: "NU",
    nameFr: "Nunavut",
    nameEn: "Nunavut",
    primaryBody: "CAHPI",
    normUrl: "https://www.cahpi.ca/en/home-inspectors/inspector-standards",
    regulatoryFramework: null,
  },
  CA: {
    code: "CA",
    nameFr: "Canada (national)",
    nameEn: "Canada (national)",
    primaryBody: "CAHPI",
    normUrl: "https://www.cahpi.ca/en/home-inspectors/inspector-standards",
    regulatoryFramework:
      "CAHPI National Standards of Practice 2023 (Version G, January 25, 2023). " +
      "Also accepted: CSA A770-16 (Residential Home Inspection Standard) and ASHI SOP.",
  },
};

// ---------------------------------------------------------------------------
// Required sections
// ---------------------------------------------------------------------------

export interface RequiredSection {
  id: SectionId;
  /** Article/numéro de référence dans la norme */
  normRef: string;
  /** Libellé en français */
  labelFr: string;
  /** Libellé en anglais */
  labelEn: string;
  /** Description courte de ce que la section doit contenir */
  descriptionFr: string;
  descriptionEn: string;
  /** La section est physiquement inspectée (vs documentaire) */
  isPhysicalSystem: boolean;
  mandatory: boolean;
}

/**
 * Sections obligatoires par province/corps normatif.
 * @source AIBQ Art. 14 (rapport) + Art. 2-13 (composants 11 sections)
 * @source OAHI SOP Section 2, 12, 13
 * @source CAHPI 2023 National SOP
 */
export const REQUIRED_SECTIONS: Record<ProvinceCode, RequiredSection[]> = {
  // ─── QUÉBEC (AIBQ) ────────────────────────────────────────────────────────
  QC: [
    {
      id: "cover_page",
      normRef: "AIBQ Art. 14.1–14.2",
      labelFr: "Page couverture / identification",
      labelEn: "Cover page / identification",
      descriptionFr:
        "Identification du demandeur, date, heure, conditions météorologiques, noms des personnes présentes, adresse du bâtiment.",
      descriptionEn:
        "Requester identification, date, time, weather conditions, names of attendees, property address.",
      isPhysicalSystem: false,
      mandatory: true,
    },
    {
      id: "summary",
      normRef: "AIBQ Art. 14.3–14.4",
      labelFr: "Description sommaire et table des matières",
      labelEn: "Building summary and table of contents",
      descriptionFr:
        "Brève description du bâtiment, table des matières avec numérotation des pages.",
      descriptionEn:
        "Brief building description, numbered table of contents.",
      isPhysicalSystem: false,
      mandatory: true,
    },
    {
      id: "structural",
      normRef: "AIBQ Section I (Art. 2–3)",
      labelFr: "I – Composants structuraux",
      labelEn: "I – Structural components",
      descriptionFr:
        "Fondations, planchers, murs porteurs, colonnes, poutres, plafonds, toits (charpente). " +
        "Observer l'état visible des éléments porteurs; signaler fissures, affaissements, humidité.",
      descriptionEn:
        "Foundations, floors, bearing walls, columns, beams, ceilings, roof framing.",
      isPhysicalSystem: true,
      mandatory: true,
    },
    {
      id: "exterior",
      normRef: "AIBQ Section II (Art. 4–5)",
      labelFr: "II – Extérieur",
      labelEn: "II – Exterior",
      descriptionFr:
        "Revêtement extérieur, portes et fenêtres, terrasses, balcons, escaliers extérieurs, porches, rampes, garages attachés et détachés.",
      descriptionEn:
        "Exterior cladding, doors, windows, decks, balconies, exterior stairs, porches, railings, garages.",
      isPhysicalSystem: true,
      mandatory: true,
    },
    {
      id: "roofing",
      normRef: "AIBQ Section III (Art. 6)",
      labelFr: "III – Toiture",
      labelEn: "III – Roofing",
      descriptionFr:
        "Matériaux de couverture, systèmes de drainage (gouttières, descentes), solins, puits de lumière, cheminées, ventilation de toiture.",
      descriptionEn:
        "Roof covering materials, drainage systems (gutters, downspouts), flashings, skylights, chimneys, roof ventilation.",
      isPhysicalSystem: true,
      mandatory: true,
    },
    {
      id: "plumbing",
      normRef: "AIBQ Section IV (Art. 7)",
      labelFr: "IV – Plomberie",
      labelEn: "IV – Plumbing",
      descriptionFr:
        "Tuyauterie d'eau (alimentation et drainage), robinetterie, chauffe-eau, réservoirs de carburant visibles, fosses septiques (observable).",
      descriptionEn:
        "Water supply and drain piping, fixtures, water heater, visible fuel tanks.",
      isPhysicalSystem: true,
      mandatory: true,
    },
    {
      id: "electrical",
      normRef: "AIBQ Section V (Art. 8)",
      labelFr: "V – Électricité",
      labelEn: "V – Electrical",
      descriptionFr:
        "Entrée de service, mise à la terre, boîte de service principale, panneaux de distribution, circuits, disjoncteurs, prises et interrupteurs accessibles.",
      descriptionEn:
        "Service entrance, grounding, main service panel, distribution panels, circuits, breakers, accessible outlets and switches.",
      isPhysicalSystem: true,
      mandatory: true,
    },
    {
      id: "heating",
      normRef: "AIBQ Section VI (Art. 9)",
      labelFr: "VI – Chauffage",
      labelEn: "VI – Heating",
      descriptionFr:
        "Systèmes de chauffage (source d'énergie, type d'appareil), contrôles, distribution (conduits, radiateurs, plinthes), réservoirs de carburant.",
      descriptionEn:
        "Heating systems (energy source, equipment type), controls, distribution (ducts, radiators, baseboards), fuel tanks.",
      isPhysicalSystem: true,
      mandatory: true,
    },
    {
      id: "cooling",
      normRef: "AIBQ Section VII (Art. 10)",
      labelFr: "VII – Climatisation et pompe à chaleur",
      labelEn: "VII – Cooling and heat pump",
      descriptionFr:
        "Système de refroidissement central (si présent), conduits de distribution, pompe à chaleur.",
      descriptionEn:
        "Central cooling system (if present), distribution ducts, heat pump.",
      isPhysicalSystem: true,
      mandatory: true,
    },
    {
      id: "interior",
      normRef: "AIBQ Section VIII (Art. 11)",
      labelFr: "VIII – Intérieur",
      labelEn: "VIII – Interior",
      descriptionFr:
        "Finitions intérieures (murs, planchers, plafonds), escaliers intérieurs, armoires, portes et fenêtres intérieures. " +
        "Tous les signes de pénétration d'eau, taches ou moisissures (Art. 14.7).",
      descriptionEn:
        "Interior finishes (walls, floors, ceilings), interior stairs, cabinets, interior doors and windows. " +
        "All signs of water penetration, staining, or mould (Art. 14.7).",
      isPhysicalSystem: true,
      mandatory: true,
    },
    {
      id: "insulation",
      normRef: "AIBQ Section IX (Art. 12)",
      labelFr: "IX – Isolation",
      labelEn: "IX – Insulation",
      descriptionFr:
        "Matériaux d'isolation et pare-vapeur dans les espaces non finis (sous-sol, grenier, vide sanitaire).",
      descriptionEn:
        "Insulation materials and vapour barrier in unfinished areas (basement, attic, crawl space).",
      isPhysicalSystem: true,
      mandatory: true,
    },
    {
      id: "ventilation",
      normRef: "AIBQ Section X (Art. 13)",
      labelFr: "X – Ventilation",
      labelEn: "X – Ventilation",
      descriptionFr:
        "Ventilation des greniers et sous-sols, systèmes de ventilation cuisine et salle de bain, échangeur d'air (VRC/ERV) si présent.",
      descriptionEn:
        "Attic and basement ventilation, kitchen and bathroom exhaust ventilation, HRV/ERV if present.",
      isPhysicalSystem: true,
      mandatory: true,
    },
    {
      id: "occupant_safety",
      normRef: "AIBQ Section XI (Art. 14)",
      labelFr: "XI – Sécurité des occupants",
      labelEn: "XI – Occupant safety",
      descriptionFr:
        "Rampes et garde-fous, sorties de secours (fenêtres de sous-sol), détecteurs de fumée (Art. 60.1), détecteurs de monoxyde de carbone (Art. 60.2).",
      descriptionEn:
        "Handrails and guardrails, emergency egress, smoke detectors (Art. 60.1), carbon monoxide detectors (Art. 60.2).",
      isPhysicalSystem: true,
      mandatory: true,
    },
    {
      id: "limitations",
      normRef: "AIBQ Art. 11 + Art. 14.6",
      labelFr: "Limitations de l'inspection",
      labelEn: "Inspection limitations",
      descriptionFr:
        "Liste des systèmes non inspectés ou partiellement inspectés avec raisons (accès refusé, conditions dangereuses, systèmes hors service).",
      descriptionEn:
        "List of uninspected or partially inspected systems with reasons (no access, unsafe conditions, systems off).",
      isPhysicalSystem: false,
      mandatory: true,
    },
    {
      id: "legal_clauses",
      normRef: "AIBQ Convention de service + Art. 11–12",
      labelFr: "Clauses légales et exclusions",
      labelEn: "Legal clauses and exclusions",
      descriptionFr:
        "Portée de l'inspection, exclusions, limitations de responsabilité, mise en garde contre les vices cachés.",
      descriptionEn:
        "Scope of inspection, exclusions, liability limitations, latent defect disclaimer.",
      isPhysicalSystem: false,
      mandatory: true,
    },
  ],

  // ─── ONTARIO (OAHI → CAHPI 2023 SOP) ─────────────────────────────────────
  ON: [
    {
      id: "cover_page",
      normRef: "OAHI SOP 2.2 / CAHPI 2023",
      labelFr: "Page couverture",
      labelEn: "Cover page",
      descriptionFr:
        "Identification du client, adresse, nom de l'inspecteur, date, conditions.",
      descriptionEn:
        "Client identification, property address, inspector name, date, conditions.",
      isPhysicalSystem: false,
      mandatory: true,
    },
    {
      id: "structural",
      normRef: "OAHI SOP 3.1",
      labelFr: "Composants structuraux",
      labelEn: "Structural systems",
      descriptionFr: "Fondations, charpente plancher, murs porteurs, charpente toit.",
      descriptionEn: "Foundation, floor framing, bearing walls, roof framing.",
      isPhysicalSystem: true,
      mandatory: true,
    },
    {
      id: "exterior",
      normRef: "OAHI SOP 3.2",
      labelFr: "Extérieur",
      labelEn: "Exterior",
      descriptionFr: "Revêtement, portes, fenêtres, terrasses, garages, drainage de surface.",
      descriptionEn: "Cladding, doors, windows, decks, garages, surface drainage.",
      isPhysicalSystem: true,
      mandatory: true,
    },
    {
      id: "roofing",
      normRef: "OAHI SOP 3.3",
      labelFr: "Toiture",
      labelEn: "Roof system",
      descriptionFr: "Matériaux de couverture, drainage, solins, lucarnes, cheminées.",
      descriptionEn: "Roof covering, drainage, flashings, skylights, chimneys.",
      isPhysicalSystem: true,
      mandatory: true,
    },
    {
      id: "plumbing",
      normRef: "OAHI SOP 3.4",
      labelFr: "Plomberie",
      labelEn: "Plumbing system",
      descriptionFr: "Alimentation en eau, drainage, chauffe-eau, équipements de chauffage hydraulique.",
      descriptionEn: "Water supply, drain/waste/vent, water heater, hydronic heating equipment.",
      isPhysicalSystem: true,
      mandatory: true,
    },
    {
      id: "electrical",
      normRef: "OAHI SOP 3.5",
      labelFr: "Électricité",
      labelEn: "Electrical system",
      descriptionFr: "Entrée de service, tableau principal, câblage, prises, éclairage.",
      descriptionEn: "Service entry, main panel, wiring, outlets, lighting fixtures.",
      isPhysicalSystem: true,
      mandatory: true,
    },
    {
      id: "heating",
      normRef: "OAHI SOP 3.6",
      labelFr: "Chauffage",
      labelEn: "Heating system",
      descriptionFr: "Appareils de chauffage, distribution, contrôles, cheminées.",
      descriptionEn: "Heating equipment, distribution, controls, chimneys/flues.",
      isPhysicalSystem: true,
      mandatory: true,
    },
    {
      id: "cooling",
      normRef: "OAHI SOP 3.7",
      labelFr: "Climatisation",
      labelEn: "Air conditioning",
      descriptionFr: "Climatiseurs centraux et thermopompes, distribution.",
      descriptionEn: "Central air conditioning and heat pumps, distribution.",
      isPhysicalSystem: true,
      mandatory: true,
    },
    {
      id: "interior",
      normRef: "OAHI SOP 3.8",
      labelFr: "Intérieur",
      labelEn: "Interior",
      descriptionFr: "Murs, plafonds, planchers, escaliers, portes, fenêtres intérieures.",
      descriptionEn: "Walls, ceilings, floors, stairs, interior doors and windows.",
      isPhysicalSystem: true,
      mandatory: true,
    },
    {
      id: "insulation",
      normRef: "OAHI SOP 3.9",
      labelFr: "Isolation et pare-vapeur",
      labelEn: "Insulation and vapour barrier",
      descriptionFr: "Isolation visible dans les espaces non finis, pare-vapeur.",
      descriptionEn: "Visible insulation in unfinished areas, vapour barrier.",
      isPhysicalSystem: true,
      mandatory: true,
    },
    {
      id: "ventilation",
      normRef: "OAHI SOP 3.9",
      labelFr: "Ventilation",
      labelEn: "Ventilation",
      descriptionFr: "Ventilation greniers, vides sanitaires, salles de bain, cuisine.",
      descriptionEn: "Attic, crawl space, bathroom, and kitchen ventilation.",
      isPhysicalSystem: true,
      mandatory: true,
    },
    {
      id: "limitations",
      normRef: "OAHI SOP 2.2B + 13.2",
      labelFr: "Systèmes non inspectés",
      labelEn: "Uninspected systems",
      descriptionFr: "Systèmes désignés non inspectés avec raisons explicites.",
      descriptionEn:
        "Designated systems not inspected with explicit reasons. Required per SOP 2.2B.",
      isPhysicalSystem: false,
      mandatory: true,
    },
    {
      id: "legal_clauses",
      normRef: "OAHI SOP 13",
      labelFr: "Portée, limitations et exclusions",
      labelEn: "Scope, limitations and exclusions",
      descriptionFr: "Non exhaustif, défauts cachés exclus, conformité aux codes exclue.",
      descriptionEn:
        "Not technically exhaustive, concealed conditions excluded, code compliance excluded.",
      isPhysicalSystem: false,
      mandatory: true,
    },
  ],

  // ─── CANADA (CAHPI national — utilisé pour BC, AB et autres provinces) ────
  CA: [
    {
      id: "cover_page",
      normRef: "CAHPI 2023 SOP §1",
      labelFr: "Page couverture",
      labelEn: "Cover page",
      descriptionFr: "Client, adresse, inspecteur, date, conditions météo.",
      descriptionEn: "Client, address, inspector, date, weather conditions.",
      isPhysicalSystem: false,
      mandatory: true,
    },
    {
      id: "structural",
      normRef: "CAHPI 2023 SOP §3",
      labelFr: "Composants structuraux",
      labelEn: "Structural components",
      descriptionFr: "Fondations, charpente plancher, murs porteurs, charpente toit.",
      descriptionEn: "Foundation, floor framing, bearing walls, roof framing.",
      isPhysicalSystem: true,
      mandatory: true,
    },
    {
      id: "exterior",
      normRef: "CAHPI 2023 SOP §4",
      labelFr: "Extérieur",
      labelEn: "Exterior",
      descriptionFr: "Revêtement, portes, fenêtres, drainage, garages, terrasses.",
      descriptionEn: "Cladding, doors, windows, drainage, garages, decks.",
      isPhysicalSystem: true,
      mandatory: true,
    },
    {
      id: "roofing",
      normRef: "CAHPI 2023 SOP §5",
      labelFr: "Toiture",
      labelEn: "Roofing",
      descriptionFr: "Couverture, drainage, solins, cheminées, lucarnes.",
      descriptionEn: "Roof covering, drainage, flashings, chimneys, skylights.",
      isPhysicalSystem: true,
      mandatory: true,
    },
    {
      id: "plumbing",
      normRef: "CAHPI 2023 SOP §6",
      labelFr: "Plomberie",
      labelEn: "Plumbing",
      descriptionFr: "Alimentation, drainage, chauffe-eau.",
      descriptionEn: "Supply, drain, water heating.",
      isPhysicalSystem: true,
      mandatory: true,
    },
    {
      id: "electrical",
      normRef: "CAHPI 2023 SOP §7",
      labelFr: "Électricité",
      labelEn: "Electrical",
      descriptionFr: "Service, tableau, câblage, prises.",
      descriptionEn: "Service, panel, wiring, outlets.",
      isPhysicalSystem: true,
      mandatory: true,
    },
    {
      id: "heating",
      normRef: "CAHPI 2023 SOP §8",
      labelFr: "Chauffage",
      labelEn: "Heating",
      descriptionFr: "Appareils, distribution, contrôles.",
      descriptionEn: "Equipment, distribution, controls.",
      isPhysicalSystem: true,
      mandatory: true,
    },
    {
      id: "cooling",
      normRef: "CAHPI 2023 SOP §9",
      labelFr: "Climatisation",
      labelEn: "Cooling",
      descriptionFr: "Refroidissement central, thermopompe.",
      descriptionEn: "Central cooling, heat pump.",
      isPhysicalSystem: true,
      mandatory: true,
    },
    {
      id: "interior",
      normRef: "CAHPI 2023 SOP §10",
      labelFr: "Intérieur",
      labelEn: "Interior",
      descriptionFr: "Finitions, escaliers, portes, fenêtres.",
      descriptionEn: "Finishes, stairs, doors, windows.",
      isPhysicalSystem: true,
      mandatory: true,
    },
    {
      id: "insulation",
      normRef: "CAHPI 2023 SOP §11",
      labelFr: "Isolation",
      labelEn: "Insulation",
      descriptionFr: "Isolation visible, pare-vapeur.",
      descriptionEn: "Visible insulation, vapour barrier.",
      isPhysicalSystem: true,
      mandatory: true,
    },
    {
      id: "ventilation",
      normRef: "CAHPI 2023 SOP §11",
      labelFr: "Ventilation",
      labelEn: "Ventilation",
      descriptionFr: "Ventilation mécanique et naturelle.",
      descriptionEn: "Mechanical and natural ventilation.",
      isPhysicalSystem: true,
      mandatory: true,
    },
    {
      id: "limitations",
      normRef: "CAHPI 2023 SOP §2",
      labelFr: "Limitations",
      labelEn: "Limitations",
      descriptionFr: "Éléments non inspectés avec justification.",
      descriptionEn: "Uninspected items with justification.",
      isPhysicalSystem: false,
      mandatory: true,
    },
    {
      id: "legal_clauses",
      normRef: "CAHPI 2023 SOP §13",
      labelFr: "Portée et exclusions",
      labelEn: "Scope and exclusions",
      descriptionFr: "Inspection visuelle, non exhaustive, défauts latents exclus.",
      descriptionEn: "Visual inspection, not exhaustive, latent defects excluded.",
      isPhysicalSystem: false,
      mandatory: true,
    },
  ],

  // Provinces non prioritaires → héritent des sections CAHPI nationales
  BC: [],
  AB: [],
  MB: [],
  SK: [],
  NS: [],
  NB: [],
  PE: [],
  NL: [],
  NT: [],
  YT: [],
  NU: [],
};

// Provinces héritant des sections nationales CAHPI
(["BC", "AB", "MB", "SK", "NS", "NB", "PE", "NL", "NT", "YT", "NU"] as ProvinceCode[]).forEach(
  (code) => {
    REQUIRED_SECTIONS[code] = REQUIRED_SECTIONS.CA.map((s) => ({ ...s }));
  },
);

// ---------------------------------------------------------------------------
// Legal clauses
// ---------------------------------------------------------------------------

export interface LegalClause {
  id: string;
  category: LegalClauseCategory;
  /** Référence normative */
  normRef: string;
  labelFr: string;
  labelEn: string;
  /** Texte de la clause */
  textFr: string;
  textEn: string;
  mandatory: boolean;
  /** Conditions d'applicabilité (ex. "seulement si fosses septiques présentes") */
  applicabilityNote?: string;
}

/**
 * Clauses légales par province.
 * @source AIBQ Norme de pratique Art. 11–12, Convention de service AIBQ 2022
 * @source OAHI SOP Section 13
 * @source CAHPI 2023 SOP §13
 */
export const LEGAL_CLAUSES: Record<ProvinceCode, LegalClause[]> = {
  // ─── QUÉBEC ───────────────────────────────────────────────────────────────
  QC: [
    {
      id: "qc_scope",
      category: "scope",
      normRef: "AIBQ Norme de pratique, Préambule + Art. 1",
      labelFr: "Portée de l'inspection",
      labelEn: "Scope of inspection",
      textFr:
        "La présente inspection est effectuée conformément à la Norme de pratique de l'AIBQ " +
        "(Association des inspecteurs en bâtiment du Québec). Elle constitue un examen visuel " +
        "non exhaustif du bâtiment dans son état apparent au moment de l'inspection. " +
        "Elle vise à identifier les défauts importants susceptibles de réduire l'usage, " +
        "la jouissance ou la valeur du bâtiment, ou de présenter un risque pour la sécurité des occupants.",
      textEn:
        "This inspection is performed in accordance with the AIBQ (Quebec Association of Building " +
        "Inspectors) Standards of Practice. It constitutes a non-exhaustive visual examination of " +
        "the building in its apparent condition at the time of inspection. It aims to identify " +
        "significant defects that may reduce the use, enjoyment or value of the building, or " +
        "present a risk to occupant safety.",
      mandatory: true,
    },
    {
      id: "qc_visual_only",
      category: "limitation",
      normRef: "AIBQ Art. 11.1–11.5",
      labelFr: "Inspection visuelle uniquement",
      labelEn: "Visual inspection only",
      textFr:
        "L'inspecteur n'est pas tenu : d'accéder à des zones ou composants présentant un risque " +
        "pour sa sécurité; d'actionner des systèmes hors service, fermés ou présentant un risque " +
        "d'endommagement; de déplacer des meubles ou obstructions; d'analyser les substances " +
        "dangereuses (amiante, moisissures, UVAR, radon, etc.); de détecter les organismes nuisibles " +
        "(insectes, rongeurs). L'inspection ne couvre que les éléments visibles et accessibles " +
        "au moment de la visite.",
      textEn:
        "The inspector is not required to: access areas or components presenting a safety risk; " +
        "operate systems that are shut-off, inoperable or risk damage; move furnishings or " +
        "obstructions; analyse hazardous substances (asbestos, mould, UFFI, radon, etc.); " +
        "detect pest organisms. The inspection covers only visible and accessible elements " +
        "at the time of the visit.",
      mandatory: true,
    },
    {
      id: "qc_exclusions",
      category: "exclusion",
      normRef: "AIBQ Art. 12",
      labelFr: "Exclusions de l'inspection",
      labelEn: "Inspection exclusions",
      textFr:
        "Le rapport d'inspection n'inclut pas : l'espérance de vie des composants; " +
        "l'évaluation des coûts de correction; l'évaluation de la valeur marchande; " +
        "les recommandations d'achat ou de refus d'achat; les composants souterrains " +
        "(fondations enterrées, drain français, réservoirs enfouis); les piscines, " +
        "spas, saunas; les systèmes d'alarme et de sécurité; la conformité aux codes " +
        "du bâtiment, règlements municipaux ou autres lois.",
      textEn:
        "The inspection report does not include: component life expectancy; cost estimates " +
        "for repairs; property market value assessment; purchase recommendations; " +
        "underground components (buried foundations, weeping tile, buried tanks); " +
        "pools, spas, saunas; alarm and security systems; compliance with building codes, " +
        "municipal bylaws or other regulations.",
      mandatory: true,
    },
    {
      id: "qc_liability",
      category: "liability",
      normRef: "AIBQ Convention de service, Art. 7–8",
      labelFr: "Limitation de responsabilité",
      labelEn: "Limitation of liability",
      textFr:
        "La responsabilité de l'inspecteur est limitée au montant des honoraires perçus. " +
        "Le rapport est rédigé exclusivement à l'intention du client signataire de la " +
        "convention de service. Toute réclamation doit être formulée par écrit dans " +
        "l'année suivant la date de l'inspection. Ce rapport ne peut être utilisé à " +
        "des fins de procédures judiciaires contre des tiers sans le consentement " +
        "écrit de l'inspecteur.",
      textEn:
        "The inspector's liability is limited to the amount of fees collected. The report " +
        "is prepared exclusively for the client who signed the service agreement. Any claim " +
        "must be submitted in writing within one year of the inspection date. This report " +
        "may not be used in legal proceedings against third parties without the inspector's " +
        "written consent.",
      mandatory: true,
    },
    {
      id: "qc_latent_defects",
      category: "disclaimer",
      normRef: "Code civil du Québec, art. 1726–1731 + AIBQ Convention de service",
      labelFr: "Vices cachés — mise en garde",
      labelEn: "Latent defects — disclaimer",
      textFr:
        "Une inspection pré-achat est un examen visuel ponctuel; elle ne constitue pas " +
        "une garantie contre les vices cachés au sens du Code civil du Québec (art. 1726 C.c.Q.). " +
        "L'inspecteur ne peut déceler les défauts non visibles, couverts ou dissimulés. " +
        "L'acheteur est invité à conserver ses recours légaux prévus aux articles 1726 à 1731 C.c.Q.",
      textEn:
        "A pre-purchase inspection is a one-time visual examination; it does not constitute " +
        "a guarantee against latent defects under the Civil Code of Quebec (art. 1726 C.c.Q.). " +
        "The inspector cannot detect non-visible, covered, or concealed defects. " +
        "The buyer is advised to preserve their legal recourse under art. 1726–1731 C.c.Q.",
      mandatory: true,
    },
    {
      id: "qc_confidentiality",
      category: "confidentiality",
      normRef: "AIBQ Convention de service, Art. 9",
      labelFr: "Confidentialité du rapport",
      labelEn: "Report confidentiality",
      textFr:
        "Le rapport d'inspection est confidentiel et destiné au seul usage du client " +
        "signataire. L'inspecteur ne transmettra une copie à un tiers qu'avec le " +
        "consentement écrit préalable du client ou sur ordonnance du tribunal.",
      textEn:
        "The inspection report is confidential and intended solely for the use of the " +
        "signing client. The inspector will only provide a copy to a third party with " +
        "the client's prior written consent or pursuant to a court order.",
      mandatory: true,
    },
  ],

  // ─── ONTARIO (OAHI SOP §13) ───────────────────────────────────────────────
  ON: [
    {
      id: "on_scope",
      category: "scope",
      normRef: "OAHI SOP 2.1",
      labelFr: "Portée de l'inspection",
      labelEn: "Scope of inspection",
      textFr:
        "Cette inspection est effectuée conformément aux Normes de pratique de l'OAHI ou aux " +
        "Normes nationales CAHPI 2023. Elle constitue un examen visuel minimal et uniforme " +
        "des systèmes et composants d'un bâtiment résidentiel de quatre logements ou moins.",
      textEn:
        "This inspection is performed in accordance with the OAHI Standards of Practice or " +
        "CAHPI 2023 National Standards. It constitutes a minimum and uniform visual examination " +
        "of the systems and components of a residential building of four dwelling units or fewer.",
      mandatory: true,
    },
    {
      id: "on_not_exhaustive",
      category: "limitation",
      normRef: "OAHI SOP 13.1",
      labelFr: "Inspection non exhaustive",
      labelEn: "Not technically exhaustive",
      textFr:
        "Les inspections effectuées conformément aux présentes Normes ne sont pas " +
        "techniquement exhaustives. Elles ne permettent pas d'identifier les conditions " +
        "cachées ni les défauts latents.",
      textEn:
        "Inspections performed in accordance with these Standards are not technically exhaustive. " +
        "They will not identify concealed conditions or latent defects.",
      mandatory: true,
    },
    {
      id: "on_exclusions",
      category: "exclusion",
      normRef: "OAHI SOP 13.2B",
      labelFr: "Éléments exclus du rapport",
      labelEn: "Items excluded from report",
      textFr:
        "L'inspecteur n'est pas requis de déterminer : l'état des systèmes non accessibles; " +
        "la durée de vie résiduelle; la solidité, l'adéquation ou l'efficacité; les causes " +
        "des conditions; les méthodes, matériaux ou coûts de correction; les conditions futures; " +
        "la conformité aux codes et règlements; la valeur marchande; l'opportunité d'achat; " +
        "la présence de végétaux nuisibles, d'animaux, d'insectes xylophages; " +
        "les risques environnementaux (toxines, cancérigènes, contaminants); " +
        "les coûts d'exploitation; les propriétés acoustiques.",
      textEn:
        "The inspector is not required to determine: the condition of non-readily accessible " +
        "systems; remaining life; strength, adequacy, effectiveness, or efficiency; causes of " +
        "conditions; methods, materials, or costs of corrections; future conditions or failures; " +
        "compliance with codes or regulations; market value; advisability of purchase; " +
        "hazardous plants/animals or wood-destroying organisms; environmental hazards " +
        "(toxins, carcinogens, contaminants); operating costs; acoustical properties.",
      mandatory: true,
    },
    {
      id: "on_no_warranty",
      category: "disclaimer",
      normRef: "OAHI SOP 13.2C",
      labelFr: "Aucune garantie",
      labelEn: "No warranties",
      textFr:
        "L'inspecteur ne fournit aucun service d'ingénierie, ni travaux de métier, " +
        "ni garantie ou caution de quelque nature que ce soit.",
      textEn:
        "The inspector does not perform engineering services, trade work, or provide " +
        "warranties or guarantees of any kind.",
      mandatory: true,
    },
    {
      id: "on_operations_excluded",
      category: "exclusion",
      normRef: "OAHI SOP 13.2D–G",
      labelFr: "Opérations exclues",
      labelEn: "Excluded operations",
      textFr:
        "L'inspecteur n'est pas tenu : d'actionner des systèmes hors service ou " +
        "inopérables; d'actionner les robinets d'arrêt d'urgence; " +
        "d'entrer dans des zones dangereuses ou des vides sanitaires/greniers inaccessibles; " +
        "d'inspecter les réservoirs souterrains; de démonter des systèmes; " +
        "de déplacer les biens personnels ou meubles.",
      textEn:
        "The inspector is not required to: operate shut-down or inoperable systems; " +
        "operate safety/shut-off valves; enter dangerous areas or inaccessible crawl spaces/attics; " +
        "inspect underground storage tanks; dismantle systems or components; " +
        "move personal property or furniture.",
      mandatory: true,
    },
  ],

  // ─── CANADA (CAHPI national) ───────────────────────────────────────────────
  CA: [
    {
      id: "ca_scope",
      category: "scope",
      normRef: "CAHPI 2023 National SOP §1.1",
      labelFr: "Portée nationale",
      labelEn: "National scope",
      textFr:
        "Inspection effectuée conformément aux Normes nationales de pratique CAHPI 2023 (Version G). " +
        "Ces normes sont les plus largement adoptées au Canada pour l'inspection résidentielle.",
      textEn:
        "Inspection performed in accordance with the CAHPI 2023 National Standards of Practice " +
        "(Version G, January 25, 2023). These are the most widely accepted Canadian residential " +
        "inspection standards.",
      mandatory: true,
    },
    {
      id: "ca_visual_limitation",
      category: "limitation",
      normRef: "CAHPI 2023 National SOP §13",
      labelFr: "Examen visuel — limitations générales",
      labelEn: "Visual examination — general limitations",
      textFr:
        "L'inspection est un examen visuel non destructif et non exhaustif. " +
        "Elle ne couvre pas les défauts cachés, les conditions futures, la conformité réglementaire " +
        "ni l'évaluation des coûts. L'inspecteur n'est pas tenu d'analyser les matières dangereuses " +
        "ou de fournir une expertise d'ingénierie.",
      textEn:
        "The inspection is a non-destructive, non-exhaustive visual examination. " +
        "It does not cover concealed defects, future conditions, regulatory compliance, or cost " +
        "estimates. The inspector is not required to analyse hazardous materials or provide " +
        "engineering expertise.",
      mandatory: true,
    },
    {
      id: "ca_no_warranty",
      category: "disclaimer",
      normRef: "CAHPI 2023 National SOP §13",
      labelFr: "Aucune garantie",
      labelEn: "No warranty",
      textFr: "Ce rapport ne constitue pas une garantie sur les systèmes ou composants inspectés.",
      textEn: "This report does not constitute a warranty on any inspected system or component.",
      mandatory: true,
    },
  ],

  // Provinces héritant des clauses CAHPI nationales
  BC: [],
  AB: [],
  MB: [],
  SK: [],
  NS: [],
  NB: [],
  PE: [],
  NL: [],
  NT: [],
  YT: [],
  NU: [],
};

// Provinces héritant des clauses nationales CAHPI
(["BC", "AB", "MB", "SK", "NS", "NB", "PE", "NL", "NT", "YT", "NU"] as ProvinceCode[]).forEach(
  (code) => {
    LEGAL_CLAUSES[code] = LEGAL_CLAUSES.CA.map((c) => ({ ...c }));
  },
);

// ---------------------------------------------------------------------------
// Disclaimer templates
// ---------------------------------------------------------------------------

/**
 * Textes de limitation de responsabilité pré-rédigés par province.
 * À utiliser comme valeur par défaut dans le champ `notes_conformite` / `limitations_free_text`.
 */
export const DISCLAIMER_TEMPLATES: Record<ProvinceCode, string> = {
  QC:
    "Cette inspection visuelle pré-achat a été effectuée conformément à la Norme de pratique " +
    "de l'AIBQ. Le rapport reflète l'état apparent du bâtiment au moment de la visite et ne " +
    "constitue pas une garantie ni une certification aux codes du bâtiment. " +
    "Les éléments non visibles ou non accessibles n'ont pu être évalués. " +
    "La responsabilité de l'inspecteur est limitée au montant des honoraires perçus. " +
    "Toute réclamation doit être formulée par écrit dans l'année suivant la date de l'inspection.",

  ON:
    "This pre-purchase home inspection was performed in accordance with the OAHI Standards of " +
    "Practice (or CAHPI 2023 National Standards). The report reflects the apparent condition of " +
    "the building at the time of inspection and is not a guarantee or warranty. Concealed, " +
    "inaccessible, or inoperable components were not inspected. This report does not determine " +
    "code compliance, remaining life expectancy, or repair costs. The inspector's liability is " +
    "limited to the fees paid for this inspection.",

  CA:
    "This inspection was performed in accordance with the CAHPI 2023 National Standards of " +
    "Practice. It is a visual, non-exhaustive examination. The report does not constitute a " +
    "warranty, code compliance certificate, or engineering assessment. Concealed or inaccessible " +
    "elements were not inspected. Liability is limited to fees collected.",

  BC:
    "This home inspection was performed under the BC Home Inspector Licensing Regulation and " +
    "in accordance with CAHPI 2023 National Standards. It is a visual examination only. " +
    "The report does not constitute a warranty or guarantee. Liability is limited to fees paid.",

  AB:
    "This home inspection was performed in accordance with Alberta Home Inspectors Designation " +
    "Regulation and CAHPI 2023 National Standards. Visual examination only. No warranty implied. " +
    "Liability limited to fees collected.",

  MB:
    "This inspection was performed in accordance with CAHPI 2023 National Standards. " +
    "Visual examination only. No warranty. Liability limited to fees paid. " +
    "// TODO: Verify Manitoba-specific regulatory requirements — source: gov.mb.ca",

  SK:
    "This inspection was performed in accordance with CAHPI 2023 National Standards. " +
    "Visual examination only. No warranty. Liability limited to fees paid.",

  NS:
    "This inspection was performed in accordance with CAHPI 2023 National Standards. " +
    "Visual examination only. No warranty. Liability limited to fees paid.",

  NB:
    "This inspection was performed in accordance with CAHPI 2023 National Standards. " +
    "Visual examination only. No warranty. Liability limited to fees paid.",

  PE:
    "This inspection was performed in accordance with CAHPI 2023 National Standards. " +
    "Visual examination only. No warranty. Liability limited to fees paid.",

  NL:
    "This inspection was performed in accordance with CAHPI 2023 National Standards. " +
    "Visual examination only. No warranty. Liability limited to fees paid.",

  NT:
    "This inspection was performed in accordance with CAHPI 2023 National Standards and " +
    "applicable territorial requirements. Visual examination only. No warranty. " +
    "Liability limited to fees paid.",

  YT:
    "This inspection was performed in accordance with CAHPI 2023 National Standards and " +
    "applicable territorial requirements. Visual examination only. No warranty. " +
    "Liability limited to fees paid.",

  NU:
    "This inspection was performed in accordance with CAHPI 2023 National Standards and " +
    "applicable territorial requirements. Visual examination only. No warranty. " +
    "Liability limited to fees paid.",
};

// ---------------------------------------------------------------------------
// Terminology
// ---------------------------------------------------------------------------

export interface NormTerm {
  termFr: string;
  termEn: string;
  definitionFr: string;
  definitionEn: string;
  normRef: string;
}

/**
 * Termes techniques normalisés.
 * @source AIBQ Norme de pratique — Section Définitions
 * @source OAHI/CAHPI SOP — Definitions
 */
export const TERMINOLOGY: Record<ProvinceCode, NormTerm[]> = {
  QC: [
    {
      termFr: "Défaut important",
      termEn: "Significant defect",
      definitionFr:
        "Tout défaut susceptible de réduire l'usage, la jouissance ou la valeur du bâtiment, " +
        "ou de présenter un risque pour la sécurité des occupants. (AIBQ Art. 1)",
      definitionEn:
        "Any defect likely to reduce the use, enjoyment or value of the building, or present " +
        "a risk to occupant safety. (AIBQ Art. 1)",
      normRef: "AIBQ Art. 1",
    },
    {
      termFr: "Inspection visuelle",
      termEn: "Visual inspection",
      definitionFr:
        "Examen des systèmes et composants accessibles, dans leur état apparent, sans " +
        "démontage ni sondage intrusif. (AIBQ Art. 1)",
      definitionEn:
        "Examination of accessible systems and components in their apparent condition, " +
        "without dismantling or intrusive probing. (AIBQ Art. 1)",
      normRef: "AIBQ Art. 1",
    },
    {
      termFr: "Composant accessible",
      termEn: "Accessible component",
      definitionFr:
        "Composant visible et atteignable lors d'une inspection normale sans déplacement " +
        "de meubles ou élément de construction. (AIBQ Art. 1)",
      definitionEn:
        "Component visible and reachable during a normal inspection without moving furnishings " +
        "or construction elements. (AIBQ Art. 1)",
      normRef: "AIBQ Art. 1",
    },
    {
      termFr: "Rapport d'inspection",
      termEn: "Inspection report",
      definitionFr:
        "Document écrit remis au client à la suite de l'inspection, décrivant l'état " +
        "des composants et signalant les défauts importants. (AIBQ Art. 14)",
      definitionEn:
        "Written document provided to the client following the inspection, describing the " +
        "condition of components and noting significant defects. (AIBQ Art. 14)",
      normRef: "AIBQ Art. 14",
    },
    {
      termFr: "Système",
      termEn: "System",
      definitionFr:
        "Ensemble de composants interconnectés remplissant une fonction commune " +
        "(ex. : électricité, plomberie, chauffage). (AIBQ)",
      definitionEn:
        "Set of interconnected components fulfilling a common function " +
        "(e.g., electrical, plumbing, heating). (AIBQ)",
      normRef: "AIBQ Norme de pratique",
    },
    {
      termFr: "Condition apparente",
      termEn: "Apparent condition",
      definitionFr:
        "État observable sans démontage à la date et heure de l'inspection; susceptible " +
        "de changer dans le temps. (AIBQ)",
      definitionEn:
        "Observable condition without dismantling as of the date and time of inspection; " +
        "may change over time. (AIBQ)",
      normRef: "AIBQ Norme de pratique",
    },
  ],

  ON: [
    {
      termFr: "Déficience significative",
      termEn: "Significant deficiency",
      definitionFr:
        "Composant ou système qui, de l'avis de l'inspecteur, est défaillant ou approche " +
        "de la fin de sa durée de vie et mérite d'être signalé. (OAHI SOP 2.2B)",
      definitionEn:
        "A component or system which, in the inspector's opinion, is significantly deficient " +
        "or near end of service life. (OAHI SOP 2.2B)",
      normRef: "OAHI SOP 2.2B",
    },
    {
      termFr: "Inspection résidentielle",
      termEn: "Home inspection",
      definitionFr:
        "Examen visuel minimal et uniforme d'un bâtiment résidentiel de quatre logements " +
        "ou moins. (OAHI SOP 2.1)",
      definitionEn:
        "Minimum and uniform visual examination of a residential building of four " +
        "dwelling units or fewer. (OAHI SOP 2.1)",
      normRef: "OAHI SOP 2.1",
    },
  ],

  CA: [
    {
      termFr: "Norme nationale",
      termEn: "National standard",
      definitionFr:
        "Exigence minimale reconnue à l'échelle nationale par la CAHPI pour l'inspection " +
        "résidentielle. (CAHPI 2023)",
      definitionEn:
        "Minimum requirement nationally recognized by CAHPI for residential inspection. " +
        "(CAHPI 2023)",
      normRef: "CAHPI 2023 National SOP",
    },
  ],

  // Autres provinces — héritent des termes nationaux
  BC: [],
  AB: [],
  MB: [],
  SK: [],
  NS: [],
  NB: [],
  PE: [],
  NL: [],
  NT: [],
  YT: [],
  NU: [],
};

(["BC", "AB", "MB", "SK", "NS", "NB", "PE", "NL", "NT", "YT", "NU"] as ProvinceCode[]).forEach(
  (code) => {
    TERMINOLOGY[code] = [...TERMINOLOGY.CA];
  },
);

// ---------------------------------------------------------------------------
// Severity definitions
// ---------------------------------------------------------------------------

export interface SeverityDefinition {
  level: SeverityLevel;
  labelFr: string;
  labelEn: string;
  descriptionFr: string;
  descriptionEn: string;
  /** Couleur HTML suggérée pour les rapports */
  colorHex: string;
  normRef: string;
  /** Action recommandée en rapport */
  actionFr: string;
  actionEn: string;
}

/**
 * Définitions de sévérité harmonisées AIBQ/OAHI/CAHPI.
 * @source AIBQ Norme de pratique Art. 14.6.3 (défauts + risques sécurité)
 * @source OAHI SOP 2.2B (significantly deficient / near end of life)
 * @source Pratique courante de l'industrie canadienne
 */
export const SEVERITY_DEFINITIONS: SeverityDefinition[] = [
  {
    level: "safety",
    labelFr: "Sécurité",
    labelEn: "Safety hazard",
    descriptionFr:
      "Condition présentant un risque immédiat pour la sécurité ou la santé des occupants. " +
      "Requiert une intervention urgente avant occupation ou utilisation. " +
      "(Ex. : risque d'incendie, électrocution, effondrement imminent, intoxication CO) " +
      "— Conforme AIBQ Art. 14.6.3 / OAHI SOP 2.2B.",
    descriptionEn:
      "Condition presenting an immediate risk to occupant safety or health. " +
      "Requires urgent intervention before occupancy or use. " +
      "(E.g.: fire risk, electrocution, imminent collapse, CO poisoning) " +
      "— Per AIBQ Art. 14.6.3 / OAHI SOP 2.2B.",
    colorHex: "#B91C1C",
    normRef: "AIBQ Art. 14.6.3 / OAHI SOP 2.2B",
    actionFr: "Intervention urgente requise avant occupation.",
    actionEn: "Urgent intervention required before occupancy.",
  },
  {
    level: "major",
    labelFr: "Majeur",
    labelEn: "Major deficiency",
    descriptionFr:
      "Défaut important susceptible de réduire significativement l'usage, la jouissance " +
      "ou la valeur du bâtiment, ou dont la détérioration pourrait présenter un risque futur. " +
      "(Ex. : fondation fissurée avec infiltration active, toiture en fin de vie avancée, " +
      "panneau électrique défaillant) " +
      "— Conforme AIBQ Art. 1 (défaut important) / OAHI SOP 2.2B (significantly deficient).",
    descriptionEn:
      "Significant defect likely to substantially reduce the use, enjoyment or value of the " +
      "building, or whose deterioration may present a future risk. " +
      "(E.g.: cracked foundation with active seepage, advanced roof end-of-life, " +
      "defective electrical panel) " +
      "— Per AIBQ Art. 1 / OAHI SOP 2.2B (significantly deficient).",
    colorHex: "#C2410C",
    normRef: "AIBQ Art. 1 + Art. 14.6.3 / OAHI SOP 2.2B",
    actionFr: "Réparation recommandée avant ou peu après la transaction.",
    actionEn: "Repair recommended before or shortly after transaction.",
  },
  {
    level: "moderate",
    labelFr: "Modéré",
    labelEn: "Moderate deficiency",
    descriptionFr:
      "Défaut ou dégradation dont l'impact est limité à court terme mais qui nécessite " +
      "un suivi ou une réparation planifiée. Peut évoluer vers un défaut majeur sans " +
      "intervention. (Ex. : peinture extérieure écaillée, joint de calfeutrage détérioré, " +
      "drain de gouttière mal dirigé) " +
      "— Pratique AIBQ / OAHI recommandée.",
    descriptionEn:
      "Defect or deterioration with limited short-term impact but requiring monitoring or " +
      "planned repair. May progress to a major deficiency without intervention. " +
      "(E.g.: peeling exterior paint, deteriorated caulking, misdirected downspout) " +
      "— AIBQ / OAHI recommended practice.",
    colorHex: "#B45309",
    normRef: "AIBQ Norme de pratique / OAHI SOP — pratique recommandée",
    actionFr: "Suivi recommandé; réparation à planifier.",
    actionEn: "Monitoring recommended; plan repair.",
  },
  {
    level: "minor",
    labelFr: "Mineur",
    labelEn: "Minor deficiency",
    descriptionFr:
      "Défaut d'entretien courant ou usure normale sans incidence sur la sécurité ni sur " +
      "l'usage du bâtiment. (Ex. : petite fissure de peinture, joint manquant, " +
      "poignée de porte lâche) " +
      "— Pratique AIBQ / OAHI : information au client, pas d'urgence.",
    descriptionEn:
      "Routine maintenance defect or normal wear with no safety or functional impact. " +
      "(E.g.: hairline paint crack, missing caulk, loose door handle) " +
      "— AIBQ / OAHI practice: inform client, no urgency.",
    colorHex: "#4B5563",
    normRef: "AIBQ Norme de pratique / OAHI SOP — pratique recommandée",
    actionFr: "Entretien courant recommandé.",
    actionEn: "Routine maintenance recommended.",
  },
];

// ---------------------------------------------------------------------------
// Helper utilities
// ---------------------------------------------------------------------------

/** Retourne la liste des sections obligatoires pour une province donnée. */
export function getMandatorySections(province: ProvinceCode): RequiredSection[] {
  return (REQUIRED_SECTIONS[province] ?? REQUIRED_SECTIONS.CA).filter((s) => s.mandatory);
}

/** Retourne les clauses légales obligatoires pour une province. */
export function getMandatoryLegalClauses(province: ProvinceCode): LegalClause[] {
  return (LEGAL_CLAUSES[province] ?? LEGAL_CLAUSES.CA).filter((c) => c.mandatory);
}

/** Retourne les clauses d'une catégorie donnée pour une province. */
export function getLegalClausesByCategory(
  province: ProvinceCode,
  category: LegalClauseCategory,
): LegalClause[] {
  return (LEGAL_CLAUSES[province] ?? LEGAL_CLAUSES.CA).filter((c) => c.category === category);
}

/** Retourne la définition de sévérité pour un niveau. */
export function getSeverityDefinition(level: SeverityLevel): SeverityDefinition | undefined {
  return SEVERITY_DEFINITIONS.find((d) => d.level === level);
}

/** Convertit un ProvinceCode vers la ComplianceJurisdiction utilisée dans inspectionCoverPayload. */
export function provinceCodeToJurisdiction(
  code: ProvinceCode,
): `ca_${Lowercase<ProvinceCode>}` | "ca_general" {
  if (code === "CA") return "ca_general";
  return `ca_${code.toLowerCase() as Lowercase<Exclude<ProvinceCode, "CA">>}`;
}
