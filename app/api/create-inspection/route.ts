import { NextRequest, NextResponse } from "next/server";
import { buildCreateReportPayloadFromInspectionRequest } from "@/lib/createInspectionRequest";
import { invokeCreateReport } from "@/lib/invokeCreateReport";

export async function POST(request: NextRequest) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { success: false, error: "Invalid JSON body" },
      { status: 400 },
    );
  }

  const built = buildCreateReportPayloadFromInspectionRequest(body);
  if (!built.ok) {
    return NextResponse.json(
      { success: false, error: built.error },
      { status: built.status },
    );
  }

  try {
    const res = await invokeCreateReport(built.payload);
    const text = await res.text();
    let parsed: unknown = text;
    try {
      parsed = JSON.parse(text) as unknown;
    } catch {
      /* non-JSON */
    }

    if (!res.ok) {
      return NextResponse.json(
        {
          success: false,
          error: "create-report returned an error",
          status: res.status,
          body: parsed,
        },
        { status: 502 },
      );
    }

    return NextResponse.json(
      typeof parsed === "object" && parsed !== null
        ? { success: true, ...parsed }
        : { success: true, raw: parsed },
    );
  } catch (error) {
    console.error("Erreur API création inspection:", error);
    const message = error instanceof Error ? error.message : String(error);
    return NextResponse.json(
      { success: false, error: message },
      { status: 500 },
    );
  }
}
