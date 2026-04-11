"use client";

import { useCallback, useEffect, useState } from "react";

import { fetchRegeneratedPdfSignedUrl } from "@/lib/regenerateSignedUrlClient";

type Props = {
  url: string;
  /** Si renseignés, affiche un bouton pour redemander une signed URL (onglet longue durée). */
  reportId?: string;
  linkToken?: string;
};

/**
 * Redirige l’onglet courant vers l’URL du PDF (signed ou publique).
 * Repli : lien cliquable ; option « Rafraîchir le lien » si le jeton viewer est connu.
 */
export function ReportPdfRedirect({ url, reportId, linkToken }: Props) {
  const [href, setHref] = useState(url);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    window.location.href = href;
  }, [href]);

  const onRefresh = useCallback(async () => {
    if (!reportId || !linkToken) return;
    setBusy(true);
    setErr(null);
    try {
      const { pdf_signed_url } = await fetchRegeneratedPdfSignedUrl({
        reportId,
        token: linkToken,
      });
      setHref(pdf_signed_url);
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }, [reportId, linkToken]);

  return (
    <div className="flex min-h-[50vh] flex-col items-center justify-center gap-4 p-8 text-center">
      <p className="text-sm text-foreground/80">Ouverture du PDF…</p>
      <a
        href={href}
        className="text-sm font-medium underline"
        rel="noopener noreferrer"
      >
        Cliquez ici si le PDF ne s’ouvre pas
      </a>
      {reportId && linkToken ? (
        <button
          type="button"
          onClick={onRefresh}
          disabled={busy}
          className="rounded border border-foreground/20 px-3 py-2 text-sm disabled:opacity-50"
        >
          {busy ? "…" : "Rafraîchir le lien PDF"}
        </button>
      ) : null}
      {err ? (
        <p className="max-w-md text-xs text-red-600 dark:text-red-400">{err}</p>
      ) : null}
    </div>
  );
}
