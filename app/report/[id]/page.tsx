import { headers } from "next/headers";

import { ReportPdfRedirect } from "@/components/ReportPdfRedirect";
import { runFirstViewSideEffects } from "@/lib/firstViewEmail";
import { createServerClient } from "@/lib/supabaseServer";

function pickSearchParam(
  value: string | string[] | undefined,
): string | undefined {
  if (typeof value === "string") return value.trim();
  if (Array.isArray(value) && value[0]) return value[0].trim();
  return undefined;
}

/** URL query + DB : même logique d’encodage/espaces peut diverger sans être « visibles ». */
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
    return <div>Accès invalide</div>;
  }

  let supabase;
  try {
    supabase = await createServerClient();
  } catch (e) {
    console.error("SUPABASE_CLIENT:", e);
    return <div>Configuration Supabase manquante</div>;
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
    return <div>Erreur serveur</div>;
  }

  if (!data || !data.id) {
    return <div>Accès invalide</div>;
  }

  const row = data as Record<string, unknown>;

  const rawAccess = row.access_token;
  const dbNorm =
    typeof rawAccess === "string" ? rawAccess.trim() : "";
  const urlNorm = normalizeTokenFromUrl(token);

  if (
    typeof rawAccess !== "string" ||
    !dbNorm ||
    dbNorm !== urlNorm
  ) {
    return <div>Accès refusé</div>;
  }

  if (
    row.token_expires_at != null &&
    String(row.token_expires_at) !== "" &&
    new Date(String(row.token_expires_at)) < new Date()
  ) {
    return <div>Ce lien a expiré. Demandez un nouveau lien à l’organisme.</div>;
  }

  /** Chemin dans le bucket Supabase (ex. user_id/report_id.pdf) — prioritaire si renseigné. */
  const pdfPath =
    typeof row.pdf_path === "string" && row.pdf_path.trim()
      ? row.pdf_path.trim()
      : "";

  const pdfSourceRaw =
    (typeof row.pdf_url === "string" && row.pdf_url.trim()) ||
    (typeof row.file_url === "string" && row.file_url.trim()) ||
    "";

  if (!pdfPath && !pdfSourceRaw) {
    return <div>PDF indisponible</div>;
  }

  let finalUrl: string;

  if (pdfPath) {
    const { data: signed, error: signError } = await supabase.storage
      .from("rapports-pdf")
      .createSignedUrl(pdfPath, 3600);

    if (signError || !signed?.signedUrl) {
      console.error("SIGNED URL ERROR (pdf_path):", signError);
      return <div>Erreur accès PDF</div>;
    }

    finalUrl = signed.signedUrl;
  } else {
    finalUrl = pdfSourceRaw;

    const isFullUrl = pdfSourceRaw.startsWith("http");

    if (!isFullUrl) {
      const { data: signed, error: signError } = await supabase.storage
        .from("rapports-pdf")
        .createSignedUrl(pdfSourceRaw, 3600);

      if (signError || !signed?.signedUrl) {
        console.error("SIGNED URL ERROR:", signError);
        return <div>Erreur accès PDF</div>;
      }

      finalUrl = signed.signedUrl;
    }
  }

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
      clientEmail: undefined,
      firstViewNotified: false,
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
        <ReportPdfRedirect url={finalUrl} />
      </div>
      <p className="shrink-0 px-4 py-2 text-center text-sm text-foreground/70">
        Le PDF s’ouvre dans cet onglet. Sinon utilisez le lien ci-dessus.
      </p>
    </div>
  );
}
