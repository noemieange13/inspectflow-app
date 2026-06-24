const FORM_TOKEN_FIELDS = ["access_token", "report_token", "token"] as const;
const HEADER_TOKEN_FIELDS = ["x-report-access-token", "x-report-token"] as const;

function firstStringToken(values: Array<FormDataEntryValue | string | null>): string {
  for (const value of values) {
    if (typeof value !== "string") continue;
    const token = value.trim();
    if (token) return token;
  }
  return "";
}

function sameOriginReportRefererToken(req: Request, reportId: string): string {
  const referer = req.headers.get("referer");
  const host = req.headers.get("host")?.trim();
  if (!referer || !host || !reportId.trim()) return "";

  try {
    const url = new URL(referer);
    if (url.host !== host) return "";

    const pathname = decodeURIComponent(url.pathname).replace(/\/+$/, "");
    const expectedPath = `/report/${reportId.trim()}`;
    if (pathname !== expectedPath && !pathname.startsWith(`${expectedPath}/`)) {
      return "";
    }

    return url.searchParams.get("token")?.trim() ?? "";
  } catch {
    return "";
  }
}

export function extractReportUploadAccessToken(
  req: Request,
  formData: FormData,
  reportId: string,
): string {
  const formToken = firstStringToken(
    FORM_TOKEN_FIELDS.map((field) => formData.get(field)),
  );
  if (formToken) return formToken;

  const headerToken = firstStringToken(
    HEADER_TOKEN_FIELDS.map((field) => req.headers.get(field)),
  );
  if (headerToken) return headerToken;

  return sameOriginReportRefererToken(req, reportId);
}
