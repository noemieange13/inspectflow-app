"use client";



import { useCallback, useEffect, useMemo, useState } from "react";

import { useRouter } from "next/navigation";



import FastReportReviewPanel from "@/components/FastReportReviewPanel";
import FindingReviewCard from "@/components/FindingReviewCard";

import InspectionCompletePanel from "@/components/InspectionCompletePanel";

import ReviewProgress from "@/components/ReviewProgress";

import { isFieldValidationMode } from "@/lib/fieldDevMode";

import {
  publishFieldTestSnapshot,
  recordAiFindingsProposed,
  recordFieldEvent,
  recordFindingDecision,
} from "@/lib/fieldMetrics";

import {

  acceptFindingEntry,

  buildFindingDisplays,

  buildFindingsReviewSaveBody,

  buildPhotoCountByObservationId,

  buildPrimaryPhotoByObservationId,

  deriveReviewDecisionsFromPayload,

  ignoreFindingEntry,

  isReviewSessionComplete,

  modifyFindingEntry,

  parseEntriesFromPayload,

  resolveReportJurisdiction,

  resolveReportLanguage,

  reviewedIdsFromDecisions,

  type FindingDisplay,

  type FindingReviewStatus,

} from "@/lib/findingsReview";

import {
  emptyFindingsMessage,
  humanInspectorError,
  reviewContextualHelp,
} from "@/lib/commercialCopy8g";

import type { ReportEntryInput } from "@/lib/reportNarrative";

import {

  computeReviewProgress,

  countDecisions,

  upsertReviewDecision,

  verifiedCount,

} from "@/lib/reviewProgress";

import {
  autoAcceptedObservationIds,
  filterReviewOnlyFindings,
  type FastReportReadiness,
} from "@/lib/fast_report_engine";
import type { ReportServerData } from "@/lib/reportViewerServer";

type Phase = "intro" | "cards" | "complete";

type Props = {
  reportId: string;
  viewerToken?: string;
  initialData?: ReportServerData;
  onBackToField: () => void;
  onGoToDelivery: () => void;
  onAdvancedEdit: () => void;
  /** Phase 8K — smart review: exceptions only. */
  mode?: "full" | "fast";
  fastReadiness?: FastReportReadiness | null;
};

