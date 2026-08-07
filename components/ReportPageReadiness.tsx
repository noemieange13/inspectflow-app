"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

import InspectionAgentBar from "@/components/InspectionAgentBar";
import ReportReadinessCard from "@/components/ReportReadinessCard";
import QcCertificationStatusPanel from "@/components/QcCertificationStatusPanel";
import {
  getComplianceExportMode,
  parseCoverV1FromUnknown,
} from "@/lib/inspectionCoverPayload";
import type { CoverReadinessResult } from "@/lib/reportReadiness";
import { evaluateCoverReadiness, REPORT_READINESS_ZONE_ID } from "@/lib/reportReadiness";
import { emitProductEvent } from "@/lib/productTelemetry";
import { incrementSessionStepsResolved } from "@/lib/reportFunnelTiming";
import { parsePayloadEntries } from "@/lib/qcSystemSections";
import { QC_CERTIFICATION_RULESET_ID } from "@/lib/qcCertificationCheck";
import { generateQcAiSuggestions } from "@/lib/qcAiSuggestions";
import { flushQcEventQueue, emitQcTelemetry } from "@/lib/qcTelemetry";
import {
  buildSuggestionQcContext,
  qcStatsLookupKey,
} from "@/lib/qcCopilotContext";
import type {
  QcAiSuggestionStatsV3Row,
} from "@/lib/qcSuggestionScoring";

/**
 * Bandeau readiness sur `/report/[id]` — même logique que la couverture, liens vers les ancres #resume-*.
 * `?fixStep=1` (1-based) synchronise le mode guidé au retour sur la page.
 */
