"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import {
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

type Props = {
  reportId: string;
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

export default function ZeroDraftReportComposer({ reportId }: Props) {
  const storageKey = `zero-draft:${reportId}`;
  const [hostInfo, setHostInfo] = useState<string>("");
  const [title, setTitle] = useState("Rapport d'inspection automatise");
  const [inspectorNote, setInspectorNote] = useState("");
  const [entries, setEntries] = useState<ReportEntryInput[]>([defaultEntry()]);
  const [language, setLanguage] = useState<ReportLanguage>("fr");
  const [jurisdiction, setJurisdiction] = useState<JurisdictionProfile>("ca_general");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [pdfLink, setPdfLink] = useState<string | null>(null);
  const [lastSavedAt, setLastSavedAt] = useState<string | null>(null);
  const [retryAvailable, setRetryAvailable] = useState(false);

  const generated = useMemo(
    () => buildStructuredReport(entries, language, jurisdiction),
    [entries, jurisdiction, language],
  );
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
    }
    : {
      title: "Mode zero redaction",
      subtitle:
        "Selectionne les constats, puis le systeme redige automatiquement les sections observation/analyse/recommandation.",
      reportTitle: "Titre du rapport",
      inspectorNote: "Note terrain (optionnelle)",
      language: "Langue",
      jurisdiction: "Juridiction",
      finding: "Constat",
      remove: "Supprimer",
      addFinding: "Ajouter un constat",
      previewTitle: "Apercu auto-genere",
      recommendation: "Recommandation",
      moreSections: "section(s) supplementaire(s)",
      generate: "Generer le rapport complet + PDF",
      processing: "Traitement en cours...",
      retryPdf: "Relancer la generation PDF",
      clearDraft: "Effacer le brouillon local",
      localDraft: "Brouillon local enregistre a",
      openPdf: "Ouvrir le PDF genere",
      risk: "Risque",
      quality: "Qualite du brouillon",
    };

  useEffect(() => {
    setHostInfo(window.location.host);
    try {
      const raw = localStorage.getItem(storageKey);
      if (raw) {
        const parsed = JSON.parse(raw) as {
          title?: string;
          inspectorNote?: string;
          entries?: ReportEntryInput[];
          language?: ReportLanguage;
          jurisdiction?: JurisdictionProfile;
        };
        if (typeof parsed.title === "string") setTitle(parsed.title);
        if (typeof parsed.inspectorNote === "string") {
          setInspectorNote(parsed.inspectorNote);
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
    // #region agent log
    fetch("http://127.0.0.1:7625/ingest/93e0adad-2739-42ed-bed5-4fa06fb3b9b7", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Debug-Session-Id": "0c2b62",
      },
      body: JSON.stringify({
        sessionId: "0c2b62",
        runId: "ui-zero-draft-debug-3",
        hypothesisId: "H9",
        location: "components/ZeroDraftReportComposer.tsx:mount",
        message: "zero draft composer mounted",
        data: {
          reportIdPresent: Boolean(reportId),
          origin: window.location.origin,
          path: window.location.pathname,
        },
        timestamp: Date.now(),
      }),
    }).catch(() => {});
    // #endregion
  }, [reportId, storageKey]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const payload = {
      title,
      inspectorNote,
      entries,
      language,
      jurisdiction,
      savedAt: new Date().toISOString(),
    };
    localStorage.setItem(storageKey, JSON.stringify(payload));
    setLastSavedAt(new Date().toLocaleTimeString());
  }, [entries, inspectorNote, jurisdiction, language, storageKey, title]);

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

  const requestPdfGeneration = useCallback(async () => {
    const pdfRes = await withTimeout(
      fetch("/api/trigger-inspection", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ report_id: reportId }),
      }),
      40_000,
      "trigger-inspection",
    );
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
      body?: { error?: string };
    }>(pdfRes)) ?? {};
    if (!pdfRes.ok || pdfBody.success === false) {
      throw new Error(
        pdfBody.error ?? pdfBody.body?.error ?? `Echec generation PDF (${pdfRes.status})`,
      );
    }
    return pdfBody.signed_url ?? pdfBody.pdf_url ?? null;
  }, [reportId]);

  const clearLocalDraft = () => {
    localStorage.removeItem(storageKey);
    setTitle(language === "en" ? "Automated inspection report" : "Rapport d'inspection automatise");
    setInspectorNote("");
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
      setPdfLink(null);
      setRetryAvailable(false);
      setStatus("Etape 1/2: generation du contenu structure...");
      // #region agent log
      fetch("http://127.0.0.1:7625/ingest/93e0adad-2739-42ed-bed5-4fa06fb3b9b7", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Debug-Session-Id": "0c2b62",
        },
        body: JSON.stringify({
          sessionId: "0c2b62",
          runId: "ui-zero-draft-debug-2",
          hypothesisId: "H6",
          location: "components/ZeroDraftReportComposer.tsx:handleGenerate-start",
          message: "ui generation clicked",
          data: { reportIdPresent: Boolean(reportId), entriesCount: entries.length },
          timestamp: Date.now(),
        }),
      }).catch(() => {});
      // #endregion

      const saveRes = await withTimeout(
        fetch("/api/report-content", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            report_id: reportId,
            title,
            inspector_note: inspectorNote,
            entries,
            language,
            jurisdiction,
          }),
        }),
        25_000,
        "report-content",
      );
      const saveBody = await readJsonSafe<{ success?: boolean; error?: string }>(saveRes);
      // #region agent log
      fetch("http://127.0.0.1:7625/ingest/93e0adad-2739-42ed-bed5-4fa06fb3b9b7", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Debug-Session-Id": "0c2b62",
        },
        body: JSON.stringify({
          sessionId: "0c2b62",
          runId: "ui-zero-draft-debug-2",
          hypothesisId: "H7",
          location: "components/ZeroDraftReportComposer.tsx:after-report-content",
          message: "report-content response",
          data: { status: saveRes.status, success: Boolean(saveBody.success) },
          timestamp: Date.now(),
        }),
      }).catch(() => {});
      // #endregion
      if (!saveRes.ok || !saveBody.success) {
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
      setStatus("Rapport genere avec succes. Le PDF est pret.");
      localStorage.removeItem(storageKey);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setStatus(null);
      setRetryAvailable(true);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="text-xl font-semibold text-slate-900">{labels.title}</h2>
        <p className="mt-1 text-sm text-slate-600">
          {labels.subtitle}
        </p>
        <p className="mt-1 text-xs text-slate-500">Environnement actif: {hostInfo || "n/a"}</p>
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
