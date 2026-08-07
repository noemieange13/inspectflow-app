import type {
  InspectionIssue,
  InspectionResult,
  InspectionSeverity,
} from "@/lib/types/inspection";

import { analyzeImagesWithGemini } from "./gemini";
import { structureInspectionResultFromModelText } from "./openrouter";

const INVALID_IMAGE_FORMAT = "INVALID_IMAGE_FORMAT";

export function validateImageInputs(images: string[]): void {
  if (!Array.isArray(images) || images.length === 0) {
    throw new Error(INVALID_IMAGE_FORMAT);
  }
  for (const img of images) {
    if (typeof img !== "string") {
      throw new Error(INVALID_IMAGE_FORMAT);
    }
    const t = img.trim();
    if (!t) {
      throw new Error(INVALID_IMAGE_FORMAT);
    }
    if (t.startsWith("blob:") || t.startsWith("file:")) {
      throw new Error(INVALID_IMAGE_FORMAT);
    }
    if (t.startsWith("data:")) {
      if (!/^data:image\//i.test(t) || !/;base64,/i.test(t)) {
        throw new Error(INVALID_IMAGE_FORMAT);
      }
      continue;
    }
    if (t.startsWith("https://")) {
      continue;
    }
    if (t.startsWith("http://")) {
      throw new Error(INVALID_IMAGE_FORMAT);
    }
    const b64 = t.replace(/\s/g, "");
    if (b64.length < 12 || !/^[A-Za-z0-9+/]+=*$/.test(b64)) {
      throw new Error(INVALID_IMAGE_FORMAT);
    }
  }
}

function coerceSeverity(v: unknown, fallback: InspectionSeverity): InspectionSeverity {
  if (v === "low" || v === "medium" || v === "high") return v;
  return fallback;
}

function normalizeIssues(raw: unknown): InspectionIssue[] {
  if (!Array.isArray(raw)) return [];
  const out: InspectionIssue[] = [];
  for (const x of raw) {
    if (!x || typeof x !== "object") continue;
    const o = x as Record<string, unknown>;
    const description = typeof o.description === "string" ? o.description.trim() : "";
    if (!description) continue;
    const recommendation =
      typeof o.recommendation === "string" && o.recommendation.trim()
        ? o.recommendation.trim()
        : "À préciser sur place.";
    const type = typeof o.type === "string" && o.type.trim() ? o.type.trim() : "constat";
    out.push({
      type,
      severity: coerceSeverity(o.severity, "medium"),
      description,
      recommendation,
    });
  }
  return out;
}

function maxSeverity(a: InspectionSeverity, b: InspectionSeverity): InspectionSeverity {
  const rank = { low: 0, medium: 1, high: 2 };
  return rank[a] >= rank[b] ? a : b;
}

function aggregateSeverity(issues: InspectionIssue[]): InspectionSeverity {
  if (issues.length === 0) return "medium";
  return issues.reduce((acc, i) => maxSeverity(acc, i.severity), "low" as InspectionSeverity);
}

/** Normalise une réponse IA partielle vers le contrat `InspectionResult` (ok: true). */
export function normalizeResult(raw: Record<string, unknown>): InspectionResult {
  const issues = normalizeIssues(raw.issues);
  const severity = coerceSeverity(raw.severity, aggregateSeverity(issues));
  const summary =
    typeof raw.summary === "string" && raw.summary.trim()
      ? raw.summary.trim()
      : "Analyse complétée";
  const nextStep =
    typeof raw.nextStep === "string" && raw.nextStep.trim()
      ? raw.nextStep.trim()
      : "Inspection supplémentaire recommandée";
  const urgency = coerceSeverity(raw.urgency ?? raw.severity, severity);
  const estimatedCost =
    typeof raw.estimatedCost === "string" && raw.estimatedCost.trim()
      ? raw.estimatedCost.trim()
      : undefined;
  return {
    ok: true,
    summary,
    severity,
    issues,
    nextStep,
    urgency,
    estimatedCost,
  };
}

export function handleError(_error: unknown): InspectionResult {
  return {
    ok: false,
    summary: "",
    severity: "low",
    issues: [],
    nextStep: "",
    urgency: "low",
    error: "AI_UNAVAILABLE",
    hint: "Réessayer dans quelques minutes",
  };
}

export function serverErrorResult(): InspectionResult {
  return {
    ok: false,
    summary: "",
    severity: "low",
    issues: [],
    nextStep: "",
    urgency: "low",
    error: "SERVER_ERROR",
    hint: "Erreur interne",
  };
}

/** Corps POST non JSON (ou coupé) — préférer HTTP 400 côté route. */
export function malformedJsonResult(): InspectionResult {
  return {
    ok: false,
    summary: "",
    severity: "low",
    issues: [],
    nextStep: "",
    urgency: "low",
    error: "BAD_JSON",
    hint: "Corps de requête JSON invalide.",
  };
}

function resultConfigMissing(): InspectionResult {
  return {
    ok: false,
    summary: "",
    severity: "low",
    issues: [],
    nextStep: "",
    urgency: "low",
    error: "CONFIG_MISSING",
    hint: "Clés API manquantes",
  };
}

function resultInvalidImages(): InspectionResult {
  return {
    ok: false,
    summary: "",
    severity: "low",
    issues: [],
    nextStep: "",
    urgency: "low",
    error: INVALID_IMAGE_FORMAT,
    hint: "Utilise base64, data URL image ou URL https (pas blob: ni fichier brut).",
  };
}

function resultEmptyVision(): InspectionResult {
  return {
    ok: false,
    summary: "",
    severity: "low",
    issues: [],
    nextStep: "",
    urgency: "low",
    error: "EMPTY_VISION",
    hint: "L'analyse visuelle n'a produit aucun texte. Réessaie avec d'autres photos.",
  };
}

function modelPayloadToRecord(data: unknown): Record<string, unknown> {
  if (data && typeof data === "object" && !Array.isArray(data)) {
    return data as Record<string, unknown>;
  }
  return {};
}

/**
 * Fail-closed gate: empty/whitespace Gemini text must not reach OpenRouter,
 * which would invent an inspection JSON from a blank prompt.
 */
export function isUsableVisionText(raw: string): boolean {
  return typeof raw === "string" && raw.trim().length > 0;
}

/**
 * Pipeline unique inspection : Gemini (vision) → OpenRouter (JSON contrat) → `InspectionResult`.
 */
export async function analyzeInspection(images: string[]): Promise<InspectionResult> {
  try {
    validateImageInputs(images);
  } catch {
    return resultInvalidImages();
  }

  if (!process.env.GEMINI_API_KEY?.trim() || !process.env.OPENROUTER_API_KEY?.trim()) {
    return resultConfigMissing();
  }

  try {
    const raw = await analyzeImagesWithGemini(images);
    if (!isUsableVisionText(raw)) {
      console.error("[analyzeInspection] empty Gemini vision text");
      return resultEmptyVision();
    }
    const structured = await structureInspectionResultFromModelText(raw);
    const rec = modelPayloadToRecord(structured);
    return normalizeResult(rec);
  } catch (e) {
    console.error("[analyzeInspection]", e);
    return handleError(e);
  }
}
