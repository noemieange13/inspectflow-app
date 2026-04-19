"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

import type { QcCertificationChecklist } from "@/lib/qcCertificationCheck";
import { QC_CERTIFICATION_RULESET_ID } from "@/lib/qcCertificationCheck";
import type { InspectionCoverPayloadV1 } from "@/lib/inspectionCoverPayload";
import type { QcAiSuggestion } from "@/lib/qcAiSuggestions";
import {
  buildQcReportContext,
  buildSuggestionQcContext,
  qcStatsLookupKey,
} from "@/lib/qcCopilotContext";
import { emitQcTelemetry } from "@/lib/qcTelemetry";
import {
  computeFinalScore,
  shouldAutoApplyContextual,
  type QcAiSuggestionStatsV3Row,
} from "@/lib/qcSuggestionScoring";

function Row({ ok, label }: { ok: boolean; label: string }) {
  return (
    <li className="flex items-start gap-2 text-xs text-slate-800">
      <span className="shrink-0 font-mono" aria-hidden>
        {ok ? "✔" : "✗"}
      </span>
      <span className={ok ? "" : "font-medium text-slate-900"}>{label}</span>
    </li>
  );
}

export default function QcCertificationStatusPanel({
  checklist,
  onFixConformite,
  suggestions,
  suggestionStatsByLookup,
  coverParsed,
  qcSessionId,
  reportPayload,
  reportId,
  viewerAccessToken,
  reportLanguage,
}: {
  checklist: QcCertificationChecklist;
  onFixConformite: () => void;
  suggestions: QcAiSuggestion[];
  /** Stats V3 par `qcStatsLookupKey(key, context)`. */
  suggestionStatsByLookup?: ReadonlyMap<string, QcAiSuggestionStatsV3Row>;
  coverParsed: InspectionCoverPayloadV1 | null;
  qcSessionId: string;
  reportPayload: Record<string, unknown> | null | undefined;
  reportId: string;
  viewerAccessToken?: string;
  reportLanguage: "fr" | "en";
}) {
  const router = useRouter();
  const id = checklist.identification;
  const idOk =
    id.address &&
    id.client &&
    id.inspector &&
    id.license &&
    id.date &&
    id.weather;
  const sysOk = checklist.systemsSeven && checklist.systemsRecommendations;
  const photoOk = checklist.photosDeclared && checklist.photosSufficient;

  const suggestionSig = useMemo(() => suggestions.map((s) => s.id).join("|"), [suggestions]);

  useEffect(() => {
    if (suggestions.length === 0) return;
    emitQcTelemetry("qc_ai_suggestion_shown", {
      count: suggestions.length,
      stats_entries: suggestions.map((s) => ({
        key: s.statsKey,
        context: buildSuggestionQcContext(s, reportPayload, coverParsed),
      })),
      codes: [...new Set(suggestions.map((s) => s.code))],
      report_id: reportId,
      ruleset_id: QC_CERTIFICATION_RULESET_ID,
      access_token: viewerAccessToken,
      session_id: qcSessionId,
    });
  }, [suggestionSig, suggestions, reportId, viewerAccessToken, reportPayload, coverParsed, qcSessionId]);

  const [loadingId, setLoadingId] = useState<string | null>(null);
  const [generated, setGenerated] = useState<Record<string, string>>({});
  const [undoVersionId, setUndoVersionId] = useState<string | null>(null);

  useEffect(() => {
    const onUndoAvail = (e: Event) => {
      const ce = e as CustomEvent<{ version_id?: string; report_id?: string }>;
      if (ce.detail?.report_id === reportId && typeof ce.detail.version_id === "string") {
        setUndoVersionId(ce.detail.version_id);
      }
    };
    window.addEventListener("inspectflow:qc_undo_available", onUndoAvail);
    return () => window.removeEventListener("inspectflow:qc_undo_available", onUndoAvail);
  }, [reportId]);

  const scrollToAnchor = useCallback((focusId?: string) => {
    if (!focusId) return;
    document.getElementById(focusId)?.scrollIntoView({ behavior: "smooth", block: "center" });
  }, []);

  const runGenerate = useCallback(
    async (s: QcAiSuggestion) => {
      if (s.sectionIndex == null) return;
      const sectionsRaw = reportPayload?.sections;
      const sections = Array.isArray(sectionsRaw) ? sectionsRaw : [];
      const row = sections[s.sectionIndex] as Record<string, unknown> | undefined;
      if (!row) return;
      setLoadingId(s.id);
      try {
        const res = await fetch("/api/qc-copilot-recommendation", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            section_title: row.title,
            observation: row.observation,
            analysis: row.analysis,
            severity_label: row.severity,
            language: reportLanguage,
          }),
        });
        const data = (await res.json()) as { ok?: boolean; recommendation?: string; error?: string };
        if (!res.ok || !data.ok || !data.recommendation?.trim()) {
          emitQcTelemetry("qc_ai_suggestion_rejected", {
            stats_key: s.statsKey,
            code: s.code,
            system: s.system,
            confidence: s.confidence,
            reason: data.error ?? "api",
            report_id: reportId,
            ruleset_id: QC_CERTIFICATION_RULESET_ID,
            access_token: viewerAccessToken,
            session_id: qcSessionId,
            qc_context: buildSuggestionQcContext(s, reportPayload, coverParsed),
          });
          return;
        }
        const text = data.recommendation!.trim();
        setGenerated((prev) => ({ ...prev, [s.id]: text }));
        const sugCtx = buildSuggestionQcContext(s, reportPayload, coverParsed);
        const lk = qcStatsLookupKey(s.statsKey, sugCtx);
        const st = suggestionStatsByLookup?.get(lk);
        const reportCtx = buildQcReportContext(coverParsed);
        const final = computeFinalScore({
          statsV3: st,
          confidence: s.confidence,
          suggestionCtx: sugCtx,
          reportCtx,
        });
        if (shouldAutoApplyContextual({ statsV3: st, confidence: s.confidence, finalScore: final })) {
          window.dispatchEvent(
            new CustomEvent("inspectflow:qc_apply_recommendation", {
              detail: {
                sectionIndex: s.sectionIndex,
                recommendation: text,
                statsKey: s.statsKey,
                saveUndoSnapshot: true,
              },
            }),
          );
        }
      } finally {
        setLoadingId(null);
      }
    },
    [
      reportPayload,
      reportLanguage,
      reportId,
      viewerAccessToken,
      suggestionStatsByLookup,
      coverParsed,
      qcSessionId,
    ],
  );

  const applyRecommendation = useCallback((s: QcAiSuggestion, text: string, saveUndo?: boolean) => {
    if (s.sectionIndex == null || !text.trim()) return;
    window.dispatchEvent(
      new CustomEvent("inspectflow:qc_apply_recommendation", {
        detail: {
          sectionIndex: s.sectionIndex,
          recommendation: text.trim(),
          statsKey: s.statsKey,
          ...(saveUndo ? { saveUndoSnapshot: true as const } : {}),
        },
      }),
    );
  }, []);

  const runUndo = useCallback(async () => {
    if (!undoVersionId || !viewerAccessToken) return;
    const res = await fetch("/api/report-versions/restore", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        report_id: reportId,
        access_token: viewerAccessToken,
        version_id: undoVersionId,
      }),
    });
    if (res.ok) {
      setUndoVersionId(null);
      router.refresh();
    }
  }, [undoVersionId, viewerAccessToken, reportId, router]);

  return (
    <div
      className="mb-4 rounded-xl border border-indigo-200 bg-indigo-50/90 px-4 py-3 text-slate-900 shadow-sm"
      role="region"
      aria-label="Statut conformité QC 2027"
    >
      <p className="text-xs font-semibold uppercase tracking-wide text-indigo-900">
        Conformité QC 2027
      </p>
      <ul className="mt-2 space-y-1.5">
        <Row ok={idOk} label="Identification (adresse, client, inspecteur, licence, date, météo)" />
        <Row ok={checklist.limitations} label="Limitations (auto ou manuel + clauses types)" />
        <Row ok={sysOk} label="Sept systèmes — constats et recommandations (gravité)" />
        <Row ok={photoOk} label="Couverture photo par système (seuils)" />
        <Row ok={checklist.legalProfile} label="Profil conformité versionné (clauses_pack_version)" />
        <Row ok={checklist.signature} label="Signature — nom et licence inspecteur" />
      </ul>

      {suggestions.length > 0 ? (
        <div className="mt-4 rounded-lg border border-violet-200 bg-white/90 p-3">
          <p className="text-xs font-semibold text-violet-950">QC Copilot — suggestions</p>
          <ul className="mt-2 space-y-3">
            {suggestions.map((s) => {
              const sugCtx = buildSuggestionQcContext(s, reportPayload, coverParsed);
              const lk = qcStatsLookupKey(s.statsKey, sugCtx);
              const st = suggestionStatsByLookup?.get(lk);
              const reportCtx = buildQcReportContext(coverParsed);
              const final = computeFinalScore({
                statsV3: st,
                confidence: s.confidence,
                suggestionCtx: sugCtx,
                reportCtx,
              });
              const highImpact = shouldAutoApplyContextual({
                statsV3: st,
                confidence: s.confidence,
                finalScore: final,
              });
              return (
              <li
                key={s.id}
                className="rounded-md border border-violet-100 bg-violet-50/80 px-2.5 py-2 text-xs text-violet-950"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="font-medium">{s.message}</span>
                  <span className="flex flex-wrap items-center gap-1">
                    {highImpact ? (
                      <span className="rounded bg-emerald-100 px-1.5 py-0.5 text-[10px] font-medium text-emerald-900">
                        Fort impact terrain
                      </span>
                    ) : null}
                    <span className="rounded bg-white/80 px-1.5 py-0.5 font-mono text-[10px] text-slate-600">
                      conf. {(s.confidence * 100).toFixed(0)}%
                    </span>
                  </span>
                </div>
                <div className="mt-2 flex flex-wrap gap-2">
                  {s.focusId ? (
                    <button
                      type="button"
                      className="rounded-md bg-slate-800 px-2.5 py-1.5 text-[11px] font-semibold text-white hover:bg-slate-900"
                      onClick={() => {
                        scrollToAnchor(s.focusId);
                        emitQcTelemetry("qc_ai_suggestion_applied", {
                          stats_key: s.statsKey,
                          code: s.code,
                          system: s.system,
                          confidence: s.confidence,
                          report_id: reportId,
                          ruleset_id: QC_CERTIFICATION_RULESET_ID,
                          access_token: viewerAccessToken,
                          session_id: qcSessionId,
                          qc_context: buildSuggestionQcContext(s, reportPayload, coverParsed),
                          interaction: "navigate",
                        });
                      }}
                    >
                      {s.navigateActionLabel ?? s.actionLabel ?? "Voir le bloc"}
                    </button>
                  ) : null}
                  {s.autoFix?.kind === "section_recommendation" && s.sectionIndex != null ? (
                    <>
                      <button
                        type="button"
                        disabled={loadingId === s.id}
                        className="rounded-md bg-violet-700 px-2.5 py-1.5 text-[11px] font-semibold text-white hover:bg-violet-800 disabled:opacity-50"
                        onClick={() => void runGenerate(s)}
                      >
                        {loadingId === s.id ? "IA…" : "Générer (IA)"}
                      </button>
                      {generated[s.id] ? (
                      <button
                        type="button"
                        className="rounded-md border border-emerald-600 bg-emerald-50 px-2.5 py-1.5 text-[11px] font-semibold text-emerald-900 hover:bg-emerald-100"
                        onClick={() => applyRecommendation(s, generated[s.id]!, false)}
                      >
                        Appliquer au rapport
                      </button>
                      ) : null}
                    </>
                  ) : null}
                  <button
                    type="button"
                    className="rounded-md border border-slate-300 bg-white px-2 py-1.5 text-[11px] text-slate-700 hover:bg-slate-50"
                    onClick={() => {
                      emitQcTelemetry("qc_ai_suggestion_rejected", {
                        stats_key: s.statsKey,
                        code: s.code,
                        system: s.system,
                        confidence: s.confidence,
                        report_id: reportId,
                        ruleset_id: QC_CERTIFICATION_RULESET_ID,
                        access_token: viewerAccessToken,
                        session_id: qcSessionId,
                        qc_context: buildSuggestionQcContext(s, reportPayload, coverParsed),
                      });
                    }}
                  >
                    Ignorer
                  </button>
                </div>
                {generated[s.id] ? (
                  <p className="mt-2 whitespace-pre-wrap rounded border border-dashed border-violet-200 bg-white p-2 text-[11px] leading-snug text-slate-800">
                    {generated[s.id]}
                  </p>
                ) : null}
              </li>
            );
            })}
          </ul>
          {undoVersionId && viewerAccessToken ? (
            <div className="mt-3 flex flex-wrap items-center gap-2 rounded-md border border-amber-200 bg-amber-50/90 px-2 py-2 text-[11px] text-amber-950">
              <span>Reco. appliquée automatiquement — vous pouvez revenir à l’état précédent.</span>
              <button
                type="button"
                className="rounded bg-amber-800 px-2 py-1 font-semibold text-white hover:bg-amber-900"
                onClick={() => void runUndo()}
              >
                Annuler
              </button>
            </div>
          ) : null}
        </div>
      ) : null}

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <button
          type="button"
          className="rounded-lg bg-indigo-900 px-3 py-2 text-xs font-semibold text-white hover:bg-indigo-800"
          onClick={onFixConformite}
        >
          Corriger pour conformité
        </button>
        <span className="text-[11px] text-indigo-950/80">
          Mode guidé (étape 1) — jeton requis pour appliquer les reco. IA en base
          {viewerAccessToken ? "" : " (connectez le lien complet du rapport)"}.
        </span>
      </div>
    </div>
  );
}
