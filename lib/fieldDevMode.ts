/**
 * Phase 8F — dev/admin-only field validation tooling.
 * Never enabled for production end users unless explicitly opted in via env.
 */
export function isFieldValidationMode(): boolean {
  if (process.env.NODE_ENV === "development") return true;
  const flag = process.env.NEXT_PUBLIC_INSPECTFLOW_FIELD_TEST?.trim().toLowerCase();
  return flag === "1" || flag === "true" || flag === "yes";
}
