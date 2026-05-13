import { NextResponse } from "next/server";

export async function POST() {
  return NextResponse.json(
    {
      success: false,
      error:
        "Deprecated endpoint: create reports through /api/create-report with a valid user_id and inspection_id or job_id.",
    },
    { status: 410 },
  );
}
