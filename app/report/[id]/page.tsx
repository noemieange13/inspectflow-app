import { headers } from "next/headers";

import { runFirstViewSideEffects } from "@/lib/firstViewEmail";
import { createServerClient } from "@/lib/supabaseServer";

function pickSearchParam(
  value: string | string[] | undefined,
): string | undefined {
  if (typeof value === "string") return value.trim();
  if (Array.isArray(value) && value[0]) return value[0].trim();
  return undefined;
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

  const supabase = await createServerClient();

  const { data, error } = await supabase
    .from("reports")
    .select(
      "id, pdf_url, access_token, token_expires_at, client_email, first_view_notified",
    )
    .eq("id", cleanId)
    .maybeSingle();

  if (error) {
    console.error("SUPABASE ERROR:", error);
    return <div>Erreur serveur</div>;
  }

  if (!data || !data.id) {
    return <div>Accès invalide</div>;
  }

  const now = new Date();

  if (
    !data.access_token ||
    data.access_token !== token ||
    !data.token_expires_at ||
    new Date(data.token_expires_at) < now
  ) {
    return <div>Accès refusé</div>;
  }

  if (!data.pdf_url) {
    return <div>PDF indisponible</div>;
  }

  let finalUrl = data.pdf_url;

  const isFullUrl = data.pdf_url.startsWith("http");

  if (!isFullUrl) {
    const { data: signed, error: signError } = await supabase.storage
      .from("rapports-pdf")
      .createSignedUrl(data.pdf_url, 3600);

    if (signError || !signed?.signedUrl) {
      console.error("SIGNED URL ERROR:", signError);
      return <div>Erreur accès PDF</div>;
    }

    finalUrl = signed.signedUrl;
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

  await runFirstViewSideEffects({
    supabase,
    reportId: data.id,
    clientEmail: data.client_email,
    firstViewNotified: data.first_view_notified ?? false,
    viewInsertSucceeded: !viewError,
  });

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
        <iframe
          src={finalUrl}
          className="h-full w-full"
          title="Rapport PDF"
        />
      </div>
      <p className="shrink-0 px-4 py-2 text-center text-sm text-foreground/70">
        Si le PDF ne s’affiche pas,{" "}
        <a
          href={finalUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="underline"
        >
          ouvrez-le dans un nouvel onglet
        </a>
        .
      </p>
    </div>
  );
}
