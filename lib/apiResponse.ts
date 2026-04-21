export function apiResponse({
  data = [],
  error = null,
  meta = {},
}: {
  data?: unknown[];
  error?: string | null;
  meta?: Record<string, unknown>;
}) {
  return Response.json({
    data: Array.isArray(data) ? data : [],
    error,
    meta
  })
}