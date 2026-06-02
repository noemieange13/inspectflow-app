import { POST as createReportPost } from "@/app/api/create-report/route";

/**
 * Legacy endpoint kept as a compatibility alias only.
 *
 * Report rows must go through the guarded create-report path so they receive
 * ownership, inspection/job linkage, and an access token.
 */
export async function POST(request: Request) {
  return createReportPost(request);
}
