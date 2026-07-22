import { POST as createReportPost } from "@/app/api/create-report/route";

/**
 * Legacy compatibility alias.
 *
 * Report rows must use the guarded writer so they receive ownership,
 * inspection/job linkage, and an access token.
 */
export async function POST(request: Request) {
  return createReportPost(request);
}
