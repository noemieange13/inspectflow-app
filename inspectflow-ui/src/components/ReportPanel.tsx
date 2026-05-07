import { useEffect, useMemo, useState } from "react";
import SectionCard from "./SectionCard";
import { supabase } from "../lib/supabase";
import { formatDate, getPublicPdfUrl } from "../lib/utils";

type Props = {
  inspectionId: string;
};

type ReportRow = {
  id: string;
  inspection_id: string | null;
  status: string | null;
  pdf_path: string | null;
  pdf_url: string | null;
  created_at: string | null;
  access_token: string | null;
  generating: boolean | null;
};

export default function ReportPanel({ inspectionId }: Props) {
  const [report, setReport] = useState<ReportRow | null>(null);

  useEffect(() => {
    void load();
    const timer = setInterval(() => void load(), 4000);
    return () => clearInterval(timer);
  }, [inspectionId]);

  async function load() {
    const { data } = await supabase
      .from("reports")
      .select(
        "id, inspection_id, status, pdf_path, pdf_url, created_at, access_token, generating",
      )
      .eq("inspection_id", inspectionId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle<ReportRow>();

    setReport(data ?? null);
  }

  const pdfUrl = useMemo(() => {
    if (!report) return null;
    return getPublicPdfUrl(report.pdf_path) || report.pdf_url || null;
  }, [report]);

  const viewerBase = import.meta.env.VITE_REPORT_VIEWER_BASE_URL?.replace(/\/$/, "");
  const viewerUrl =
    viewerBase && report?.access_token
      ? `${viewerBase}/report/${report.id}?token=${encodeURIComponent(report.access_token)}`
      : null;

  return (
    <SectionCard title="Rapport final">
      {!report ? (
        <p className="muted">Aucun rapport trouvé pour cette inspection.</p>
      ) : (
        <div className="stack">
          <div>
            <strong>Statut:</strong> {report.status || "—"}
          </div>
          <div>
            <strong>Génération PDF:</strong>{" "}
            {report.generating ? "en cours" : "—"}
          </div>
          <div>
            <strong>Créé le:</strong> {formatDate(report.created_at)}
          </div>

          {pdfUrl ? (
            <a className="btn-primary inline-block" href={pdfUrl} target="_blank" rel="noreferrer">
              Ouvrir le PDF (stockage)
            </a>
          ) : (
            <div className="muted">PDF non disponible pour le moment.</div>
          )}

          {viewerUrl ? (
            <a className="btn-secondary inline-block" href={viewerUrl} target="_blank" rel="noreferrer">
              Ouvrir le viewer (lien sécurisé)
            </a>
          ) : null}
        </div>
      )}
    </SectionCard>
  );
}