export default function InspectionReviewWorkspace({
  reportId,
  viewerToken,
  initialData,
  onBackToField,
  onGoToDelivery,
  onAdvancedEdit,
  mode = "full",
  fastReadiness = null,
}: Props) {

  const router = useRouter();

  const payload =

    initialData?.payload && typeof initialData.payload === "object"

      ? initialData.payload

      : {};



  const language = resolveReportLanguage(payload);

  const jurisdiction = resolveReportJurisdiction(payload);



  const [entries, setEntries] = useState<ReportEntryInput[]>(() =>

    parseEntriesFromPayload(payload),

  );

  const [decisions, setDecisions] = useState<Map<string, FindingReviewStatus>>(() =>

    deriveReviewDecisionsFromPayload(payload, parseEntriesFromPayload(payload)),

  );

  const reviewedIds = useMemo(() => reviewedIdsFromDecisions(decisions), [decisions]);

  const [photoByObs, setPhotoByObs] = useState<Map<string, string>>(() => new Map());

  const [photoCountByObs, setPhotoCountByObs] = useState<Map<string, number>>(() => new Map());

  const [phase, setPhase] = useState<Phase>(() => {

    const initialEntries = parseEntriesFromPayload(payload);

    const initialDecisions = deriveReviewDecisionsFromPayload(payload, initialEntries);

    const total = initialEntries.length;

    const verified = countDecisions(initialDecisions);

    if (total > 0 && verified >= total) return "complete";

    if (verified > 0) return "cards";

    return "intro";

  });

  const [sessionTotal, setSessionTotal] = useState(() => parseEntriesFromPayload(payload).length);

  const [busy, setBusy] = useState(false);

  const [error, setError] = useState<string | null>(null);



  useEffect(() => {

    const token = viewerToken?.trim();

    if (!token) return;

    let cancelled = false;

    void (async () => {

      try {

        const res = await fetch("/api/report-photos-for-editor", {

          method: "POST",

          headers: { "Content-Type": "application/json" },

          body: JSON.stringify({ report_id: reportId, access_token: token }),

        });

        const body = (await res.json().catch(() => null)) as {

          success?: boolean;

          photos?: Array<{ id: string; url: string | null; observation_id?: string | null }>;

        } | null;

        if (cancelled || !res.ok || !body?.success || !Array.isArray(body.photos)) return;

        setPhotoByObs(buildPrimaryPhotoByObservationId(body.photos));

        setPhotoCountByObs(buildPhotoCountByObservationId(body.photos));

      } catch {

        /* ignore */

      }

    })();

    return () => {

      cancelled = true;

    };

  }, [reportId, viewerToken]);



  const displays = useMemo(

    () =>

      buildFindingDisplays(

        entries,

        language,

        jurisdiction,

        photoByObs,

        photoCountByObs,

        reviewedIds,

      ),

    [entries, language, jurisdiction, photoByObs, photoCountByObs, reviewedIds],

  );



  const progress = useMemo(

    () => computeReviewProgress(decisions, sessionTotal || displays.length),

    [decisions, sessionTotal, displays.length],

  );



  const verified = verifiedCount(progress);



  useEffect(() => {

    if (!isFieldValidationMode()) return;

    publishFieldTestSnapshot({

      aiFindingsProposed: sessionTotal || displays.length,

      aiFindingsAccepted: progress.accepted,

      aiFindingsModified: progress.edited,

      aiFindingsIgnored: progress.ignored,

    });

  }, [sessionTotal, displays.length, progress.accepted, progress.edited, progress.ignored]);



  useEffect(() => {

    if (!isFieldValidationMode()) return;

    if (phase === "complete" || progress.complete) {

      publishFieldTestSnapshot({ reviewComplete: true });

      recordFieldEvent("review_complete");

    }

  }, [phase, progress.complete]);



  useEffect(() => {

    if (!isFieldValidationMode() || !error) return;

    recordFieldEvent("visible_error");

  }, [error]);



  const isFastMode = mode === "fast" && fastReadiness != null;

  const reviewDisplays = useMemo(() => {
    if (isFastMode && fastReadiness) {
      return filterReviewOnlyFindings(displays, fastReadiness);
    }
    return displays;
  }, [displays, fastReadiness, isFastMode]);

  const pendingDisplays = useMemo(
    () => reviewDisplays.filter((d) => d.id && !reviewedIds.has(d.id)),
    [reviewDisplays, reviewedIds],
  );

  const currentFinding: FindingDisplay | null =
    phase === "cards" ? (pendingDisplays[0] ?? null) : null;



  const persistEntries = useCallback(

    async (nextEntries: ReportEntryInput[]) => {

      const token = viewerToken?.trim();

      if (!token) {

        setError(

          language === "en"

            ? "Missing access link."

            : "Lien d'accès manquant.",

        );

        return false;

      }

      if (nextEntries.length === 0) {

        setError(

          language === "en"

            ? "At least one finding must remain."

            : "Au moins un constat doit rester.",

        );

        return false;

      }

      setBusy(true);

      setError(null);

      try {

        const body = buildFindingsReviewSaveBody(reportId, token, payload, nextEntries);

        const res = await fetch("/api/report-content", {

          method: "POST",

          headers: { "Content-Type": "application/json" },

          body: JSON.stringify(body),

        });

        const result = (await res.json().catch(() => null)) as {

          success?: boolean;

          error?: string;

        } | null;

        if (!res.ok || !result?.success) {

          console.error("REVIEW_SAVE:", result?.error ?? res.status);

          setError(

            humanInspectorError({

              language,

              status: res.status,

              raw: result?.error,

            }),

          );

          return false;

        }

        setEntries(nextEntries);

        router.refresh();

        return true;

      } catch (e) {

        console.error("REVIEW_SAVE:", e);

        setError(humanInspectorError({ language, kind: "network" }));

        return false;

      } finally {

        setBusy(false);

      }

    },

    [language, payload, reportId, router, viewerToken],

  );



  const markReviewedAndAdvance = useCallback(

    async (

      observationId: string,

      decision: Exclude<FindingReviewStatus, "pending">,

      nextEntries: ReportEntryInput[],

    ) => {

      if (nextEntries.length === 0) {

        setError(

          language === "en"

            ? "Cannot remove the last finding."

            : "Impossible de retirer le dernier constat.",

        );

        return;

      }

      const ok = await persistEntries(nextEntries);

      if (!ok) return;

      if (isFieldValidationMode()) {

        recordFindingDecision(decision);

      }

      const nextDecisions = upsertReviewDecision(decisions, observationId, decision);

      setDecisions(nextDecisions);

      const newReviewed = reviewedIdsFromDecisions(nextDecisions);

      const nextDisplays = buildFindingDisplays(

        nextEntries,

        language,

        jurisdiction,

        photoByObs,

        photoCountByObs,

        newReviewed,

      );

      const remaining = nextDisplays.filter((d) => d.id && !newReviewed.has(d.id));

      if (remaining.length === 0) {

        setPhase("complete");

      } else {

        setPhase("cards");

      }

    },

    [decisions, jurisdiction, language, persistEntries, photoByObs, photoCountByObs],

  );



  const handleAccept = useCallback(async () => {

    if (!currentFinding?.entry.id) return;

    const id = currentFinding.entry.id;

    const next = entries.map((e) => (e.id === id ? acceptFindingEntry(e) : e));

    await markReviewedAndAdvance(id, "accepted", next);

  }, [currentFinding, entries, markReviewedAndAdvance]);



  const handleIgnore = useCallback(async () => {

    if (!currentFinding?.entry.id) return;

    const id = currentFinding.entry.id;

    const next = ignoreFindingEntry(entries, id);

    await markReviewedAndAdvance(id, "ignored", next);

  }, [currentFinding, entries, markReviewedAndAdvance]);



  const handleModifySave = useCallback(

    async (fields: { observation: string; recommendation: string }) => {

      if (!currentFinding?.entry.id) return;

      const id = currentFinding.entry.id;

      const next = modifyFindingEntry(entries, id, fields, language);

      await markReviewedAndAdvance(id, "modified", next);

    },

    [currentFinding, entries, language, markReviewedAndAdvance],

  );



  const startReview = () => {
    const total = isFastMode ? reviewDisplays.length : displays.length;
    setSessionTotal(total);
    if (isFieldValidationMode()) {
      recordAiFindingsProposed(total);
    }
    setPhase(pendingDisplays.length > 0 ? "cards" : "complete");
  };

  const autoAcceptAndContinue = useCallback(async () => {
    if (!isFastMode || !fastReadiness) {
      onGoToDelivery();
      return;
    }
    const autoIds = autoAcceptedObservationIds(entries, fastReadiness, payload as Record<string, unknown>);
    if (autoIds.size === 0) {
      onGoToDelivery();
      return;
    }
    const token = viewerToken?.trim();
    if (!token) {
      setError(language === "en" ? "Missing access link." : "Lien d'accès manquant.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const nextDecisions = new Map(decisions);
      for (const id of autoIds) {
        if (!reviewedIds.has(id)) {
          nextDecisions.set(id, "accepted");
        }
      }
      const body = buildFindingsReviewSaveBody(
        reportId,
        token,
        payload as Record<string, unknown>,
        entries,
      );
      const res = await fetch("/api/report-content", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const result = (await res.json().catch(() => null)) as {
        success?: boolean;
        error?: string;
      } | null;
      if (!res.ok || !result?.success) {
        setError(
          humanInspectorError({
            language,
            status: res.status,
            raw: result?.error,
          }),
        );
        return;
      }
      setDecisions(nextDecisions);
      onGoToDelivery();
    } catch {
      setError(humanInspectorError({ language, kind: "network" }));
    } finally {
      setBusy(false);
    }
  }, [
    decisions,
    entries,
    fastReadiness,
    isFastMode,
    language,
    onGoToDelivery,
    payload,
    reportId,
    reviewedIds,
    viewerToken,
  ]);

  const totalFindings = sessionTotal || (isFastMode ? reviewDisplays.length : displays.length);



  return (

    <div className="mx-auto min-h-screen max-w-lg bg-slate-50 px-4 py-4 pb-8">

      <div className="mb-4 flex items-center justify-between gap-2">

        <button

          type="button"

          onClick={onBackToField}

          className="min-h-[44px] text-sm font-medium text-blue-600"

        >

          ← {language === "en" ? "Field" : "Terrain"}

        </button>

        <button

          type="button"

          onClick={onAdvancedEdit}

          className="min-h-[44px] text-xs font-medium text-slate-500 underline"

        >

          {language === "en" ? "Advanced editing" : "Édition avancée"}

        </button>

      </div>



      {!isFastMode ? (
        <p className="mb-4 text-sm leading-relaxed text-slate-600">
          {reviewContextualHelp(language)}
        </p>
      ) : null}

      {phase === "intro" && isFastMode && fastReadiness ? (
        <FastReportReviewPanel
          readiness={fastReadiness}
          language={language}
          busy={busy}
          onStartReview={startReview}
          onGoToDelivery={() => void autoAcceptAndContinue()}
        />
      ) : null}

      {phase === "intro" && !isFastMode ? (
        <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <h1 className="text-xl font-bold text-slate-900">
            {language === "en" ? "Inspection almost complete" : "Inspection presque terminée"}
          </h1>
          <p className="mt-4 text-3xl font-bold tabular-nums text-slate-900">
            {displays.length}{" "}
            <span className="text-lg font-medium text-slate-500">
              {language === "en" ? "findings found" : "points trouvés"}
            </span>
          </p>
          {verified > 0 ? (
            <p className="mt-2 text-sm text-slate-700">
              <span className="font-semibold text-emerald-700">{verified}</span>{" "}
              {language === "en" ? "validated" : "validés"}
            </p>
          ) : null}
          <button
            type="button"
            disabled={displays.length === 0 || busy}
            onClick={startReview}
            className="mt-6 inline-flex min-h-[44px] w-full items-center justify-center rounded-xl bg-blue-600 text-base font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
          >
            {language === "en" ? "Review now" : "Réviser maintenant"}
          </button>
        </section>
      ) : null}



      {phase === "cards" && currentFinding ? (

        <>

          <div className="mb-4">

            <ReviewProgress verified={verified} total={totalFindings} language={language} />

          </div>

          <FindingReviewCard

            finding={currentFinding}

            index={verified}

            total={totalFindings}

            language={language}

            busy={busy}

            onAccept={() => void handleAccept()}

            onIgnore={() => void handleIgnore()}

            onModifySave={(f) => void handleModifySave(f)}

          />

        </>

      ) : null}



      {phase === "complete" || isReviewSessionComplete(verified, totalFindings) ? (

        <div className="mt-4 space-y-4">

          <ReviewProgress verified={verified} total={totalFindings} complete language={language} />

          <InspectionCompletePanel language={language} onViewReport={onGoToDelivery} />

          <button

            type="button"

            onClick={onBackToField}

            className="inline-flex min-h-[44px] w-full items-center justify-center rounded-xl border border-slate-300 bg-white font-medium text-slate-800"

          >

            {language === "en" ? "Back to field" : "Retour terrain"}

          </button>

        </div>

      ) : null}



      {error ? (

        <p className="mt-4 text-sm font-medium text-red-700" role="alert">

          {error}

        </p>

      ) : null}



      {displays.length === 0 ? (

        <p className="mt-6 text-center text-base text-slate-600">

          {emptyFindingsMessage(language)}

        </p>

      ) : null}

    </div>

  );

}


