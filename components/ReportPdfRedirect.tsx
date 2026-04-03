"use client";

import { useEffect } from "react";

/**
 * Redirige l’onglet courant vers l’URL du PDF (signed ou publique).
 * Repli : lien cliquable si la redirection est bloquée (navigateur / politique).
 */
export function ReportPdfRedirect({ url }: { url: string }) {
  useEffect(() => {
    window.location.href = url;
  }, [url]);

  return (
    <div className="flex min-h-[50vh] flex-col items-center justify-center gap-4 p-8 text-center">
      <p className="text-foreground/80 text-sm">Ouverture du PDF…</p>
      <a href={url} className="text-sm font-medium underline" rel="noopener noreferrer">
        Cliquez ici si le PDF ne s’ouvre pas
      </a>
    </div>
  );
}
