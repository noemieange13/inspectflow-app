import { headers } from "next/headers";

import { ReportPdfRedirect } from "@/components/ReportPdfRedirect";
import { runFirstViewSideEffects } from "@/lib/firstViewEmail";
import {
  createSignedUrlForReportPdf,
  DEFAULT_SIGNED_URL_TTL_SEC,
} from "@/lib/rapportsPdfStorage";
import {
  parseClientEmailFromRow,
  parseFirstViewNotifiedFromRow,
} from "@/lib/reportRowParse";
import { createServerClient } from "@/lib/supabaseServer";

function pickSearchParam(
  value: string | string[] | undefined,
): string | undefined {
  if (typeof value === "string") return value.trim();
  if (Array.isArray(value) && value[0]) return value[0].trim();
  return undefined;
}

function normalizeTokenFromUrl(raw: string): string {
  try {
    return decodeURIComponent(raw || "").trim();
  } catch {
    return (raw || "").trim();
  }
}

export default async function Page({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const { id } = await params;
  const cleanId = id?.trim();
  const sp = await searchParams;
  const token = pickSearchParam(sp.token);

  if (!cleanId || !token) {
    return <div className="p-6">Accès invalide</div>;
  }

  let supabase;
  try {
    supabase = await createServerClient();
  } catch (e) {
    console.error("SUPABASE_CLIENT:", e);
    return <div className="p-6">Configuration Supabase manquante</div>;
  }

  const { data, error } = await supabase
    .from("reports")
    .select("*")
    .eq("id", cleanId)
    .maybeSingle();

  if (error) {
    console.error("SUPABASE ERROR reports select:", {
      message: error.message,
      code: error.code,
      details: error.details,
      hint: error.hint,
    });
    return <div className="p-6">Erreur serveur</div>;
  }

  if (!data || !data.id) {
    return <div className="p-6">Accès invalide</div>;
  }

  const row = data as Record<string, unknown>;

  const rawAccess = row.access_token;
  const dbNorm = typeof rawAccess === "string" ? rawAccess.trim() : "";
  const urlNorm = normalizeTokenFromUrl(token);

  if (typeof rawAccess !== "string" || !dbNorm || dbNorm !== urlNorm) {
    return <div className="p-6">Accès refusé</div>;
  }

  if (
    row.token_expires_at != null &&
    String(row.token_expires_at) !== "" &&
    new Date(String(row.token_expires_at)) < new Date()
  ) {
    return (
      <div className="p-6">Ce lien a expiré. Demandez un nouveau lien à l’organisme.</div>
    );
  }

  const pdfResult = await createSignedUrlForReportPdf(
    supabase,
    row,
    DEFAULT_SIGNED_URL_TTL_SEC,
  );

  if ("error" in pdfResult) {
    if (pdfResult.error === "no_pdf") {
      return <div className="p-6">PDF indisponible</div>;
    }
    console.error("SIGNED URL ERROR:", pdfResult.log);
    return <div className="p-6">Erreur accès PDF</div>;
  }

  const finalUrl = pdfResult.signedUrl;

  const h = await headers();
  const ip =
    h.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    h.get("x-real-ip") ||
    null;
  const userAgent = h.get("user-agent");

  const { error: viewError } = await supabase.from("report_views").insert({
    report_id: data.id,
    ip,
    user_agent: userAgent,
  });

  if (viewError) {
    console.error("REPORT_VIEW_TRACK:", viewError);
  }

  try {
    await runFirstViewSideEffects({
      supabase,
      reportId: data.id,
      clientEmail: parseClientEmailFromRow(row),
      firstViewNotified: parseFirstViewNotifiedFromRow(row),
      viewInsertSucceeded: !viewError,
    });
  } catch (e) {
    console.error("FIRST_VIEW_SIDE_EFFECTS:", e);
  }

  return (
    <div className="flex h-screen w-full flex-col">
      <div className="flex shrink-0 items-center gap-4 border-b border-foreground/10 bg-background px-4 py-2 shadow-sm">
        <a
          href={finalUrl}
          download
          target="_blank"
          rel="noopener noreferrer"
          className="text-sm underline"
        >
          Télécharger le PDF
        </a>
      </div>
      <div className="relative min-h-0 flex-1">
        <ReportPdfRedirect
          url={finalUrl}
          reportId={data.id}
          linkToken={urlNorm}
        />
      </div>
      <p className="shrink-0 px-4 py-2 text-center text-sm text-foreground/70">
        Le PDF s’ouvre dans cet onglet. Sinon utilisez le lien ci-dessus.
      </p>
    </div>
  );
}
