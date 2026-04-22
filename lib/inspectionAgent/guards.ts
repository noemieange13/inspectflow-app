/**
 * Garde-fous agent : pas d’auto-application si gravité haute et confiance insuffisante.
 */
export function agentSafeToAutoApply(input: {
  severity: string | undefined;
  confidence: number;
}): boolean {
  const raw = (input.severity ?? "").trim().toLowerCase();
  if (!raw) return true;
  const isHigh =
    raw === "high" ||
    raw.includes("élev") ||
    raw.includes("eleve") ||
    raw.includes("crit") ||
    raw.includes("majeur");
  if (isHigh && input.confidence < 0.9) return false;
  return true;
}
