"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { isFieldValidationMode } from "@/lib/fieldDevMode";
import {
  formatInspectionDuration,
  getFieldMetricsSummary,
  recordFieldClick,
  recordFieldEvent,
  startFieldSession,
  subscribeFieldTestSnapshot,
  type FieldTestSnapshot,
} from "@/lib/fieldMetrics";

type ViewMode =
  | "field"
  | "post"
  | "classic"
  | "review"
  | "ai-review"
  | "delivery"
  | "advanced";

type ChecklistItemId =
  | "inspection_created"
  | "photos_25"
  | "photos_50"
  | "photos_100"
  | "offline_detected"
  | "upload_resumed"
  | "ai_complete"
  | "findings_reviewed"
  | "report_generated";

type StoredChecklist = Partial<Record<ChecklistItemId, boolean>> & { updatedAt?: number };

const ITEMS: Array<{ id: ChecklistItemId; label: string }> = [
  { id: "inspection_created", label: "Inspection créée" },
  { id: "photos_25", label: "25 photos ajoutées" },
  { id: "photos_50", label: "50 photos ajoutées" },
  { id: "photos_100", label: "100 photos ajoutées" },
  { id: "offline_detected", label: "Offline détecté" },
  { id: "upload_resumed", label: "Upload repris" },
  { id: "ai_complete", label: "IA terminée" },
  { id: "findings_reviewed", label: "Constats révisés" },
  { id: "report_generated", label: "Rapport généré" },
];

function storageKey(reportId: string): string {
  return `inspectflow_field_test_checklist_${reportId}`;
}

function readChecklist(reportId: string): StoredChecklist {
  try {
    const raw = window.localStorage.getItem(storageKey(reportId));
    if (!raw) return {};
    return JSON.parse(raw) as StoredChecklist;
  } catch {
    return {};
  }
}

function writeChecklist(reportId: string, state: StoredChecklist): void {
  try {
    window.localStorage.setItem(
      storageKey(reportId),
      JSON.stringify({ ...state, updatedAt: Date.now() }),
    );
  } catch {
    /* ignore */
  }
}

function deriveAutoChecks(input: {
  view: ViewMode;
  hasPdf: boolean;
  snapshot: FieldTestSnapshot;
  hadOffline: boolean;
  uploadResumed: boolean;
}): Partial<Record<ChecklistItemId, boolean>> {
  const { view, hasPdf, snapshot, hadOffline, uploadResumed } = input;
  return {
    inspection_created: true,
    photos_25: snapshot.photoCount >= 25,
    photos_50: snapshot.photoCount >= 50,
    photos_100: snapshot.photoCount >= 100,
    offline_detected: hadOffline || snapshot.wasOffline,
    upload_resumed: uploadResumed,
    ai_complete: snapshot.aiComplete,
    findings_reviewed:
      snapshot.reviewComplete || view === "delivery" || (view === "review" && snapshot.reviewComplete),
    report_generated: snapshot.reportGenerated || hasPdf,
  };
}

type Props = {
  reportId: string;
  view: ViewMode;
  hasPdf?: boolean;
};

