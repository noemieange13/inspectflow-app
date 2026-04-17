/**
 * Résultat typé pour les appels IA (OpenAI, etc.) — évite d’empiler `null` + raisons implicites.
 */
export type AiFailureReason = "aborted" | "too_large" | "timeout" | "error";

export type AiResult<T> =
  | { ok: true; data: T }
  | { ok: false; reason: AiFailureReason };
