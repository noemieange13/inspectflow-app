import { NextResponse } from "next/server";

import {
  compareSteveReports,
  type LegacySteveReportInput,
} from "@/lib/reportComparison";
import {
  buildProfessionalReportTemplate,
  renderProfessionalReportHtml,
} from "@/lib/report_template_engine";

export const runtime = "nodejs";

function devOnly(): NextResponse | null {
  if (process.env.NODE_ENV !== "development") {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  return null;
}

export async function POST(req: Request): Promise<Response> {
  const blocked = devOnly();
  if (blocked) return blocked;

  let body: {
    payload?: Record<string, unknown>;
    legacy?: LegacySteveReportInput;
    locale?: "fr-CA" | "en-CA";
  };

  try {
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const payload = body.payload;
  if (!payload || typeof payload !== "object") {
    return NextResponse.json({ error: "payload required" }, { status: 400 });
  }

  const locale = body.locale ?? "fr-CA";
  const template = buildProfessionalReportTemplate(payload, { locale });
  if (!template) {
    return NextResponse.json({ error: "Could not build professional template" }, { status: 422 });
  }

  const html = renderProfessionalReportHtml(template, locale);
  const score = compareSteveReports(body.legacy ?? {}, { payload, html });

  return NextResponse.json({
    score,
    html_length: html.length,
    locale,
  });
}
