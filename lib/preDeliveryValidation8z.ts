/**
 * Phase 8Z — Validation terrain avant PDF (read-only, couche gate Steve).
 * Avertissements souples ; blocage uniquement si client OU adresse absent.
 */

import { readReportComplianceFromPayload } from "@/lib/legalClauses/qc/version";
import { hasReportProfessionalSnapshot } from "@/lib/inspectorProfile";
import { orderedInspectionSystems } from "@/lib/inspectionKnowledgeBase";
import { resolveReportConclusionText } from "@/lib/reportConclusionEngine";
import { validatePhotoFindingAssociations } from "@/lib/photoFindingValidation";
import type { ReportLocale } from "@/lib/reportLocale";
import { resolvePayloadReportLocale } from "@/lib/reportLanguage";

export type PreDeliveryCheck8z = {
  id: string;
  label_fr: string;
  label_en: string;
  ok: boolean;
  blocking: boolean;
};

export type PreDeliveryValidation8z = {
  checks: PreDeliveryCheck8z[];
  warnings: string[];
  blockers: string[];
  canProceed: boolean;
  verifyBeforeSend: boolean;
};

function readCover(payload: Record<string, unknown>): Record<string, unknown> {
  const cover = payload.cover_v1;
  return cover && typeof cover === "object" && !Array.isArray(cover)
    ? (cover as Record<string, unknown>)
    : {};
}

function readClientName(cover: Record<string, unknown>): string {
  const propriete = cover.propriete;
  if (propriete && typeof propriete === "object") {
    const name = (propriete as Record<string, unknown>).client_nom;
    if (typeof name === "string" && name.trim()) return name.trim();
  }
  if (typeof cover.client_name === "string" && cover.client_name.trim()) {
    return cover.client_name.trim();
  }
  if (typeof cover.requerants === "string" && cover.requerants.trim()) {
    return cover.requerants.trim();
  }
  return "";
}

function readAddress(cover: Record<string, unknown>): string {
  if (typeof cover.address === "string" && cover.address.trim()) return cover.address.trim();
  const propriete = cover.propriete;
  if (propriete && typeof propriete === "object") {
    const adresse = (propriete as Record<string, unknown>).adresse;
    if (typeof adresse === "string" && adresse.trim()) return adresse.trim();
  }
  return "";
}

function readInspectionDate(cover: Record<string, unknown>): string {
  return typeof cover.date_heure_affichage === "string" ? cover.date_heure_affichage.trim() : "";
}

function majorSystemsSeen(html: string): boolean {
  const required = ["structure", "electricite", "interieur"];
  return required.every((id) => html.includes(`data-system-id="${id}"`));
}

export function validatePreDelivery8z(input: {
  payload: Record<string, unknown>;
  photoCount: number;
  html?: string | null;
  language?: "fr" | "en";
}): PreDeliveryValidation8z {
  const lang = input.language ?? "fr";
  const cover = readCover(input.payload);
  const client = readClientName(cover);
  const address = readAddress(cover);
  const date = readInspectionDate(cover);
  const locale = resolvePayloadReportLocale(input.payload) as ReportLocale;
  const html = input.html ?? "";

  const conclusion = resolveReportConclusionText(input.payload, locale).trim();
  const compliance = readReportComplianceFromPayload(input.payload);
  const profileOk = hasReportProfessionalSnapshot(input.payload);
  const photoValidation = validatePhotoFindingAssociations({
    payload: input.payload,
    language: lang,
  });

  const checks: PreDeliveryCheck8z[] = [
    {
      id: "client",
      label_fr: "Client identifié",
      label_en: "Client identified",
      ok: client.length > 0,
      blocking: true,
    },
    {
      id: "address",
      label_fr: "Adresse présente",
      label_en: "Address present",
      ok: address.length > 0,
      blocking: true,
    },
    {
      id: "date",
      label_fr: "Date d'inspection",
      label_en: "Inspection date",
      ok: date.length > 0,
      blocking: false,
    },
    {
      id: "photos",
      label_fr: "Photos importées",
      label_en: "Photos imported",
      ok: input.photoCount > 0,
      blocking: false,
    },
    {
      id: "systems",
      label_fr: "Sections majeures couvertes",
      label_en: "Major sections covered",
      ok: html ? majorSystemsSeen(html) : orderedInspectionSystems().length > 0,
      blocking: false,
    },
    {
      id: "conclusion",
      label_fr: "Conclusion générée",
      label_en: "Conclusion generated",
      ok: conclusion.length > 0,
      blocking: false,
    },
    {
      id: "attestation",
      label_fr: "Attestation inspecteur",
      label_en: "Inspector attestation",
      ok: profileOk && html.includes('data-block="attestation"'),
      blocking: false,
    },
    {
      id: "compliance",
      label_fr: "Clauses versionnées",
      label_en: "Versioned clauses",
      ok: compliance?.locked === true,
      blocking: false,
    },
  ];

  const blockers = checks.filter((c) => c.blocking && !c.ok).map((c) => (lang === "en" ? c.label_en : c.label_fr));
  const warnings = checks
    .filter((c) => !c.blocking && !c.ok)
    .map((c) => (lang === "en" ? c.label_en : c.label_fr));

  for (const item of photoValidation.items) {
    warnings.push(lang === "en" ? item.message_en : item.message_fr);
  }

  return {
    checks,
    warnings,
    blockers,
    canProceed: blockers.length === 0,
    verifyBeforeSend: warnings.length > 0 || blockers.length > 0,
  };
}

export function preDeliveryVerifyTitle(language: "fr" | "en"): string {
  return language === "en" ? "Review before sending" : "À vérifier avant envoi";
}
