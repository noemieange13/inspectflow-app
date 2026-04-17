"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";

import {
  buildClientFacingSection,
  buildStructuredReport,
  ISSUES,
  SEVERITIES,
  ZONES,
  type IssueCode,
  normalizeReportLanguage,
  type JurisdictionProfile,
  type ReportLanguage,
  type ReportEntryInput,
  type Severity,
  type ZoneCode,
} from "@/lib/reportNarrative";

import type { ReportServerData } from "@/lib/reportViewerServer";
import NotesCapture from "@/components/NotesCapture";

type Props = {
  reportId: string;
  viewerToken?: string;
  initialData?: ReportServerData;
};

function defaultEntry(): ReportEntryInput {
  return {
    zone: "salon",
    issue: "water_infiltration",
    severity: "medium",
    note: "",
  };
}

function withTimeout<T>(promise: Promise<T>, timeoutMs: number, label: string): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error(`${label} timeout after ${timeoutMs}ms`));
    }, timeoutMs);
    promise.then((value) => {
      clearTimeout(timer);
      resolve(value);
    }).catch((err) => {
      clearTimeout(timer);
      reject(err);
    });
  });
}

type PayloadSection = {
  title?: string;
  order?: number;
  observation?: string;
  analysis?: string;
  recommendation?: string;
};

function extractSectionsFromPayload(payload: Record<string, unknown>): PayloadSection[] {
  if (!Array.isArray(payload.sections)) return [];
  return payload.sections.filter(
    (s): s is PayloadSection => s != null && typeof s === "object",
  );
}