export default function FieldTestChecklist({ reportId, view, hasPdf = false }: Props) {
  const [open, setOpen] = useState(true);
  const [manual, setManual] = useState<StoredChecklist>(() =>
    typeof window !== "undefined" ? readChecklist(reportId) : {},
  );
  const [snapshot, setSnapshot] = useState<FieldTestSnapshot>(() => ({
    photoCount: 0,
    photoMax: 500,
    analysisDone: 0,
    analysisFailed: 0,
    aiFindingsProposed: 0,
    aiFindingsAccepted: 0,
    aiFindingsModified: 0,
    aiFindingsIgnored: 0,
    wasOffline: false,
    isOnline: true,
    pendingSync: false,
    aiComplete: false,
    reviewComplete: false,
    reportGenerated: false,
    deliveryComplete: false,
    inspectionDurationMs: null,
  }));
  const [hadOffline, setHadOffline] = useState(false);
  const [uploadResumed, setUploadResumed] = useState(false);
  const uploadResumedRecorded = useRef(false);
  const [sessionKey, setSessionKey] = useState("");

  useEffect(() => {
    if (!isFieldValidationMode()) return;
    const key = startFieldSession(reportId);
    setSessionKey(key);
    recordFieldEvent("view_change", { view });
  }, [reportId]);

  useEffect(() => {
    if (!isFieldValidationMode()) return;
    recordFieldEvent("view_change", { view });
  }, [view, hasPdf]);

  useEffect(() => {
    if (!isFieldValidationMode()) return;
    return subscribeFieldTestSnapshot((next) => {
      setSnapshot(next);
      if (next.wasOffline) setHadOffline(true);
    });
  }, []);

  useEffect(() => {
    if (!isFieldValidationMode()) return;
    if (snapshot.wasOffline) setHadOffline(true);
    if (hadOffline && snapshot.isOnline && !snapshot.pendingSync && !uploadResumedRecorded.current) {
      uploadResumedRecorded.current = true;
      setUploadResumed(true);
      recordFieldEvent("upload_resumed");
    }
  }, [snapshot, hadOffline]);

  useEffect(() => {
    if (!isFieldValidationMode()) return;
    const onClick = () => recordFieldClick();
    document.addEventListener("click", onClick, true);
    return () => document.removeEventListener("click", onClick, true);
  }, []);

  const auto = useMemo(
    () => deriveAutoChecks({ view, hasPdf, snapshot, hadOffline, uploadResumed }),
    [view, hasPdf, snapshot, hadOffline, uploadResumed],
  );

  useEffect(() => {
    if (!isFieldValidationMode()) return;
    const merged = { ...manual, ...auto };
    writeChecklist(reportId, merged);
  }, [reportId, manual, auto]);

  const toggleManual = useCallback((id: ChecklistItemId) => {
    setManual((prev) => {
      const current = prev[id] ?? auto[id] ?? false;
      return { ...prev, [id]: !current };
    });
  }, [auto]);

  const reset = useCallback(() => {
    setManual({});
    setHadOffline(false);
    setUploadResumed(false);
    writeChecklist(reportId, {});
  }, [reportId]);

  if (!isFieldValidationMode()) return null;

  const metrics = sessionKey ? getFieldMetricsSummary(sessionKey) : null;
  const doneCount = ITEMS.filter((item) => manual[item.id] ?? auto[item.id]).length;

  return (
    <div
      className="fixed bottom-4 right-4 z-[9999] max-w-[min(100vw-2rem,22rem)] rounded-xl border border-violet-300 bg-violet-950/95 text-violet-50 shadow-2xl backdrop-blur-sm"
      data-testid="field-test-checklist"
      aria-label="Checklist validation terrain (dev)"
    >
      <div className="flex items-center justify-between gap-2 border-b border-violet-700 px-3 py-2">
        <p className="text-xs font-semibold uppercase tracking-wide text-violet-200">
          Field test 8F
        </p>
        <div className="flex items-center gap-2">
          <span className="text-xs tabular-nums text-violet-300">
            {doneCount}/{ITEMS.length}
          </span>
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            className="min-h-[32px] rounded px-2 text-xs text-violet-200 hover:bg-violet-800"
          >
            {open ? "−" : "+"}
          </button>
        </div>
      </div>

      {open ? (
        <div className="max-h-[60vh] overflow-y-auto px-3 py-2">
          <ul className="space-y-1.5">
            {ITEMS.map((item) => {
              const checked = manual[item.id] ?? auto[item.id] ?? false;
              const isAuto = auto[item.id] && !(manual[item.id] === false);
              return (
                <li key={item.id}>
                  <label className="flex cursor-pointer items-start gap-2 text-sm leading-snug">
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => toggleManual(item.id)}
                      className="mt-0.5 h-4 w-4 shrink-0 rounded border-violet-400"
                    />
                    <span className={checked ? "text-emerald-200" : "text-violet-100"}>
                      {item.label}
                      {isAuto ? (
                        <span className="ml-1 text-[10px] uppercase text-violet-400">auto</span>
                      ) : null}
                    </span>
                  </label>
                </li>
              );
            })}
          </ul>

          {metrics ? (
            <div className="mt-3 space-y-2">
              <div className="rounded-lg border border-violet-700 bg-violet-900/50 px-2 py-2 text-[11px] leading-relaxed text-violet-200">
                <p className="font-medium text-violet-100">Live metrics</p>
                <p>
                  Photos : {snapshot.photoCount} / {snapshot.photoMax}
                </p>
                <p>
                  Analyse : {snapshot.analysisDone} terminées
                  {snapshot.analysisFailed > 0 ? `, ${snapshot.analysisFailed} erreurs` : ""}
                </p>
                <p>
                  IA : {snapshot.aiFindingsProposed} constats proposés
                  {snapshot.aiFindingsAccepted + snapshot.aiFindingsModified + snapshot.aiFindingsIgnored > 0
                    ? `, ${snapshot.aiFindingsAccepted} acceptés, ${snapshot.aiFindingsModified} modifiés`
                    : ""}
                </p>
                <p>
                  Temps :{" "}
                  {formatInspectionDuration(
                    snapshot.inspectionDurationMs ?? metrics.inspectionDurationMs,
                  )}{" "}
                  (inspection → rapport)
                </p>
              </div>

              <div className="rounded-lg border border-violet-700 bg-violet-900/50 px-2 py-2 text-[11px] leading-relaxed text-violet-200">
                <p className="font-medium text-violet-100">fieldMetrics</p>
                <p>Clics : {metrics.clickCount}</p>
                <p>Retours : {metrics.backNavigations}</p>
                <p>Erreurs visibles : {metrics.visibleErrors}</p>
                <p>Blocages : {metrics.userBlockages}</p>
                <p>Photos perdues : {metrics.photosLost}</p>
                {metrics.acceptanceRate != null ? (
                  <p>Taux acceptation : {Math.round(metrics.acceptanceRate * 100)}%</p>
                ) : null}
                {metrics.humanCorrectionsCount > 0 ? (
                  <p>Corrections humaines : {metrics.humanCorrectionsCount}</p>
                ) : null}
                {metrics.timeToFirstPhotoMs != null ? (
                  <p>Première photo : {Math.round(metrics.timeToFirstPhotoMs / 1000)}s</p>
                ) : null}
              </div>
            </div>
          ) : null}

          <div className="mt-2 flex gap-2 pb-1">
            <button
              type="button"
              onClick={reset}
              className="min-h-[36px] flex-1 rounded-lg border border-violet-600 px-2 text-xs text-violet-200 hover:bg-violet-800"
            >
              Réinitialiser
            </button>
          </div>

          <p className="pb-1 text-[10px] text-violet-400">
            Dev/admin uniquement — invisible en production sans NEXT_PUBLIC_INSPECTFLOW_FIELD_TEST.
          </p>
        </div>
      ) : null}
    </div>
  );
}

export { isFieldValidationMode };
