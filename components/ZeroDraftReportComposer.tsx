"use client";

import { useEffect, useMemo, useState } from "react";

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
  const [lastSavedAt, setLastSavedAt] = useState<string | null>(null);

  const generated = useMemo(() => buildStructuredReport(entries), [entries]);

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
  }, [reportId]);

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

  const parseErrorMessage = async (res: Response): Promise<string> => {
    try {
      const data = (await res.json()) as {
        error?: string;
        body?: { error?: string };
      };
      return data.error ?? data.body?.error ?? `Erreur HTTP ${res.status}`;
    } catch {
      return `Erreur HTTP ${res.status}`;
    }
  };

  const handleGenerate = async () => {
    try {
      setLoading(true);
      setError(null);
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

      const saveRes = await fetch("/api/report-content", {
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
      });
      const saveBody = (await saveRes.json()) as { success?: boolean; error?: string };
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
        throw new Error(saveBody.error ?? `Impossible d'enregistrer le contenu (${saveRes.status})`);
      }

      setStatus("Etape 2/2: generation du PDF...");
      const pdfRes = await fetch("/api/trigger-inspection", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ report_id: reportId }),
      });
      const pdfBody = (await pdfRes.json()) as {
        success?: boolean;
        error?: string;
        pdf_url?: string;
      };
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
          hypothesisId: "H8",
          location: "components/ZeroDraftReportComposer.tsx:after-trigger-inspection",
          message: "trigger-inspection response",
          data: {
            status: pdfRes.status,
            success: pdfBody.success !== false,
            hasPdfUrl: Boolean(pdfBody.pdf_url),
          },
          timestamp: Date.now(),
        }),
      }).catch(() => {});
      // #endregion
      if (!pdfRes.ok || pdfBody.success === false) {
        const fallbackMsg = await parseErrorMessage(pdfRes);
        throw new Error(pdfBody.error ?? fallbackMsg ?? "Echec generation PDF");
      }

      if (pdfBody.pdf_url) {
        window.open(pdfBody.pdf_url, "_blank");
      }
      setStatus("Rapport genere avec succes. Le PDF est pret.");
      localStorage.removeItem(storageKey);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setStatus(null);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="text-xl font-semibold text-slate-900">Mode zero redaction</h2>
        <p className="mt-1 text-sm text-slate-600">
          Selectionne les constats, puis le systeme redige automatiquement les sections
          observation/analyse/recommandation.
        </p>
        <p className="mt-1 text-xs text-slate-500">Environnement actif: {hostInfo || "n/a"}</p>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <div className="space-y-4 rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <label className="block text-sm font-medium text-slate-700">
            Titre du rapport
            <input
              className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-900"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
            />
          </label>

          <div className="grid gap-2 md:grid-cols-2">
            <label className="block text-sm font-medium text-slate-700">
              Langue
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
              Juridiction
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
            Note terrain (optionnelle)
            <textarea
              className="mt-1 min-h-24 w-full rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-900"
              value={inspectorNote}
              onChange={(e) => setInspectorNote(e.target.value)}
              placeholder="Contexte global, acces, contraintes..."
            />
          </label>

          <div className="space-y-3">
            {entries.map((entry, idx) => (
              <div key={idx} className="rounded-lg border border-slate-200 p-3">
                <div className="mb-2 flex items-center justify-between">
                  <p className="text-sm font-semibold text-slate-800">Constat #{idx + 1}</p>
                  <button
                    type="button"
                    className="text-xs text-red-600 disabled:text-slate-400"
                    disabled={entries.length === 1 || loading}
                    onClick={() => removeEntry(idx)}
                  >
                    Supprimer
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

          <button
            type="button"
            className="rounded-md border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
            onClick={addEntry}
            disabled={loading}
          >
            Ajouter un constat
          </button>
        </div>

        <div className="space-y-4 rounded-xl border border-slate-200 bg-slate-50 p-5">
          <h3 className="text-base font-semibold text-slate-900">Apercu auto-genere</h3>
          <p className="text-sm text-slate-700">{generated.summary}</p>

          <div className="space-y-3">
            {generated.sections.slice(0, 3).map((section) => (
              <div key={section.order} className="rounded-md border border-slate-200 bg-white p-3">
                <p className="text-sm font-semibold text-slate-900">{section.title}</p>
                <p className="mt-1 text-xs text-slate-700">{section.observation}</p>
                <p className="mt-1 text-xs text-slate-700">{section.analysis}</p>
                <p className="mt-1 text-xs font-medium text-slate-800">
                  Recommandation: {section.recommendation}
                </p>
              </div>
            ))}
            {generated.sections.length > 3 ? (
              <p className="text-xs text-slate-500">
                + {generated.sections.length - 3} section(s) supplementaire(s)
              </p>
            ) : null}
          </div>

          <button
            type="button"
            disabled={loading}
            onClick={handleGenerate}
            className="w-full rounded-md bg-slate-900 px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
          >
            {loading ? "Traitement en cours..." : "Generer le rapport complet + PDF"}
          </button>

          {lastSavedAt ? (
            <p className="text-xs text-slate-500">Brouillon local enregistre a {lastSavedAt}</p>
          ) : null}
          {status ? <p className="text-sm text-emerald-700">{status}</p> : null}
          {error ? <p className="text-sm text-red-600">{error}</p> : null}
        </div>
      </div>
    </div>
  );
}
