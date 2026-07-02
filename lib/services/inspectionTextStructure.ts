import type { InspectionSeverity } from "@/lib/types/inspection";

function stripJsonFences(raw: string): string {
  const t = raw.trim();
  const m = /^```(?:json)?\s*([\s\S]*?)```$/i.exec(t);
  return m ? m[1].trim() : t;
}

function coerceSeverity(v: unknown, fallback: InspectionSeverity): InspectionSeverity {
  const s = typeof v === "string" ? v.trim().toLowerCase() : "";
  if (s === "low" || s === "medium" || s === "high") return s;
  return fallback;
}

function maxSeverity(a: InspectionSeverity, b: InspectionSeverity): InspectionSeverity {
  const rank = { low: 0, medium: 1, high: 2 };
  return rank[a] >= rank[b] ? a : b;
}

/** Repli local quand OpenRouter est indisponible — parse la sortie JSON de Gemini vision. */
export function structureFromGeminiVisionText(rawText: string): Record<string, unknown> {
  const cleaned = stripJsonFences(rawText);
  let parsed: unknown;
  try {
    parsed = JSON.parse(cleaned) as unknown;
  } catch {
    throw new Error("Gemini JSON parse failed");
  }

  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("Gemini JSON invalid");
  }

  const o = parsed as Record<string, unknown>;

  if (typeof o.summary === "string" && Array.isArray(o.issues)) {
    return o;
  }

  const summary =
    typeof o.conditionGenerale === "string" && o.conditionGenerale.trim()
      ? o.conditionGenerale.trim()
      : "Analyse complétée";

  const issues: Array<Record<string, unknown>> = [];
  if (Array.isArray(o.sections)) {
    for (const section of o.sections) {
      if (!section || typeof section !== "object") continue;
      const sec = section as Record<string, unknown>;
      const type =
        typeof sec.titre === "string" && sec.titre.trim() ? sec.titre.trim() : "constat";
      if (!Array.isArray(sec.items)) continue;
      for (const item of sec.items) {
        if (!item || typeof item !== "object") continue;
        const it = item as Record<string, unknown>;
        const description =
          typeof it.description === "string" ? it.description.trim() : "";
        if (!description) continue;
        const severity = coerceSeverity(it.severite ?? it.severity, "medium");
        issues.push({
          type,
          severity,
          description,
          recommendation: "À préciser sur place.",
        });
      }
    }
  }

  let severity: InspectionSeverity = "medium";
  for (const issue of issues) {
    severity = maxSeverity(severity, coerceSeverity(issue.severity, "medium"));
  }

  return {
    summary,
    severity: issues.length > 0 ? severity : "low",
    issues,
    nextStep: "Inspection supplémentaire recommandée",
    urgency: issues.length > 0 ? severity : "low",
    estimatedCost: "",
  };
}
