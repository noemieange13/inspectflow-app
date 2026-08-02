/**
 * Auth fields for `/api/process-notes` multipart requests.
 * When `reports.access_token` is set, the API rejects requests without a matching token.
 */
export function appendProcessNotesAuthFields(
  form: FormData,
  args: {
    reportId: string;
    language: "fr" | "en";
    accessToken?: string | null;
  },
): void {
  form.append("report_id", args.reportId);
  form.append("language", args.language);
  const token = typeof args.accessToken === "string" ? args.accessToken.trim() : "";
  if (token) form.append("access_token", token);
}