export default function ZeroDraftReportComposer({
  reportId,
  viewerToken,
  initialData,
}: Props) {
  const storageKey = `zero-draft:${reportId}`;
  const hasExistingReport = !!(initialData?.payload && !initialData.notFound && !initialData.accessDenied);
  const existingPayload = hasExistingReport ? initialData!.payload! : null;
  const existingSections = existingPayload ? extractSectionsFromPayload(existingPayload) : [];

  const [hostInfo, setHostInfo] = useState<string>("");
  const [title, setTitle] = useState(
    (existingPayload && typeof existingPayload.title === "string" ? existingPayload.title : null)
    ?? "Rapport d'inspection automatisé",
  );
  const [inspectorNote, setInspectorNote] = useState(
    (existingPayload && typeof existingPayload.inspector_note === "string" ? existingPayload.inspector_note : null)
    ?? "",
  );
  const [entries, setEntries] = useState<ReportEntryInput[]>([defaultEntry()]);
  const [language, setLanguage] = useState<ReportLanguage>(
    existingPayload && (existingPayload.language === "en" || existingPayload.language === "fr")
      ? existingPayload.language as ReportLanguage
      : "fr",
  );
  const [jurisdiction, setJurisdiction] = useState<JurisdictionProfile>(
    existingPayload && (existingPayload.jurisdiction === "ca_qc" || existingPayload.jurisdiction === "ca_general")
      ? existingPayload.jurisdiction as JurisdictionProfile
      : "ca_general",
  );
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  /** Réponse API report-content (ex. rapport verrouillé en base). */
  const [contentSaveErrorCode, setContentSaveErrorCode] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [pdfLink, setPdfLink] = useState<string | null>(initialData?.pdfSignedUrl ?? null);
  const [lastSavedAt, setLastSavedAt] = useState<string | null>(null);
  const [retryAvailable, setRetryAvailable] = useState(false);
  const [shareCopied, setShareCopied] = useState(false);
  const [showEditor, setShowEditor] = useState(!hasExistingReport || existingSections.length === 0);
  const [photos, setPhotos] = useState<
    { id: string; name: string; url: string | null; uploading: boolean; error?: string }[]
  >([]);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [clientOverride, setClientOverride] = useState<string | null>(null);
  const [polishClient, setPolishClient] = useState(false);

  const generated = useMemo(
    () => buildStructuredReport(entries, language, jurisdiction),
    [entries, jurisdiction, language],
  );
  const autoClientDraft = useMemo(
    () => buildClientFacingSection(entries, language, jurisdiction, inspectorNote || undefined),
    [entries, language, jurisdiction, inspectorNote],
  );
  const clientSectionValue = clientOverride !== null ? clientOverride : autoClientDraft;
  const canGenerate = title.trim().length > 2 && entries.length > 0 && !loading;
  const completion = Math.min(100, Math.max(15, Math.round((entries.length / 6) * 100)));
  const riskBadgeClass = generated.risk_level === "high"
    ? "bg-red-100 text-red-700 border-red-200"
    : generated.risk_level === "medium"
    ? "bg-amber-100 text-amber-700 border-amber-200"
    : "bg-emerald-100 text-emerald-700 border-emerald-200";
  const labels = language === "en"
    ? {
      title: "Automated report mode",
      subtitle:
        "Select findings and the system drafts observation/analysis/recommendation sections automatically.",
      reportTitle: "Report title",
      inspectorNote: "Field note (optional)",
      language: "Language",
      jurisdiction: "Jurisdiction",
      finding: "Finding",
      remove: "Remove",
      addFinding: "Add finding",
      previewTitle: "Auto-generated preview",
      recommendation: "Recommendation",
      moreSections: "more section(s)",
      generate: "Generate full report + PDF",
      processing: "Processing...",
      retryPdf: "Retry PDF generation",
      clearDraft: "Clear local draft",
      localDraft: "Local draft saved at",
      openPdf: "Open generated PDF",
      risk: "Risk",
      quality: "Draft quality",
      complianceBilingual:
        "PDF includes a bilingual (FR/EN) Canadian building inspection framework notice and code references (NBC, provincial, CSA) — not a legal certificate.",
      shareLinkTitle: "Share link (with access token)",
      shareLinkHint:
        "Keep this URL to reopen this report and refresh PDF access when needed.",
      copyShareLink: "Copy link",
      copied: "Copied",
      missingToken:
        "No token in the URL. Open the full link from create-report (includes ?token=…).",
      existingReport: "This report has already been generated.",
      viewSections: "View report sections",
      editReport: "Edit / regenerate report",
      summary: "Summary",
      reportStatus: "Status",
      refreshPdf: "Refresh PDF access",
      clientSection: "Client summary (plain language)",
      clientSectionHint:
        "Auto draft from your findings; edit freely. Included in the PDF before technical sections.",
      regenerateClient: "Regenerate draft from findings",
      polishClientLabel: "Polish wording with AI (OpenAI, optional)",
      reportGeneratedOk: "Report generated successfully. The PDF is ready.",
      polishSkippedTooLong:
        "Note: client summary exceeded the AI length limit; your draft was saved.",
      polishSkippedAborted:
        "Note: AI polish stopped (timeout or limit); your draft was saved.",
      polishSkippedUnavailable:
        "Note: AI polish was unavailable; your draft was saved.",
      polishSkippedTimeout:
        "Note: AI polish stopped (OpenAI/network time limit); your draft was saved.",
      reportLockedShort:
        "This report is finalized or locked — the database refused to save changes.",
      reportLockedHelp:
        "For a field test, use a new report link (new inspection). You can also unlock the row in Supabase if needed.",
      reportLockedLink: "Open “Access a report”",
    }
    : {
      title: "Mode zéro rédaction",
      subtitle:
        "Sélectionnez les constats, puis le système rédige automatiquement les sections observation/analyse/recommandation.",
      reportTitle: "Titre du rapport",
      inspectorNote: "Note terrain (optionnelle)",
      language: "Langue",
      jurisdiction: "Juridiction",
      finding: "Constat",
      remove: "Supprimer",
      addFinding: "Ajouter un constat",
      previewTitle: "Aperçu auto-généré",
      recommendation: "Recommandation",
      moreSections: "section(s) supplémentaire(s)",
      generate: "Générer le rapport complet + PDF",
      processing: "Traitement en cours…",
      retryPdf: "Relancer la génération PDF",
      clearDraft: "Effacer le brouillon local",
      localDraft: "Brouillon local enregistré à",
      openPdf: "Ouvrir le PDF généré",
      risk: "Risque",
      quality: "Qualité du brouillon",
      complianceBilingual:
        "Le PDF inclut un encadrement bilingue (FR/EN) sur le cadre d'inspection bâtiment au Canada et des références codes (CNB, provincial, CSA) — sans valeur de certification légale.",
      shareLinkTitle: "Lien de partage (avec jeton)",
      shareLinkHint:
        "Conserve cette URL pour rouvrir ce rapport ou rafraîchir l'accès au PDF.",
      copyShareLink: "Copier le lien",
      copied: "Copié",
      missingToken:
        "Aucun jeton dans l'URL. Utilisez le lien complet renvoyé par create-report (?token=…).",
      existingReport: "Ce rapport a déjà été généré.",
      viewSections: "Voir les sections du rapport",
      editReport: "Modifier / régénérer le rapport",
      summary: "Résumé",
      reportStatus: "Statut",
      refreshPdf: "Rafraîchir l'accès au PDF",
      clientSection: "Compte rendu client (langage accessible)",
      clientSectionHint:
        "Brouillon auto à partir des constats ; modifiable. Inclus dans le PDF avant le volet technique.",
      regenerateClient: "Régénérer le brouillon à partir des constats",
      polishClientLabel: "Peaufiner la rédaction avec l'IA (OpenAI, optionnel)",
      reportGeneratedOk: "Rapport généré avec succès. Le PDF est prêt.",
      polishSkippedTooLong:
        "Note : texte client trop long pour le polish IA ; le brouillon a été enregistré.",
      polishSkippedAborted:
        "Note : polish IA interrompu (délai ou limite) ; le brouillon a été enregistré.",
      polishSkippedUnavailable:
        "Note : polish IA indisponible ; le brouillon a été enregistré.",
      reportLockedShort:
        "Ce rapport est finalisé ou verrouillé — la base refuse l'enregistrement.",
      reportLockedHelp:
        "Pour un test terrain, utilisez un lien de rapport neuf (nouvelle inspection). Sinon, déverrouillez la ligne dans Supabase.",
      reportLockedLink: "Accéder à un autre rapport",
    };

  useEffect(() => {
    if (
      hasExistingReport &&
      existingPayload &&
      typeof existingPayload.client_section === "string" &&
      existingPayload.client_section.trim()
    ) {
      setClientOverride(existingPayload.client_section.trim());
    }
  }, [hasExistingReport, existingPayload]);

  /** SSR ne signe plus l’URL Storage ; on récupère le PDF après hydratation (évite chargement infini). */
  useEffect(() => {
    if (!viewerToken?.trim()) return;
    if (!initialData?.hasPdf) return;
    if (initialData.pdfSignedUrl) return;
    let cancelled = false;
    const run = async () => {
      try {
        const res = await fetch("/api/regenerate-signed-url", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ reportId, token: viewerToken }),
        });
        const body = (await res.json().catch(() => ({}))) as Record<string, unknown>;
        if (cancelled) return;
        if (res.ok && typeof body.pdf_signed_url === "string") {
          setPdfLink(body.pdf_signed_url);
        }
      } catch {
        /* lien PDF vide : bouton Rafraîchir */
      }
    };
    void run();
    return () => {
      cancelled = true;
    };
  }, [reportId, viewerToken, initialData?.hasPdf, initialData?.pdfSignedUrl]);

  useEffect(() => {
    setHostInfo(window.location.host);
    if (hasExistingReport) return;
    try {
      const raw = localStorage.getItem(storageKey);
      if (raw) {
        const parsed = JSON.parse(raw) as {
          title?: string;
          inspectorNote?: string;
          clientOverride?: string | null;
          entries?: ReportEntryInput[];
          language?: ReportLanguage;
          jurisdiction?: JurisdictionProfile;
        };
        if (typeof parsed.title === "string") setTitle(parsed.title);
        if (typeof parsed.inspectorNote === "string") {
          setInspectorNote(parsed.inspectorNote);
        }
        if (typeof parsed.clientOverride === "string") {
          setClientOverride(parsed.clientOverride);
        }
        if (Array.isArray(parsed.entries) && parsed.entries.length > 0) {
          setEntries(parsed.entries);
        }
        if (parsed.language) {
          setLanguage(normalizeReportLanguage(parsed.language));
        }
        if (parsed.jurisdiction === "ca_qc" || parsed.jurisdiction === "ca_general") {
          setJurisdiction(parsed.jurisdiction);
        }
      }
    } catch {
      // Ignore local draft parsing failure.
    }
  }, [reportId, storageKey, hasExistingReport]);

  useEffect(() => {
    if (typeof window === "undefined" || hasExistingReport) return;
    const payload = {
      title,
      inspectorNote,
      clientOverride,
      entries,
      language,
      jurisdiction,
      savedAt: new Date().toISOString(),
    };
    localStorage.setItem(storageKey, JSON.stringify(payload));
    setLastSavedAt(new Date().toLocaleTimeString());
  }, [clientOverride, entries, inspectorNote, jurisdiction, language, storageKey, title, hasExistingReport]);

  const updateEntry = <K extends keyof ReportEntryInput>(
    index: number,
    key: K,
    value: ReportEntryInput[K],
  ) => {
    setEntries((prev) =>
      prev.map((row, i) => (i === index ? { ...row, [key]: value } : row)),
    );
  };

  const addEntry = () => setEntries((prev) => [...prev, defaultEntry()]);
  const removeEntry = (index: number) => {
    setEntries((prev) => (prev.length === 1 ? prev : prev.filter((_, i) => i !== index)));
  };

  const handleNotesProcessed = useCallback((notes: Array<{
    enhanced: string;
    suggested_zone: string | null;
    suggested_issue: string | null;
    confidence: number;
  }>) => {
    const newEntries: ReportEntryInput[] = notes
      .filter((n) => n.confidence > 0.3)
      .map((n) => {
        const zone = ZONES.some((z) => z.value === n.suggested_zone)
          ? (n.suggested_zone as ZoneCode)
          : "salon";
        const issue = ISSUES.some((i) => i.value === n.suggested_issue)
          ? (n.suggested_issue as IssueCode)
          : "water_infiltration";
        return { zone, issue, severity: "medium" as const, note: n.enhanced };
      });
    if (newEntries.length > 0) {
      setEntries((prev) => [...prev, ...newEntries]);
    }
  }, []);

  const handlePhotoUpload = useCallback(async (files: FileList) => {
    setUploadingPhoto(true);
    const additions = Array.from(files).map((f) => ({
      id: crypto.randomUUID(),
      name: f.name,
      url: null as string | null,
      uploading: true,
    }));
    setPhotos((prev) => [...prev, ...additions]);

    await Promise.all(
      Array.from({ length: files.length }, (_, i) => {
        const file = files[i]!;
        const slotId = additions[i]!.id;
        const form = new FormData();
        form.append("file", file);
        form.append("report_id", reportId);
        form.append("language", language);
        return (async () => {
          try {
            const res = await fetch("/api/upload-photo", { method: "POST", body: form });
            const body = await res.json().catch(() => ({})) as Record<string, unknown>;
            const suggested =
              typeof body.suggested_inspector_note === "string" && body.suggested_inspector_note.trim()
                ? body.suggested_inspector_note.trim()
                : null;
            if (suggested) {
              setInspectorNote((prev) => (prev.trim() ? `${prev.trim()}\n\n${suggested}` : suggested));
            }
            setPhotos((prev) =>
              prev.map((p) =>
                p.id === slotId
                  ? {
                      ...p,
                      uploading: false,
                      url: typeof body.url === "string" ? body.url : null,
                      error: !res.ok ? (typeof body.error === "string" ? body.error : `Erreur ${res.status}`) : undefined,
                    }
                  : p,
              ),
            );
          } catch (e) {
            setPhotos((prev) =>
              prev.map((p) =>
                p.id === slotId
                  ? { ...p, uploading: false, error: e instanceof Error ? e.message : String(e) }
                  : p,
              ),
            );
          }
        })();
      }),
    );
    setUploadingPhoto(false);
  }, [reportId, language]);

  const requestPdfGeneration = useCallback(async () => {
    let pdfRes: Response;
    try {
      pdfRes = await withTimeout(
        fetch("/api/trigger-inspection", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ report_id: reportId }),
        }),
        180_000,
        "trigger-inspection",
      );
    } catch (e) {
      throw e;
    }
    const readJsonSafe = async <T,>(res: Response): Promise<T | null> => {
      try {
        return (await res.json()) as T;
      } catch {
        return null;
      }
    };
    const pdfBody = (await readJsonSafe<{
      success?: boolean;
      error?: string;
      pdf_url?: string;
      signed_url?: string;
      body?: unknown;
    }>(pdfRes)) ?? {};
    if (!pdfRes.ok || pdfBody.success === false) {
      const nested =
        pdfBody.body &&
        typeof pdfBody.body === "object" &&
        pdfBody.body !== null &&
        "error" in pdfBody.body &&
        typeof (pdfBody.body as { error?: unknown }).error === "string"
          ? (pdfBody.body as { error: string }).error
          : null;
      throw new Error(
        pdfBody.error ??
          nested ??
          `Echec generation PDF (${pdfRes.status})`,
      );
    }
    return pdfBody.signed_url ?? pdfBody.pdf_url ?? null;
  }, [reportId]);

  const refreshPdfUrl = useCallback(async () => {
    if (!viewerToken) return;
    try {
      setLoading(true);
      setError(null);
      const res = await withTimeout(
        fetch("/api/regenerate-signed-url", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ reportId, token: viewerToken }),
        }),
        15_000,
        "regenerate-signed-url",
      );
      const body = (await res.json().catch(() => ({}))) as Record<string, unknown>;
      if (!res.ok) {
        throw new Error(typeof body.error === "string" ? body.error : `Erreur ${res.status}`);
      }
      if (typeof body.pdf_signed_url === "string") {
        setPdfLink(body.pdf_signed_url);
        setStatus(language === "en" ? "PDF access refreshed." : "Accès au PDF rafraîchi.");
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [reportId, viewerToken, language]);

  const clearLocalDraft = () => {
    localStorage.removeItem(storageKey);
    setTitle(language === "en" ? "Automated inspection report" : "Rapport d'inspection automatisé");
    setInspectorNote("");
    setClientOverride(null);
    setPolishClient(false);
    setEntries([defaultEntry()]);
    setError(null);
    setStatus(null);
    setPdfLink(null);
    setLastSavedAt(null);
    setRetryAvailable(false);
  };

  const handleGenerate = async () => {
    const readJsonSafe = async <T,>(res: Response): Promise<T | null> => {
      try {
        return (await res.json()) as T;
      } catch {
        return null;
      }
    };
    try {
      setLoading(true);
      setError(null);
      setContentSaveErrorCode(null);
      setPdfLink(null);
      setRetryAvailable(false);
      setStatus(
        "Etape 1/2: generation du contenu structure… (1er appel : jusqu’a ~3 min si Next compile la route ou disque lent)",
      );
      /** 60s trop court : premier POST /api/report-content peut prendre 100s+ (Turbopack + Bureau lent). */
      const reportContentMs = polishClient ? 240_000 : 180_000;
      const saveRes = await withTimeout(
        fetch("/api/report-content", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            report_id: reportId,
            access_token: viewerToken ?? "",
            title,
            inspector_note: inspectorNote,
            client_section: clientSectionValue,
            polish_client: polishClient,
            entries,
            language,
            jurisdiction,
          }),
        }),
        reportContentMs,
        "report-content",
      );
      const saveBody = await readJsonSafe<{
        success?: boolean;
        error?: string;
        polish_outcome?: "applied" | "too_long" | "aborted" | "unavailable" | "timeout";
      }>(saveRes);
      if (!saveRes.ok || !saveBody?.success) {
        throw new Error(
          saveBody?.error ??
            `Impossible d'enregistrer le contenu (${saveRes.status})`,
        );
      }

      setStatus("Etape 2/2: generation du PDF...");
      const nextPdfLink = await requestPdfGeneration();
      if (nextPdfLink) {
        window.open(nextPdfLink, "_blank");
        setPdfLink(nextPdfLink);
      }
      {
        let doneStatus = labels.reportGeneratedOk;
        if (
          polishClient &&
          saveBody.polish_outcome &&
          saveBody.polish_outcome !== "applied"
        ) {
          const o = saveBody.polish_outcome;
          const extra =
            o === "too_long"
              ? labels.polishSkippedTooLong
              : o === "aborted"
                ? labels.polishSkippedAborted
                : o === "timeout"
                  ? labels.polishSkippedTimeout
                  : labels.polishSkippedUnavailable;
          doneStatus = `${labels.reportGeneratedOk} ${extra}`;
        }
        setStatus(doneStatus);
      }
      localStorage.removeItem(storageKey);
    } catch (e) {
      setContentSaveErrorCode(null);
      setError(e instanceof Error ? e.message : String(e));
      setStatus(null);
      setRetryAvailable(true);
    } finally {
      setLoading(false);
    }
  };

  const existingClientSection =
    existingPayload && typeof existingPayload.client_section === "string"
      ? existingPayload.client_section.trim()
      : null;
  const existingSummary = existingPayload && typeof existingPayload.summary === "string"
    ? existingPayload.summary
    : null;
  const existingRiskLevel = existingPayload && typeof existingPayload.risk_level === "string"
    ? existingPayload.risk_level
    : null;
  const existingRiskClass = existingRiskLevel === "high"
    ? "bg-red-100 text-red-700 border-red-200"
    : existingRiskLevel === "medium"
    ? "bg-amber-100 text-amber-700 border-amber-200"
    : "bg-emerald-100 text-emerald-700 border-emerald-200";

  if (hasExistingReport && existingSections.length > 0 && !showEditor) {
    return (
      <div className="mx-auto max-w-5xl space-y-6">
        <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-xl font-semibold text-slate-900">{title}</h2>
            {existingRiskLevel ? (
              <span className={`rounded-full border px-2 py-1 text-xs font-semibold ${existingRiskClass}`}>
                {labels.risk}: {existingRiskLevel}
              </span>
            ) : null}
          </div>

          {initialData?.status ? (
            <p className="mt-1 text-xs text-slate-500">
              {labels.reportStatus}: <span className="font-medium">{initialData.status}</span>
            </p>
          ) : null}

          <p className="mt-2 text-xs text-slate-500 leading-relaxed">
            {labels.complianceBilingual}
          </p>

          {viewerToken ? (
            <div className="mt-3 rounded-lg border border-emerald-200 bg-emerald-50/80 p-3">
              <p className="text-xs font-semibold text-emerald-900">
                {labels.shareLinkTitle}
              </p>
              <p className="mt-1 text-xs text-emerald-800">{labels.shareLinkHint}</p>
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  className="rounded-md bg-emerald-800 px-3 py-1.5 text-xs font-medium text-white hover:bg-emerald-900"
                  onClick={async () => {
                    const origin =
                      typeof window !== "undefined" ? window.location.origin : "";
                    const url = `${origin}/report/${encodeURIComponent(reportId)}?token=${encodeURIComponent(viewerToken)}`;
                    try {
                      await navigator.clipboard.writeText(url);
                      setShareCopied(true);
                      window.setTimeout(() => setShareCopied(false), 2000);
                    } catch {
                      setShareCopied(false);
                    }
                  }}
                >
                  {shareCopied ? labels.copied : labels.copyShareLink}
                </button>
                <Link
                  href={`/rapport/couverture?report=${encodeURIComponent(reportId)}&token=${encodeURIComponent(viewerToken)}`}
                  className="rounded-md border border-emerald-700 bg-white px-3 py-1.5 text-xs font-medium text-emerald-900 hover:bg-emerald-100"
                >
                  Couverture & en-tête
                </Link>
              </div>
            </div>
          ) : null}
        </div>

        {pdfLink ? (
          <div className="rounded-xl border border-blue-200 bg-blue-50 p-5">
            <div className="flex flex-wrap items-center gap-3">
              <a
                href={pdfLink}
                target="_blank"
                rel="noreferrer"
                className="inline-flex rounded-lg bg-slate-900 px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-slate-800"
              >
                {labels.openPdf}
              </a>
              {viewerToken ? (
                <button
                  type="button"
                  onClick={refreshPdfUrl}
                  disabled={loading}
                  className="rounded-lg border border-slate-300 bg-white px-4 py-2.5 text-sm font-medium text-slate-700 shadow-sm transition hover:bg-slate-50 disabled:opacity-60"
                >
                  {labels.refreshPdf}
                </button>
              ) : null}
            </div>
            {error ? <p className="mt-2 text-sm text-red-600">{error}</p> : null}
            {status ? <p className="mt-2 text-sm text-emerald-700">{status}</p> : null}
          </div>
        ) : initialData?.hasPdf && viewerToken ? (
          <div className="rounded-xl border border-amber-200 bg-amber-50 p-5">
            <p className="text-sm text-amber-800">
              {language === "en"
                ? "A PDF exists but the access link has expired."
                : "Un PDF existe mais le lien d'accès est expiré."}
            </p>
            <button
              type="button"
              onClick={refreshPdfUrl}
              disabled={loading}
              className="mt-3 rounded-lg border border-slate-300 bg-white px-4 py-2.5 text-sm font-medium text-slate-700 shadow-sm transition hover:bg-slate-50 disabled:opacity-60"
            >
              {labels.refreshPdf}
            </button>
            {error ? <p className="mt-2 text-sm text-red-600">{error}</p> : null}
            {status ? <p className="mt-2 text-sm text-emerald-700">{status}</p> : null}
          </div>
        ) : null}

        {existingClientSection ? (
          <div className="rounded-xl border border-indigo-200 bg-indigo-50/80 p-5 shadow-sm">
            <h3 className="text-base font-semibold text-slate-900">{labels.clientSection}</h3>
            <p className="mt-2 whitespace-pre-wrap text-sm text-slate-800">{existingClientSection}</p>
          </div>
        ) : null}

        {existingSummary ? (
          <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
            <h3 className="text-base font-semibold text-slate-900">{labels.summary}</h3>
            <p className="mt-2 text-sm text-slate-700">{existingSummary}</p>
          </div>
        ) : null}

        <div className="space-y-4">
          {existingSections.map((section, idx) => (
            <div key={idx} className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
              <p className="text-sm font-semibold text-slate-900">{section.title ?? `Section ${idx + 1}`}</p>
              {section.observation ? (
                <p className="mt-2 text-sm text-slate-700">{section.observation}</p>
              ) : null}
              {section.analysis ? (
                <p className="mt-1 text-sm text-slate-600">{section.analysis}</p>
              ) : null}
              {section.recommendation ? (
                <p className="mt-1 text-sm font-medium text-slate-800">
                  {labels.recommendation}: {section.recommendation}
                </p>
              ) : null}
            </div>
          ))}
        </div>

        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => setShowEditor(true)}
            className="rounded-lg border border-slate-300 bg-white px-4 py-2.5 text-sm font-medium text-slate-700 shadow-sm transition hover:bg-slate-50"
          >
            {labels.editReport}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      {hasExistingReport && existingSections.length > 0 ? (
        <button
          type="button"
          onClick={() => setShowEditor(false)}
          className="rounded-lg border border-slate-300 bg-white px-4 py-2.5 text-sm font-medium text-slate-700 shadow-sm transition hover:bg-slate-50"
        >
          {labels.viewSections}
        </button>
      ) : null}

      <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="text-xl font-semibold text-slate-900">{labels.title}</h2>
        <p className="mt-1 text-sm text-slate-600">
          {labels.subtitle}
        </p>
        <p className="mt-2 text-xs text-slate-500 leading-relaxed">
          {labels.complianceBilingual}
        </p>
        <p className="mt-1 text-xs text-slate-500">Environnement actif: {hostInfo || "n/a"}</p>
        {viewerToken ? (
          <div className="mt-3 rounded-lg border border-emerald-200 bg-emerald-50/80 p-3">
            <p className="text-xs font-semibold text-emerald-900">
              {labels.shareLinkTitle}
            </p>
            <p className="mt-1 text-xs text-emerald-800">{labels.shareLinkHint}</p>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <button
                type="button"
                className="rounded-md bg-emerald-800 px-3 py-1.5 text-xs font-medium text-white hover:bg-emerald-900"
                onClick={async () => {
                  const origin =
                    typeof window !== "undefined" ? window.location.origin : "";
                  const url = `${origin}/report/${encodeURIComponent(reportId)}?token=${encodeURIComponent(viewerToken)}`;
                  try {
                    await navigator.clipboard.writeText(url);
                    setShareCopied(true);
                    window.setTimeout(() => setShareCopied(false), 2000);
                  } catch {
                    setShareCopied(false);
                  }
                }}
              >
                {shareCopied ? labels.copied : labels.copyShareLink}
              </button>
              <Link
                href={`/rapport/couverture?report=${encodeURIComponent(reportId)}&token=${encodeURIComponent(viewerToken)}`}
                className="rounded-md border border-emerald-700 bg-white px-3 py-1.5 text-xs font-medium text-emerald-900 hover:bg-emerald-100"
              >
                Couverture & en-tête
              </Link>
            </div>
          </div>
        ) : (
          <p className="mt-3 text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
            {labels.missingToken}
          </p>
        )}
        <div className="mt-3 flex items-center gap-2">
          <span className="text-xs font-medium text-slate-600">{labels.quality}</span>
          <div className="h-2 flex-1 rounded-full bg-slate-200">
            <div
              className="h-2 rounded-full bg-slate-900 transition-all"
              style={{ width: `${completion}%` }}
            />
          </div>
          <span className="text-xs font-semibold text-slate-700">{completion}%</span>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <div className="space-y-4 rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <label className="block text-sm font-medium text-slate-700">
            {labels.reportTitle}
            <input
              className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-900"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              disabled={loading}
            />
          </label>

          <div className="grid gap-2 md:grid-cols-2">
            <label className="block text-sm font-medium text-slate-700">
              {labels.language}
              <select
                className="mt-1 w-full rounded-md border border-slate-300 px-2 py-2 text-sm"
                value={language}
                onChange={(e) => setLanguage(e.target.value as ReportLanguage)}
                disabled={loading}
              >
                <option value="fr">Francais</option>
                <option value="en">English</option>
              </select>
            </label>
            <label className="block text-sm font-medium text-slate-700">
              {labels.jurisdiction}
              <select
                className="mt-1 w-full rounded-md border border-slate-300 px-2 py-2 text-sm"
                value={jurisdiction}
                onChange={(e) => setJurisdiction(e.target.value as JurisdictionProfile)}
                disabled={loading}
              >
                <option value="ca_general">Canada (general)</option>
                <option value="ca_qc">Quebec (Canada)</option>
              </select>
            </label>
          </div>

          <label className="block text-sm font-medium text-slate-700">
            {labels.inspectorNote}
            <textarea
              className="mt-1 min-h-24 w-full rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-900"
              value={inspectorNote}
              onChange={(e) => setInspectorNote(e.target.value)}
              placeholder="Contexte global, acces, contraintes..."
              disabled={loading}
            />
          </label>

          <div className="rounded-lg border border-indigo-200 bg-indigo-50/50 p-4">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <label className="block text-sm font-medium text-slate-800">
                {labels.clientSection}
              </label>
              <button
                type="button"
                className="shrink-0 rounded-md border border-indigo-300 bg-white px-2.5 py-1 text-xs font-medium text-indigo-900 hover:bg-indigo-100 disabled:opacity-50"
                disabled={loading}
                onClick={() => setClientOverride(null)}
              >
                {labels.regenerateClient}
              </button>
            </div>
            <p className="mt-1 text-xs text-slate-600">{labels.clientSectionHint}</p>
            <textarea
              className="mt-2 min-h-36 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900"
              value={clientSectionValue}
              onChange={(e) => setClientOverride(e.target.value)}
              disabled={loading}
            />
            <label className="mt-2 flex cursor-pointer items-center gap-2 text-xs text-slate-700">
              <input
                type="checkbox"
                checked={polishClient}
                onChange={(e) => setPolishClient(e.target.checked)}
                disabled={loading}
              />
              {labels.polishClientLabel}
            </label>
          </div>

          <div className="space-y-3">
            {entries.map((entry, idx) => (
              <div key={idx} className="rounded-lg border border-slate-200 p-3">
                <div className="mb-2 flex items-center justify-between">
                  <p className="text-sm font-semibold text-slate-800">{labels.finding} #{idx + 1}</p>
                  <button
                    type="button"
                    className="text-xs text-red-600 disabled:text-slate-400"
                    disabled={entries.length === 1 || loading}
                    onClick={() => removeEntry(idx)}
                  >
                    {labels.remove}
                  </button>
                </div>

                <div className="grid gap-2 md:grid-cols-3">
                  <select
                    className="rounded-md border border-slate-300 px-2 py-2 text-sm"
                    value={entry.zone}
                    onChange={(e) => updateEntry(idx, "zone", e.target.value as ZoneCode)}
                    disabled={loading}
                  >
                    {ZONES.map((zone) => (
                      <option key={zone.value} value={zone.value}>
                        {zone.label}
                      </option>
                    ))}
                  </select>

                  <select
                    className="rounded-md border border-slate-300 px-2 py-2 text-sm"
                    value={entry.issue}
                    onChange={(e) => updateEntry(idx, "issue", e.target.value as IssueCode)}
                    disabled={loading}
                  >
                    {ISSUES.map((issue) => (
                      <option key={issue.value} value={issue.value}>
                        {issue.label}
                      </option>
                    ))}
                  </select>

                  <select
                    className="rounded-md border border-slate-300 px-2 py-2 text-sm"
                    value={entry.severity}
                    onChange={(e) => updateEntry(idx, "severity", e.target.value as Severity)}
                    disabled={loading}
                  >
                    {SEVERITIES.map((severity) => (
                      <option key={severity.value} value={severity.value}>
                        {severity.label}
                      </option>
                    ))}
                  </select>
                </div>

                <input
                  className="mt-2 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
                  value={entry.note ?? ""}
                  onChange={(e) => updateEntry(idx, "note", e.target.value)}
                  placeholder="Note optionnelle pour ce constat..."
                  disabled={loading}
                />
              </div>
            ))}
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              className="rounded-md border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-60"
              onClick={addEntry}
              disabled={loading}
            >
              {labels.addFinding}
            </button>
            <button
              type="button"
              className="rounded-md border border-slate-300 px-3 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50 disabled:opacity-60"
              onClick={clearLocalDraft}
              disabled={loading}
            >
              {labels.clearDraft}
            </button>
          </div>

          <NotesCapture
            reportId={reportId}
            language={language}
            onNotesProcessed={handleNotesProcessed}
          />

          <div className="rounded-lg border border-slate-200 p-4">
            <p className="text-sm font-medium text-slate-700 mb-3">
              {language === "en" ? "Photos" : "Photos"}
            </p>
            <label className="flex cursor-pointer items-center justify-center rounded-md border-2 border-dashed border-slate-300 px-4 py-6 text-sm text-slate-500 transition hover:border-blue-400 hover:text-blue-600">
              <input
                type="file"
                accept="image/*"
                multiple
                className="sr-only"
                disabled={loading || uploadingPhoto}
                onChange={(e) => {
                  if (e.target.files && e.target.files.length > 0) {
                    handlePhotoUpload(e.target.files);
                    e.target.value = "";
                  }
                }}
              />
              {uploadingPhoto
                ? (language === "en" ? "Uploading..." : "Téléversement...")
                : (language === "en" ? "Click to add photos" : "Cliquez pour ajouter des photos")}
            </label>
            {photos.length > 0 ? (
              <div className="mt-3 grid grid-cols-3 gap-2">
                {photos.map((photo) => (
                  <div key={photo.id} className="rounded-md border border-slate-200 p-1.5 text-center">
                    {photo.url ? (
                      <img
                        src={photo.url}
                        alt={photo.name}
                        className="h-20 w-full rounded object-cover"
                      />
                    ) : photo.uploading ? (
                      <div className="flex h-20 items-center justify-center bg-slate-100 rounded">
                        <span className="text-xs text-slate-400">…</span>
                      </div>
                    ) : (
                      <div className="flex h-20 items-center justify-center bg-red-50 rounded">
                        <span className="text-xs text-red-500">Erreur</span>
                      </div>
                    )}
                    <p className="mt-1 truncate text-xs text-slate-500">{photo.name}</p>
                    {photo.error ? (
                      <p className="text-xs text-red-500">{photo.error}</p>
                    ) : null}
                  </div>
                ))}
              </div>
            ) : null}
          </div>
        </div>

        <div className="space-y-4 rounded-xl border border-slate-200 bg-slate-50 p-5">
          <div className="flex items-center justify-between gap-3">
            <h3 className="text-base font-semibold text-slate-900">{labels.previewTitle}</h3>
            <span className={`rounded-full border px-2 py-1 text-xs font-semibold ${riskBadgeClass}`}>
              {labels.risk}: {generated.risk_level}
            </span>
          </div>
          <p className="text-sm text-slate-700">{generated.summary}</p>

          <div className="space-y-3">
            {generated.sections.slice(0, 3).map((section) => (
              <div key={section.order} className="rounded-md border border-slate-200 bg-white p-3">
                <p className="text-sm font-semibold text-slate-900">{section.title}</p>
                <p className="mt-1 text-xs text-slate-700">{section.observation}</p>
                <p className="mt-1 text-xs text-slate-700">{section.analysis}</p>
                <p className="mt-1 text-xs font-medium text-slate-800">
                  {labels.recommendation}: {section.recommendation}
                </p>
              </div>
            ))}
            {generated.sections.length > 3 ? (
              <p className="text-xs text-slate-500">
                + {generated.sections.length - 3} {labels.moreSections}
              </p>
            ) : null}
          </div>

          <button
            type="button"
            disabled={!canGenerate}
            onClick={handleGenerate}
            className="w-full rounded-md bg-slate-900 px-4 py-2 text-sm font-semibold text-white disabled:opacity-60 disabled:cursor-not-allowed"
          >
            {loading ? labels.processing : labels.generate}
          </button>

          {lastSavedAt ? (
            <p className="text-xs text-slate-500">{labels.localDraft} {lastSavedAt}</p>
          ) : null}
          {status ? <p className="text-sm text-emerald-700" aria-live="polite">{status}</p> : null}
          {error ? <p className="text-sm text-red-600" role="alert">{error}</p> : null}
          {contentSaveErrorCode === "report_locked" ? (
            <p className="text-sm text-slate-600">
              {labels.reportLockedHelp}{" "}
              <Link href="/report" className="font-medium text-blue-600 underline hover:text-blue-800">
                {labels.reportLockedLink}
              </Link>
              .
            </p>
          ) : null}
          {retryAvailable && !loading ? (
            <button
              type="button"
              className="inline-flex rounded-md border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-800 hover:bg-slate-100"
              onClick={async () => {
                try {
                  setLoading(true);
                  setError(null);
                  setStatus("Relance de la generation PDF...");
                  const nextPdfLink = await requestPdfGeneration();
                  if (nextPdfLink) {
                    window.open(nextPdfLink, "_blank");
                    setPdfLink(nextPdfLink);
                  }
                  setStatus("PDF regenere avec succes.");
                  setRetryAvailable(false);
                } catch (e) {
                  setError(e instanceof Error ? e.message : String(e));
                  setStatus(null);
                } finally {
                  setLoading(false);
                }
              }}
            >
              {labels.retryPdf}
            </button>
          ) : null}
          {pdfLink ? (
            <a
              href={pdfLink}
              target="_blank"
              rel="noreferrer"
              className="inline-flex rounded-md border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-800 hover:bg-slate-100"
            >
              {labels.openPdf}
            </a>
          ) : null}
        </div>
      </div>
    </div>
  );
}