export default function ReportPageReadiness({
  reportId,
  coverRaw,
  reportPayload,
  photoCount,
  couvertureBaseHref,
  reportSelfHref,
  viewerAccessToken,
  simpleMode = false,
}: {
  reportId: string;
  coverRaw: unknown;
  /** Extrait serveur — `entries`, `photos_coverage_v1`, etc. */
  reportPayload?: Record<string, unknown> | null;
  photoCount?: number;
  couvertureBaseHref: string;
  /** URL de cette page rapport (jeton inclus) — ancres `#report-photos-zone`, etc. */
  reportSelfHref: string;
  /** Jeton viewer — requis pour enregistrer une reco. IA via Copilot. */
  viewerAccessToken?: string;
  /** Mode simplifié: masque les panneaux avancés (agent + QC détaillé). */
  simpleMode?: boolean;
}) {
  const searchParams = useSearchParams();
  const pathname = usePathname();
  const router = useRouter();

  const initialGuidedStepZero = useMemo(() => {
    const raw = searchParams.get("fixStep");
    if (!raw) return null;
    const n = parseInt(raw, 10);
    if (!Number.isFinite(n) || n < 1) return null;
    return n - 1;
  }, [searchParams]);

  const onGuidedStepCommit = useCallback(
    (stepZero: number) => {
      emitProductEvent("readiness_guided_step", { fixStep: stepZero + 1 });
      const params = new URLSearchParams(searchParams.toString());
      params.set("fixStep", String(stepZero + 1));
      router.replace(`${pathname}?${params.toString()}`, { scroll: false });
    },
    [router, pathname, searchParams],
  );

  const onFixConformiteQc = useCallback(() => {
    emitQcTelemetry("qc_certification_fix_clicked", {
      source: "report_page",
      report_id: reportId,
      ruleset_id: QC_CERTIFICATION_RULESET_ID,
      access_token: viewerAccessToken,
    });
    const params = new URLSearchParams(searchParams.toString());
    params.set("fixStep", "1");
    router.replace(`${pathname}?${params.toString()}`, { scroll: false });
    window.setTimeout(() => {
      document.getElementById(REPORT_READINESS_ZONE_ID)?.scrollIntoView({
        behavior: "smooth",
        block: "start",
      });
    }, 80);
  }, [router, pathname, searchParams, reportId, viewerAccessToken]);

  /** Recharge le payload serveur (readiness à jour) au retour sur l’onglet / la fenêtre — sans WebSocket. */
  const refreshDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  /** Dernière entrée en `document.hidden` (sélecteur de fichiers natif, impression, etc.). */
  const tabHiddenAtRef = useRef<number | null>(null);
  /** Jusqu’à quand ignorer un `focus` déclenché juste après une courte disparition (ex. dialogue fichier). */
  const skipFocusRefreshUntilRef = useRef<number>(0);
  const scheduleReadinessRefresh = useCallback(
    (source: "visibilitychange" | "focus") => {
      if (refreshDebounceRef.current) clearTimeout(refreshDebounceRef.current);
      const shouldLogTrigger =
        source === "visibilitychange" || Math.random() < 0.25;
      if (shouldLogTrigger) {
        emitProductEvent("readiness_refresh_triggered", { source });
      }
      refreshDebounceRef.current = setTimeout(() => {
        router.refresh();
        refreshDebounceRef.current = null;
      }, 400);
    },
    [router],
  );

  const [readinessRingPulse, setReadinessRingPulse] = useState(false);

  useEffect(() => {
    const onVisibility = () => {
      if (document.visibilityState === "hidden") {
        tabHiddenAtRef.current = Date.now();
        return;
      }
      if (document.visibilityState !== "visible") return;
      const hiddenAt = tabHiddenAtRef.current;
      tabHiddenAtRef.current = null;
      const hiddenMs = hiddenAt != null ? Date.now() - hiddenAt : null;
      // Fenêtre très brièvement « cachée » (Chrome + sélecteur de fichiers Windows) : ne pas
      // router.refresh() — sinon le compositeur rapport remonte et annule les uploads en cours.
      if (hiddenMs != null && hiddenMs < 1800) {
        skipFocusRefreshUntilRef.current = Date.now() + 2000;
        return;
      }
      setReadinessRingPulse(true);
      window.setTimeout(() => setReadinessRingPulse(false), 1400);
      scheduleReadinessRefresh("visibilitychange");
    };
    const onWindowFocus = () => {
      if (document.visibilityState !== "visible") return;
      if (Date.now() < skipFocusRefreshUntilRef.current) return;
      scheduleReadinessRefresh("focus");
    };
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("focus", onWindowFocus);
    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("focus", onWindowFocus);
      if (refreshDebounceRef.current) clearTimeout(refreshDebounceRef.current);
    };
  }, [scheduleReadinessRefresh]);

  const { result, ackAt, coverParsed } = useMemo(() => {
    const cover = coverRaw != null ? parseCoverV1FromUnknown(coverRaw) : null;
    const ack = cover?.readiness_ack_v1?.acknowledged_at?.trim() ?? null;
    const reportEntries = parsePayloadEntries(reportPayload?.entries);
    const pcv = reportPayload?.photos_coverage_v1;
    let photosCoverageByZone: Partial<Record<string, number>> | null = null;
    if (pcv && typeof pcv === "object" && pcv !== null && "by_zone" in pcv) {
      const bz = (pcv as { by_zone?: unknown }).by_zone;
      if (bz && typeof bz === "object" && !Array.isArray(bz)) {
        const acc: Partial<Record<string, number>> = {};
        for (const [k, v] of Object.entries(bz as Record<string, unknown>)) {
          if (typeof v === "number" && v >= 0) acc[k] = v;
        }
        photosCoverageByZone = Object.keys(acc).length > 0 ? acc : null;
      }
    }
    return {
      result: evaluateCoverReadiness(cover, {
        photoCount: photoCount ?? 0,
        reportEntries,
        photosCoverageByZone,
        reportPayload: reportPayload ?? null,
      }),
      ackAt: ack,
      coverParsed: cover,
    };
  }, [coverRaw, photoCount, reportPayload]);

  const qcCertSignature = useMemo(() => {
    const codes = [
      ...result.blocking.map((b) => b.code),
      ...result.warnings.map((w) => w.code),
    ].join("\0");
    return `${result.gate}|${codes}`;
  }, [result]);

  const [suggestionStatsV3, setSuggestionStatsV3] = useState<
    ReadonlyMap<string, QcAiSuggestionStatsV3Row>
  >(() => new Map());

  const [qcSessionId] = useState(() =>
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : `sess-${Date.now().toString(36)}`,
  );

  useEffect(() => {
    const id = window.setTimeout(() => setSuggestionStatsV3(new Map()), 0);
    return () => window.clearTimeout(id);
  }, [reportId]);

  useEffect(() => {
    void flushQcEventQueue();
  }, [reportId]);

  const prelimAiSuggestions = useMemo(() => {
    if (!coverParsed || getComplianceExportMode(coverParsed) !== "QC_2027") return [];
    return generateQcAiSuggestions({
      blocking: result.blocking,
      warnings: result.warnings,
      reportPayload: reportPayload ?? null,
      checklist: result.qcCertification ?? null,
    });
  }, [coverParsed, result.blocking, result.warnings, reportPayload, result.qcCertification]);

  const lookupSig = useMemo(
    () =>
      prelimAiSuggestions
        .map((s) =>
          qcStatsLookupKey(
            s.statsKey,
            buildSuggestionQcContext(s, reportPayload ?? null, coverParsed ?? null),
          ),
        )
        .join("\0"),
    [prelimAiSuggestions, reportPayload, coverParsed],
  );

  useEffect(() => {
    if (!lookupSig) return;
    const lookups = prelimAiSuggestions.map((s) => ({
      key: s.statsKey,
      context: buildSuggestionQcContext(s, reportPayload ?? null, coverParsed ?? null),
    }));
    if (lookups.length === 0) return;
    let cancelled = false;
    fetch("/api/qc-ai-suggestion-stats", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ lookups }),
    })
      .then(
        (r) =>
          r.json() as Promise<{
            ok?: boolean;
            results?: (QcAiSuggestionStatsV3Row | null)[];
          }>,
      )
      .then((data) => {
        if (cancelled || !data.ok || !data.results) return;
        const m = new Map<string, QcAiSuggestionStatsV3Row>();
        data.results.forEach((row, i) => {
          if (!row) return;
          const s = prelimAiSuggestions[i];
          if (!s) return;
          const lk = qcStatsLookupKey(
            s.statsKey,
            buildSuggestionQcContext(s, reportPayload ?? null, coverParsed ?? null),
          );
          m.set(lk, row);
        });
        setSuggestionStatsV3(m);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [lookupSig, prelimAiSuggestions, reportPayload, coverParsed]);

  const aiSuggestions = useMemo(() => {
    if (!coverParsed || getComplianceExportMode(coverParsed) !== "QC_2027") return [];
    return generateQcAiSuggestions({
      blocking: result.blocking,
      warnings: result.warnings,
      reportPayload: reportPayload ?? null,
      checklist: result.qcCertification ?? null,
      statsV3ByLookupKey: suggestionStatsV3,
      cover: coverParsed ?? null,
    });
  }, [
    coverParsed,
    result.blocking,
    result.warnings,
    reportPayload,
    result.qcCertification,
    suggestionStatsV3,
  ]);

  const reportUiLang = reportPayload?.language === "en" ? "en" : "fr";

  useEffect(() => {
    if (!coverParsed || getComplianceExportMode(coverParsed) !== "QC_2027") return;
    const errCount = result.blocking.length;
    const warnCount = result.warnings.length;
    emitQcTelemetry("qc_certification_checked", {
      is_valid: errCount === 0,
      error_count: errCount,
      warning_count: warnCount,
      gate: result.gate,
      report_id: reportId,
      ruleset_id: QC_CERTIFICATION_RULESET_ID,
      access_token: viewerAccessToken,
    });
    if (errCount > 0) {
      emitQcTelemetry("qc_certification_failed", {
        errors: result.blocking.map((b) => b.code),
        report_id: reportId,
        ruleset_id: QC_CERTIFICATION_RULESET_ID,
        access_token: viewerAccessToken,
      });
    }
  }, [coverParsed, qcCertSignature, result, reportId, viewerAccessToken]);

  /** Snapshot précédent pour codes résolus après refresh + toast bref. */
  const prevResultRef = useRef<CoverReadinessResult | null>(null);
  const [resolvedToast, setResolvedToast] = useState<string[] | null>(null);

  useEffect(() => {
    const prev = prevResultRef.current;
    prevResultRef.current = result;
    if (!prev) return;

    const prevCodes = new Set([
      ...prev.blocking.map((b) => b.code),
      ...prev.warnings.map((w) => w.code),
    ]);
    const currCodes = new Set([
      ...result.blocking.map((b) => b.code),
      ...result.warnings.map((w) => w.code),
    ]);
    const resolvedCodes = [...prevCodes].filter((c) => !currCodes.has(c));
    if (resolvedCodes.length === 0) return;

    const allPrevIssues = [...prev.blocking, ...prev.warnings];
    const labels = resolvedCodes.map((code) => {
      const issue = allPrevIssues.find((x) => x.code === code);
      return issue?.messageFr ?? code;
    });

    emitProductEvent("readiness_step_completed", {
      codes: resolvedCodes,
      count: resolvedCodes.length,
    });
    incrementSessionStepsResolved(reportId, resolvedCodes.length);

    setResolvedToast(labels);
    const t = window.setTimeout(() => setResolvedToast(null), 900);
    return () => clearTimeout(t);
  }, [result, reportId]);

  return (
    <div
      id={REPORT_READINESS_ZONE_ID}
      className={`mb-6 scroll-mt-24 rounded-xl transition-shadow duration-300 ${
        readinessRingPulse ? "ring-2 ring-emerald-400/70 ring-offset-2 ring-offset-slate-50" : ""
      }`}
    >
      {!simpleMode ? (
        <InspectionAgentBar
          reportId={reportId}
          viewerAccessToken={viewerAccessToken}
        />
      ) : null}
      <p className="mb-2 text-xs font-medium uppercase tracking-wide text-slate-500">
        État avant export PDF
      </p>
      <ul className="mb-3 space-y-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800">
        <li className="flex items-start gap-2">
          <span aria-hidden>{result.blocking.some((b) => ["no_cover", "requerant", "adresse", "condition", "description"].includes(b.code)) ? "❌" : "✔"}</span>
          <span>
            <strong>Couverture</strong> — identité, propriété, description &amp; condition
          </span>
        </li>
        {coverParsed && getComplianceExportMode(coverParsed) === "QC_2027" ? (
          <li className="flex items-start gap-2">
            <span aria-hidden>
              {result.blocking.some((b) => b.code.startsWith("qc_")) ? "❌" : "✔"}
            </span>
            <span>
              <strong>Grille QC 2027</strong> — constats, photos, limitations
            </span>
          </li>
        ) : null}
        <li className="flex items-start gap-2">
          <span aria-hidden>{result.gate === "ready" ? "✔" : "❌"}</span>
          <span>
            <strong>Export PDF</strong> — rapport certifié (aucun blocage, avertissements accusés si besoin)
          </span>
        </li>
      </ul>
      {!simpleMode &&
      coverParsed &&
      getComplianceExportMode(coverParsed) === "QC_2027" &&
      result.qcCertification ? (
        <QcCertificationStatusPanel
          checklist={result.qcCertification}
          onFixConformite={onFixConformiteQc}
          suggestions={aiSuggestions}
          suggestionStatsByLookup={suggestionStatsV3}
          coverParsed={coverParsed ?? null}
          qcSessionId={qcSessionId}
          reportPayload={reportPayload ?? null}
          reportId={reportId}
          viewerAccessToken={viewerAccessToken}
          reportLanguage={reportUiLang}
        />
      ) : null}
      {resolvedToast && resolvedToast.length > 0 ? (
        <div
          className="mb-3 rounded-lg border border-emerald-300 bg-emerald-50 px-3 py-2 text-xs font-medium text-emerald-950 shadow-sm transition-opacity duration-300"
          role="status"
        >
          ✓ Résolu : {resolvedToast.join(" · ")}
        </div>
      ) : null}
      <ReportReadinessCard
        result={result}
        compact={simpleMode ? false : true}
        ackAt={ackAt}
        couvertureBaseHref={couvertureBaseHref}
        reportSelfHref={reportSelfHref}
        guidedMode={!simpleMode}
        initialGuidedStepZero={initialGuidedStepZero}
        onGuidedStepCommit={onGuidedStepCommit}
      />
      {result.gate === "ready" ? (
        <p
          className="mt-3 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm font-medium text-emerald-950"
          role="status"
        >
          ✅ Tous les points obligatoires sont couverts — vous pouvez lancer la génération du PDF dans la
          section ci-dessous.
        </p>
      ) : (
        <p className="mt-2 text-xs text-slate-500">
          Modifiez la couverture pour corriger les points bloquants — les liens ci-dessus ouvrent la bonne
          section. Astuce : l’étape du mode guidé est mémorisée dans l’URL (
          <code className="rounded bg-slate-100 px-1">?fixStep=1</code>, 1 = première étape).
        </p>
      )}
    </div>
  );
}
