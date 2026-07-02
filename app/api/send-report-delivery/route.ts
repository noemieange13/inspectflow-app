import {
  humanDeliveryError,
  prepareSendReportPayload,
  sendReportToClient,
} from "@/lib/reportDelivery";
import { createServiceRoleClient } from "@/lib/supabaseServer";

export async function POST(req: Request) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return Response.json(
      { success: false, error: humanDeliveryError("send_failed") },
      { status: 400 },
    );
  }

  const prepared = prepareSendReportPayload(body);
  if ("error" in prepared) {
    return Response.json(
      { success: false, error: humanDeliveryError("send_failed"), code: prepared.error },
      { status: 400 },
    );
  }

  const origin =
    req.headers.get("origin")?.replace(/\/$/, "") ??
    process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "") ??
    "http://localhost:3000";

  const supabase = await createServiceRoleClient();
  const result = await sendReportToClient({
    req,
    supabase,
    payload: prepared,
    origin,
  });

  if (!result.ok) {
    return Response.json(
      { success: false, error: result.humanMessage, code: result.code },
      { status: result.status },
    );
  }

  return Response.json({
    success: true,
    sent: result.sent,
    recorded: result.recorded,
  });
}
