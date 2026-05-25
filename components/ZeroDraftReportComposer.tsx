"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import type { ReactNode } from "react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import {
  buildClientFacingSection,
  buildStructuredReport,
  ISSUES,
  SEVERITIES,
  ZONES,
  type IssueCode,
  normalizeReportLanguage,
  parseStructuredEntriesFromPayload,
  type JurisdictionProfile,
  type ReportLanguage,
  type ReportEntryInput,
  type Severity,
  type ZoneCode,
} from "@/lib/reportNarrative";
import type { ReportServerData } from "@/lib/reportViewerServer";
import BuyerModePanel from "@/components/BuyerModePanel";
import FirstReportGuidedOnboarding from "@/components/FirstReportGuidedOnboarding";
import LiveInspectionCapture from "@/components/LiveInspectionCapture";
import NotesCapture from "@/components/NotesCapture";
import ReportLivePreviewBanner from "@/components/ReportLivePreviewBanner";
import ReportMissionSummary from "@/components/ReportMissionSummary";
import ReportViewModeToggle from "@/components/ReportViewModeToggle";
import TerrainGuidePanel from "@/components/TerrainGuidePanel";
import UserAgentPreferencesInline from "@/components/UserAgentPreferencesInline";
import { parseCoverV1FromUnknown } from "@/lib/inspectionCoverPayload";
import type { CoverReadinessResult } from "@/lib/reportReadiness";
import { evaluateCoverReadiness, REPORT_READINESS_ZONE_ID } from "@/lib/reportReadiness";
import { emitProductEvent } from "@/lib/productTelemetry";
import { emitQcTelemetry } from "@/lib/qcTelemetry";
import {
  buildPdfSuccessTimingDetail,
  ensureSessionStart,
  noteFirstPdfBlocked,
} from "@/lib/reportFunnelTiming";
import { scorePhotoHeuristic } from "@/lib/photoScoring";
import {
  REPORT_PHOTO_MAX_TOTAL,
  selectPhotosForReportWithReasons,
  type ReportPhotoTier,
} from "@/lib/reportPhotoSelection";
import {
  buildReportPhotoSelectionV1,
  parseReportPhotoSelectionIds,
  parseReportPhotoSelectionLocked,
  parseReportPhotoSelectionTiers,
} from "@/lib/reportPhotoSelectionPayload";
import { computeTerrainGuideStep } from "@/lib/terrainFieldGuide";
import {
  DEFAULT_USER_AGENT_PROFILE,
  loadReportViewMode,
  loadUserAgentProfile,
  saveReportViewMode,
  saveUserAgentProfile,
  type ReportViewMode,
  type UserAgentProfile,
} from "@/lib/userAgentProfile";
import { useSupabaseAccessToken } from "@/lib/useSupabaseAccessToken";

/** Limite « soft » UI — ne pas descendre sous 250 (usage réel 150–300+ photos). */
const MAX_BULK_SOFT = 250;
/** Plafond dur aligné backend (300–350) ; cohérent avec `upload-photo`. */
const MAX_BULK_HARD = 320;
/** Paquets séquentiels (~40–60 recommandé ; ici 50). */
const PHOTO_CHUNK = 50;
const UPLOAD_CONCURRENCY = 4;

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

/** Bloc numéroté pour le parcours inspecteur (zéro rédaction). */
function InspectorStepBlock({
  step,
  title,
  hint,
  id,
  surfaceClassName = "bg-white",
  children,
}: {
  step: number;
  title: string;
  hint?: string;
  id?: string;
  /** e.g. `bg-slate-50` for the preview column */
  surfaceClassName?: string;
  children: ReactNode;
}) {
  return (
    <section
      id={id}
      className={`scroll-mt-24 rounded-xl border border-slate-200 p-4 shadow-sm md:p-5 ${surfaceClassName}`}
    >
      <div className="mb-4 flex flex-wrap items-start gap-3 border-b border-slate-100 pb-3">
        <span
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-slate-900 text-sm font-bold text-white"
          aria-hidden
        >
          {step}
        </span>
        <div className="min-w-0 flex-1">
          <h3 className="text-base font-semibold tracking-tight text-slate-900">{title}</h3>
          {hint ? <p className="mt-1 text-xs leading-relaxed text-slate-600">{hint}</p> : null}
        </div>
      </div>
      <div className="space-y-4">{children}</div>
    </section>
  );
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

async function readResponseJson<T>(res: Response): Promise<T | null> {
  try {
    return (await res.json()) as T;
  } catch {
    return null;
  }
}

type DraftBaselineSnapshot = {
  title: string;
  inspectorNote: string;
  clientFacingSnapshot: string;
  entriesJson: string;
};

function serializeEntriesForBaseline(entries: ReportEntryInput[]): string {
  return JSON.stringify(
    entries.map((e) => ({
      zone: e.zone,
      issue: e.issue,
      severity: e.severity,
      note: e.note ?? "",
    })),
  );
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
  const SIMPLE_MODE = true;
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
  const [entries, setEntries] = useState<ReportEntryInput[]>(() => {
    if (!existingPayload) return [defaultEntry()];
    const parsed = parseStructuredEntriesFromPayload(existingPayload.entries);
    return parsed.length > 0 ? parsed : [defaultEntry()];
  });
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
  /** Sauvegarde `/api/report-content` seule (sans PDF). */
  const [savingDraft, setSavingDraft] = useState(false);
  const [error, setError] = useState<string | null>(null);
  /** Réponse API report-content (ex. rapport verrouillé en base). */
  const [contentSaveErrorCode, setContentSaveErrorCode] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [pdfLink, setPdfLink] = useState<string | null>(initialData?.pdfSignedUrl ?? null);
  const [lastSavedAt, setLastSavedAt] = useState<string | null>(null);
  const [retryAvailable, setRetryAvailable] = useState(false);
  const [shareCopied, setShareCopied] = useState(false);
  const [showEditor, setShowEditor] = useState(!hasExistingReport || existingSections.length === 0);
  const [simpleFlowMode, setSimpleFlowMode] = useState<"entry" | "live" | "upload">(
    !hasExistingReport || existingSections.length === 0 ? "live" : "entry",
  );
  const [photos, setPhotos] = useState<
    {
      id: string;
      name: string;
      url: string | null;
      uploading: boolean;
      error?: string;
      ai_score?: number;
      selected_for_report?: boolean;
      report_tier?: ReportPhotoTier;
      /** ID `photos.id` côté Supabase (pour inférer zones depuis `analysis`). */
      serverPhotoId?: string | null;
      /** Zone bâtiment pour couverture photo QC (agrégée dans `photos_coverage_v1`). */
      linked_zone?: ZoneCode;
      /** Analyse vision serveur — sert à choisir les meilleures prises par constat. */
      analysis?: unknown;
    }[]
  >([]);
  const photosRef = useRef(photos);
  photosRef.current = photos;
  const initialDataRef = useRef(initialData);
  initialDataRef.current = initialData;
  const savingDraftRef = useRef(false);
  const autoSavingAfterQcRef = useRef(false);
  const manualSaveDebounceTimerRef = useRef<number | null>(null);
  const [photoQcDraftBusy, setPhotoQcDraftBusy] = useState(false);
  type QcMergePendingState = {
    photoZones: Record<string, string>;
    proposed: ReportEntryInput[];
    zonePatchCount: number;
    photoCount: number;
  };
  const [qcMergePending, setQcMergePending] = useState<QcMergePendingState | null>(null);
  /** Incrémenté pour relancer `/api/report-photos-for-editor` après analyse vision. */
  const [photoAnalysisRefreshEpoch, setPhotoAnalysisRefreshEpoch] = useState(0);
  /** Verrouille la sélection « dans le rapport » : plus de recalcul auto (constats / analyses). */
  const [photoSelectionLocked, setPhotoSelectionLocked] = useState(() => {
    const pay = initialData?.payload;
    if (!pay || typeof pay !== "object") return false;
    return parseReportPhotoSelectionLocked(
      (pay as Record<string, unknown>).report_photo_selection_v1,
    );
  });
  /** Raisons courtes (sélection auto) par clé `photoRowKey` — vide si chargement depuis payload serveur. */
  const [photoSelectionReasonsByKey, setPhotoSelectionReasonsByKey] = useState<
    Record<string, { fr: string; en: string }>
  >({});
  const lastPhotoEditorFetchKeyRef = useRef<string | null>(null);
  const analysisRefreshTimersRef = useRef<number[]>([]);
  /** Évite deux appels QC concurrents (clic + auto). */
  const photoQcDraftLockRef = useRef(false);
  const draftBaselineRef = useRef<DraftBaselineSnapshot | null>(null);
  const draftBaselineCapturedRef = useRef(false);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [photoUploadProgress, setPhotoUploadProgress] = useState<{ done: number; total: number } | null>(null);
  const [photoDropHover, setPhotoDropHover] = useState(false);
  const photoDragDepthRef = useRef(0);
  const photoInputRef = useRef<HTMLInputElement>(null);
  const terrainPresetZoneRef = useRef<ZoneCode | null>(null);
  const cloudProfileSaveTimerRef = useRef<number | null>(null);
  const [clientOverride, setClientOverride] = useState<string | null>(null);
  /** Si true, les fusions QC ne réécrasent pas le compte rendu client (texte saisi ou chargé comme personnalisé). */
  const [clientSectionUserLocked, setClientSectionUserLocked] = useState(false);
  const clientSectionLockedRef = useRef(false);
  const clientPayloadHydratedForReportIdRef = useRef<string | null>(null);
  const [polishClient, setPolishClient] = useState(false);
  const [viewMode, setViewMode] = useState<ReportViewMode>("inspector");
  const [userProfile, setUserProfile] = useState<UserAgentProfile>(DEFAULT_USER_AGENT_PROFILE);
  const [photoZoneOnboardingGlow, setPhotoZoneOnboardingGlow] = useState(false);
  /** Incrémenté après une fusion QC utile pour déclencher une sauvegarde serveur silencieuse. */
  const [qcAutoSaveNonce, setQcAutoSaveNonce] = useState(0);
  const [autoSavingAfterQc, setAutoSavingAfterQc] = useState(false);
  const [qcAutoSaveHint, setQcAutoSaveHint] = useState<string | null>(null);
  const [composerCoachDismissed, setComposerCoachDismissed] = useState(false);

  const generated = useMemo(
    () => buildStructuredReport(entries, language, jurisdiction),
    [entries, jurisdiction, language],
  );
  const autoClientDraft = useMemo(
    () => buildClientFacingSection(entries, language, jurisdiction, inspectorNote || undefined),
    [entries, language, jurisdiction, inspectorNote],
  );
  const clientSectionValue = clientOverride !== null ? clientOverride : autoClientDraft;

  useEffect(() => {
    clientSectionLockedRef.current = clientSectionUserLocked;
  }, [clientSectionUserLocked]);

  useEffect(() => {
    savingDraftRef.current = savingDraft;
  }, [savingDraft]);

  useEffect(() => {
    autoSavingAfterQcRef.current = autoSavingAfterQc;
  }, [autoSavingAfterQc]);

  const router = useRouter();
  const supabaseAccessToken = useSupabaseAccessToken();

  useEffect(() => {
    setViewMode(loadReportViewMode());
    setUserProfile(loadUserAgentProfile());
  }, []);

  useEffect(() => {
    try {
      if (typeof window !== "undefined" && localStorage.getItem("inspectflow:report-composer-coach-dismissed") === "1") {
        setComposerCoachDismissed(true);
      }
    } catch {
      /* ignore */
    }
  }, []);

  const scheduleCloudProfileSync = useCallback(
    (profile: UserAgentProfile, mode: ReportViewMode) => {
      if (!reportId?.trim()) return;
      const rt = viewerToken?.trim() ?? "";
      const jwt = supabaseAccessToken?.trim() ?? "";
      if (!rt && !jwt) return;
      if (cloudProfileSaveTimerRef.current != null) {
        window.clearTimeout(cloudProfileSaveTimerRef.current);
      }
      cloudProfileSaveTimerRef.current = window.setTimeout(() => {
        cloudProfileSaveTimerRef.current = null;
        const headers: Record<string, string> = {
          "Content-Type": "application/json",
        };
        if (jwt) headers.Authorization = `Bearer ${jwt}`;
        void fetch("/api/user-agent-profile", {
          method: "POST",
          headers,
          body: JSON.stringify({
            report_id: reportId.trim(),
            access_token: rt,
            prefers_short_reports: profile.prefers_short_reports,
            strict_on_roof: profile.strict_on_roof,
            report_view_mode: mode,
          }),
        }).catch(() => {});
      }, 720);
    },
    [reportId, viewerToken, supabaseAccessToken],
  );

  useEffect(() => {
    const rt = viewerToken?.trim() ?? "";
    const jwt = supabaseAccessToken?.trim() ?? "";
    if (!reportId?.trim() || (!rt && !jwt)) return;
    let cancelled = false;
    void (async () => {
      try {
        const headers: Record<string, string> = {
          "Content-Type": "application/json",
        };
        if (jwt) headers.Authorization = `Bearer ${jwt}`;
        const res = await fetch("/api/user-agent-profile", {
          method: "POST",
          headers,
          body: JSON.stringify({
            report_id: reportId.trim(),
            access_token: rt,
          }),
        });
        const data = (await res.json().catch(() => ({}))) as {
          cloud?: boolean;
          profile?: UserAgentProfile;
          report_view_mode?: ReportViewMode;
        };
        if (cancelled || !res.ok || !data.cloud || !data.profile) return;
        setUserProfile(saveUserAgentProfile(data.profile));
        if (data.report_view_mode === "buyer" || data.report_view_mode === "inspector") {
          setViewMode(data.report_view_mode);
          saveReportViewMode(data.report_view_mode);
        }
      } catch {
        /* nuage optionnel */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [reportId, viewerToken, supabaseAccessToken]);

  const terrainPrefs = useMemo(
    () => ({ strict_on_roof: userProfile.strict_on_roof }),
    [userProfile.strict_on_roof],
  );

  const buyerProfilePick = useMemo(
    () => ({ prefers_short_reports: userProfile.prefers_short_reports }),
    [userProfile.prefers_short_reports],
  );

  const photosCoverageByZone = useMemo(() => {
    const acc: Partial<Record<string, number>> = {};
    for (const p of photos) {
      if (!p.url || p.error) continue;
      if (p.report_tier === "excluded") continue;
      if (!p.report_tier && p.selected_for_report === false) continue;
      const z = (p.linked_zone ?? "autre") as string;
      acc[z] = (acc[z] ?? 0) + 1;
    }
    return acc;
  }, [photos]);

  const reportPhotoSelectionForPayload = useMemo(() => {
    const selected = photos.filter(
      (p) =>
        p.serverPhotoId?.trim() &&
        (p.report_tier ? p.report_tier !== "excluded" : p.selected_for_report === true),
    );
    const ids = selected.map((p) => p.serverPhotoId!.trim());
    const tiersByPhotoId: Record<string, "critical" | "support"> = {};
    for (const p of selected) {
      const sid = p.serverPhotoId?.trim();
      if (!sid) continue;
      const tier = p.report_tier === "critical" ? "critical" : "support";
      tiersByPhotoId[sid] = tier;
    }
    return ids.length > 0
      ? buildReportPhotoSelectionV1(ids, {
          locked: photoSelectionLocked,
          tiersByPhotoId,
        })
      : undefined;
  }, [photos, photoSelectionLocked]);

  const selectionIdsFromServerPayload = useMemo(() => {
    if (!initialData?.payload || typeof initialData.payload !== "object") return null;
    return parseReportPhotoSelectionIds(
      (initialData.payload as Record<string, unknown>).report_photo_selection_v1,
    );
  }, [initialData]);

  const selectionTiersFromServerPayload = useMemo(() => {
    if (!initialData?.payload || typeof initialData.payload !== "object") return {};
    return parseReportPhotoSelectionTiers(
      (initialData.payload as Record<string, unknown>).report_photo_selection_v1,
    );
  }, [initialData]);

  /** Au moins un constat au-delà du gabarit par défaut seul (sinon l’aperçu / client restent « vides »). */
  const hasMeaningfulFindings = useMemo(() => {
    if (entries.length > 1) return true;
    if (entries.length !== 1) return false;
    const e = entries[0]!;
    if (e.zone !== "salon" || e.issue !== "water_infiltration" || e.severity !== "medium") return true;
    return Boolean((e.note ?? "").trim());
  }, [entries]);

  const validPhotoCount = useMemo(
    () => photos.filter((p) => p.url && !p.error).length,
    [photos],
  );

  /** Recalcul sélection « dans le rapport » seulement quand constats, analyses ou rafraîchissement changent (pas à chaque clic manuel sur une photo). */
  const photosSelectionSignature = useMemo(
    () =>
      `${photos.length}:` +
      photos
        .map((p) => {
          const k = (p.serverPhotoId?.trim() || p.id).trim();
          const an = p.analysis != null ? 1 : 0;
          const z = (p.linked_zone ?? "autre") as string;
          return `${k}:${an}:${z}`;
        })
        .sort()
        .join("|"),
    [photos],
  );

  useEffect(() => {
    if (!showEditor) return;
    const list = photosRef.current;
    if (list.length === 0) return;
    const serverIdSet = new Set(
      list.map((p) => p.serverPhotoId?.trim()).filter((x): x is string => Boolean(x && x.length > 0)),
    );
    const persistedFromPayload =
      photoAnalysisRefreshEpoch === 0 && selectionIdsFromServerPayload?.length
        ? selectionIdsFromServerPayload.filter((id) => serverIdSet.has(id))
        : [];
    const persistedFromRows =
      photoAnalysisRefreshEpoch === 0
        ? list
            .filter(
              (p) =>
                p.serverPhotoId?.trim() &&
                p.report_tier != null &&
                p.report_tier !== "excluded",
            )
            .map((p) => p.serverPhotoId!.trim())
        : [];
    const persisted = persistedFromPayload.length > 0 ? persistedFromPayload : persistedFromRows;
    const persistOnly = photoSelectionLocked;
    if (persistOnly && persisted.length === 0) return;
    let sel: Set<string>;
    let tierByKey: Record<string, Exclude<ReportPhotoTier, "excluded">> = {};
    if (persisted.length > 0) {
      setPhotoSelectionReasonsByKey({});
      sel = new Set(persisted);
      tierByKey = persisted.reduce<Record<string, Exclude<ReportPhotoTier, "excluded">>>((acc, id) => {
        const rowTier = list.find((p) => p.serverPhotoId?.trim() === id)?.report_tier;
        const payloadTier = selectionTiersFromServerPayload[id];
        acc[id] = rowTier === "critical" || payloadTier === "critical" ? "critical" : "support";
        return acc;
      }, {});
    } else {
      const { ids, reasonsByKey, tiersByKey } = selectPhotosForReportWithReasons({
        entries,
        photos: list,
        maxTotal: REPORT_PHOTO_MAX_TOTAL,
      });
      setPhotoSelectionReasonsByKey(reasonsByKey);
      sel = ids;
      tierByKey = tiersByKey;
    }
    setPhotos((prev) => {
      let changed = false;
      const next = prev.map((p) => {
        const key = (p.serverPhotoId?.trim() || p.id).trim();
        const on = sel.has(key);
        const nextTier: ReportPhotoTier = on ? (tierByKey[key] ?? "support") : "excluded";
        if (Boolean(p.selected_for_report) === on && (p.report_tier ?? "excluded") === nextTier) return p;
        changed = true;
        return { ...p, selected_for_report: on, report_tier: nextTier };
      });
      return changed ? next : prev;
    });
  }, [
    entries,
    photoAnalysisRefreshEpoch,
    showEditor,
    photosSelectionSignature,
    selectionIdsFromServerPayload,
    selectionTiersFromServerPayload,
    photoSelectionLocked,
  ]);

  useEffect(() => {
    lastPhotoEditorFetchKeyRef.current = null;
    setPhotoAnalysisRefreshEpoch(0);
    draftBaselineCapturedRef.current = false;
    draftBaselineRef.current = null;
    clientPayloadHydratedForReportIdRef.current = null;
    setQcAutoSaveNonce(0);
    setQcAutoSaveHint(null);
    setAutoSavingAfterQc(false);
    setPhotoSelectionReasonsByKey({});
    const pay = initialDataRef.current?.payload;
    if (pay && typeof pay === "object") {
      setPhotoSelectionLocked(
        parseReportPhotoSelectionLocked((pay as Record<string, unknown>).report_photo_selection_v1),
      );
    } else {
      setPhotoSelectionLocked(false);
    }
    if (manualSaveDebounceTimerRef.current != null) {
      window.clearTimeout(manualSaveDebounceTimerRef.current);
      manualSaveDebounceTimerRef.current = null;
    }
  }, [reportId]);

  useEffect(() => {
    if (!showEditor) return;
    if (draftBaselineCapturedRef.current) return;
    draftBaselineCapturedRef.current = true;
    draftBaselineRef.current = {
      title: title.trim(),
      inspectorNote,
      clientFacingSnapshot: clientSectionValue,
      entriesJson: serializeEntriesForBaseline(entries),
    };
  }, [showEditor, title, inspectorNote, clientSectionValue, entries]);

  useEffect(() => {
    return () => {
      for (const id of analysisRefreshTimersRef.current) {
        window.clearTimeout(id);
      }
      analysisRefreshTimersRef.current = [];
    };
  }, []);

  useEffect(() => {
    const token = viewerToken?.trim();
    if (!token) return;
    const fetchKey = `${reportId}:${photoAnalysisRefreshEpoch}`;
    if (lastPhotoEditorFetchKeyRef.current === fetchKey) return;
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch("/api/report-photos-for-editor", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ report_id: reportId, access_token: token }),
        });
        const body = (await res.json().catch(() => ({}))) as {
          success?: boolean;
          photos?: Array<{
            id: string;
            photo_number: number | null;
            url: string | null;
            linked_zone?: string;
            analysis?: unknown;
            selected_for_report?: boolean;
            report_tier?: "critical" | "support" | "excluded";
          }>;
        };
        if (cancelled || !res.ok || body.success !== true || !Array.isArray(body.photos)) return;
        lastPhotoEditorFetchKeyRef.current = fetchKey;
        setPhotos((prev) => {
          const merged = [...prev];
          for (const ph of body.photos!) {
            if (!ph?.id) continue;
            const num =
              typeof ph.photo_number === "number" && Number.isFinite(ph.photo_number)
                ? ph.photo_number
                : null;
            const zoneRaw = ph.linked_zone;
            const linked: ZoneCode =
              typeof zoneRaw === "string" && ZONES.some((z) => z.value === zoneRaw)
                ? (zoneRaw as ZoneCode)
                : "autre";
            const serverUrl =
              typeof ph.url === "string" && ph.url.startsWith("http") ? ph.url : null;
            const idx = merged.findIndex((p) => p.serverPhotoId === ph.id);
            if (idx >= 0) {
              const p = merged[idx]!;
              const nextUrl = p.url ?? serverUrl;
              const nextZone =
                (p.linked_zone ?? "autre") === "autre" && linked !== "autre" ? linked : (p.linked_zone ?? linked);
              const serverTier =
                ph.report_tier === "critical" || ph.report_tier === "support"
                  ? ph.report_tier
                  : ph.report_tier === "excluded"
                    ? "excluded"
                    : undefined;
              merged[idx] = {
                ...p,
                url: nextUrl,
                linked_zone: nextZone,
                analysis: ph.analysis !== undefined && ph.analysis !== null ? ph.analysis : p.analysis,
                ...(serverTier
                  ? {
                      report_tier: serverTier,
                      selected_for_report: serverTier !== "excluded",
                    }
                  : ph.selected_for_report !== undefined
                    ? {
                        selected_for_report: ph.selected_for_report,
                        report_tier: ph.selected_for_report ? (p.report_tier ?? "support") : "excluded",
                      }
                    : {}),
              };
              continue;
            }
            const serverTier =
              ph.report_tier === "critical" || ph.report_tier === "support"
                ? ph.report_tier
                : ph.report_tier === "excluded"
                  ? "excluded"
                  : ph.selected_for_report
                    ? "support"
                    : "excluded";
            merged.push({
              id: `srv-${ph.id}`,
              name: num != null ? `Photo ${num}` : `Photo ${ph.id.slice(0, 8)}…`,
              url: serverUrl,
              uploading: false,
              serverPhotoId: ph.id,
              linked_zone: linked,
              selected_for_report: serverTier !== "excluded",
              report_tier: serverTier,
              ...(ph.analysis !== undefined && ph.analysis !== null ? { analysis: ph.analysis } : {}),
            });
          }
          return merged;
        });
      } catch {
        /* ignore */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [reportId, viewerToken, photoAnalysisRefreshEpoch]);

  const terrainStepLive = useMemo(
    () =>
      computeTerrainGuideStep({
        entries,
        photosCoverageByZone,
        validPhotoCount,
        preferences: terrainPrefs,
      }),
    [entries, photosCoverageByZone, validPhotoCount, terrainPrefs],
  );

  const reportPayloadForBuyer = useMemo((): Record<string, unknown> => {
    if (hasExistingReport && existingPayload && typeof existingPayload === "object") {
      return existingPayload as Record<string, unknown>;
    }
    return {};
  }, [hasExistingReport, existingPayload]);

  const scrollToPhotosZone = useCallback(() => {
    document.getElementById("report-photos-zone")?.scrollIntoView({
      behavior: "smooth",
      block: "start",
    });
  }, []);

  useEffect(() => {
    if (!photoZoneOnboardingGlow) return;
    const t = window.setTimeout(() => setPhotoZoneOnboardingGlow(false), 4500);
    return () => clearTimeout(t);
  }, [photoZoneOnboardingGlow]);

  const goToPhotosForOnboarding = useCallback(() => {
    setPhotoZoneOnboardingGlow(true);
    scrollToPhotosZone();
  }, [scrollToPhotosZone]);

  const goToCoverStepForOnboarding = useCallback(() => {
    document.getElementById("inspectflow-step-1")?.scrollIntoView({
      behavior: "smooth",
      block: "start",
    });
  }, []);

  const goToGenerateForOnboarding = useCallback(() => {
    document.getElementById("inspectflow-step-3")?.scrollIntoView({
      behavior: "smooth",
      block: "start",
    });
  }, []);

  const openEditorAndJumpToPhotos = useCallback(() => {
    setShowEditor(true);
    setSimpleFlowMode("live");
    window.setTimeout(() => {
      scrollToPhotosZone();
      setPhotoZoneOnboardingGlow(true);
    }, 90);
  }, [scrollToPhotosZone]);

  const openUploadFlow = useCallback(() => {
    setShowEditor(true);
    setSimpleFlowMode("upload");
    window.setTimeout(() => {
      scrollToPhotosZone();
      photoInputRef.current?.click();
      setPhotoZoneOnboardingGlow(true);
    }, 120);
  }, [scrollToPhotosZone]);

  const copilotFieldsRef = useRef({
    title: "",
    inspectorNote: "",
    clientSection: "",
    entries: [] as ReportEntryInput[],
    language: "fr" as ReportLanguage,
    jurisdiction: "ca_general" as JurisdictionProfile,
    photosCoverage: {} as Record<string, number>,
  });

  useEffect(() => {
    copilotFieldsRef.current = {
      title: title.trim(),
      inspectorNote,
      clientSection: clientSectionValue,
      entries,
      language,
      jurisdiction,
      photosCoverage: { ...(photosCoverageByZone as Record<string, number>) },
    };
  }, [title, inspectorNote, clientSectionValue, entries, language, jurisdiction, photosCoverageByZone]);

  useEffect(() => {
    const onApply = (ev: Event) => {
      const e = ev as CustomEvent<{
        sectionIndex: number;
        recommendation: string;
        statsKey?: string;
        saveUndoSnapshot?: boolean;
      }>;
      const d = e.detail;
      if (!d || typeof d.sectionIndex !== "number" || typeof d.recommendation !== "string") return;
      const p = copilotFieldsRef.current;
      void (async () => {
        try {
          const body: Record<string, unknown> = {
            report_id: reportId,
            access_token: viewerToken ?? "",
            title: p.title,
            inspector_note: p.inspectorNote,
            client_section: p.clientSection,
            polish_client: false,
            entries: p.entries.map((x) => ({
              zone: x.zone,
              issue: x.issue,
              severity: x.severity,
              note: x.note ?? "",
            })),
            language: p.language,
            jurisdiction: p.jurisdiction,
            photos_coverage: p.photosCoverage,
            section_recommendation_overrides: {
              [String(d.sectionIndex)]: d.recommendation,
            },
          };
          if (d.saveUndoSnapshot === true && typeof d.statsKey === "string" && d.statsKey.length > 0) {
            body.qc_save_undo_snapshot_before_apply = true;
            body.stats_key = d.statsKey;
          }
          const saveRes = await fetch("/api/report-content", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(body),
          });
          const saveBody = (await saveRes.json().catch(() => ({}))) as {
            success?: boolean;
            undo_version_id?: string;
          };
          if (!saveRes.ok || !saveBody.success) {
            emitQcTelemetry("qc_ai_suggestion_applied", {
              ok: false,
              report_id: reportId,
              sectionIndex: d.sectionIndex,
              stats_key: d.statsKey,
              access_token: viewerToken ?? "",
              interaction: "persist",
            });
            return;
          }
          emitQcTelemetry("qc_ai_suggestion_applied", {
            ok: true,
            report_id: reportId,
            sectionIndex: d.sectionIndex,
            stats_key: d.statsKey,
            access_token: viewerToken ?? "",
            interaction: "persist",
            undo_version_id: saveBody.undo_version_id,
            before_state: { sectionIndex: d.sectionIndex },
            after_state: {
              sectionIndex: d.sectionIndex,
              recommendation_excerpt: d.recommendation.slice(0, 240),
            },
          });
          if (saveBody.undo_version_id) {
            window.dispatchEvent(
              new CustomEvent("inspectflow:qc_undo_available", {
                detail: {
                  version_id: saveBody.undo_version_id,
                  report_id: reportId,
                  stats_key: d.statsKey,
                },
              }),
            );
          }
          router.refresh();
        } catch {
          emitQcTelemetry("qc_ai_suggestion_applied", {
            ok: false,
            report_id: reportId,
            stats_key: d.statsKey,
            access_token: viewerToken ?? "",
            interaction: "persist",
          });
        }
      })();
    };
    window.addEventListener("inspectflow:qc_apply_recommendation", onApply as EventListener);
    return () =>
      window.removeEventListener("inspectflow:qc_apply_recommendation", onApply as EventListener);
  }, [reportId, viewerToken, router]);

  const coverReadiness: CoverReadinessResult = useMemo(() => {
    if (!hasExistingReport || !existingPayload) {
      return {
        gate: "ready",
        score: 100,
        blocking: [],
        warnings: [],
      };
    }
    const raw = (existingPayload as Record<string, unknown>).cover_v1;
    const cover = raw != null ? parseCoverV1FromUnknown(raw) : null;
    const photoCount = photos.filter((p) => p.url && !p.error).length;
    const reportEntries = entries.map((e) => ({
      zone: e.zone,
      note: e.note ?? "",
    }));
    return evaluateCoverReadiness(cover, {
      photoCount,
      reportEntries,
      photosCoverageByZone,
      reportPayload: {
        entries: entries.map((e) => ({
          zone: e.zone,
          issue: e.issue,
          severity: e.severity,
          note: e.note ?? "",
        })),
        sections: generated.sections,
      },
    });
  }, [hasExistingReport, existingPayload, photos, entries, photosCoverageByZone, generated.sections]);

  /** Brouillon fusionné — même forme que `/api/report-content` pour l’aperçu HTML « PDF ». */
  const htmlPreviewPayload = useMemo((): Record<string, unknown> | null => {
    const base =
      hasExistingReport && existingPayload && typeof existingPayload === "object"
        ? { ...(existingPayload as Record<string, unknown>) }
        : {};
    return {
      ...base,
      title,
      summary: generated.summary,
      sections: generated.sections,
      risk_level: generated.risk_level,
      compliance: generated.compliance,
      inspector_note: inspectorNote || null,
      client_section: clientSectionValue,
      language,
      jurisdiction,
      entries: entries.map((e) => ({
        zone: e.zone,
        issue: e.issue,
        severity: e.severity,
        note: e.note ?? "",
      })),
      photos_coverage_v1: {
        schema_version: 1,
        updated_at: new Date().toISOString(),
        by_zone: photosCoverageByZone,
      },
      ...(reportPhotoSelectionForPayload
        ? { report_photo_selection_v1: reportPhotoSelectionForPayload }
        : {}),
    };
  }, [
    hasExistingReport,
    existingPayload,
    title,
    generated.summary,
    generated.sections,
    generated.risk_level,
    generated.compliance,
    inspectorNote,
    clientSectionValue,
    language,
    jurisdiction,
    entries,
    photosCoverageByZone,
    reportPhotoSelectionForPayload,
  ]);

  /** Export PDF réservé au gate `ready` (blocages ou avertissements non accusés). */
  const pdfExportBlocked = coverReadiness.gate !== "ready";
  const pdfGateWarning = coverReadiness.gate === "warning";
  const pdfBlockedCritical = coverReadiness.blocking.some((b) => b.severity === "block_critical");

  const canGenerate =
    title.trim().length > 2 &&
    entries.length > 0 &&
    !loading &&
    !pdfExportBlocked;
  const completion = Math.min(100, Math.max(15, Math.round((entries.length / 6) * 100)));
  const previewCompletion = Math.min(
    100,
    Math.max(
      10,
      Math.round(
        (entries.length / 6) * 50 +
          Math.min(validPhotoCount, 24) * 1.8 +
          (clientSectionValue.trim().length > 40 ? 22 : 0),
      ),
    ),
  );
  const reportAlmostComplete =
    previewCompletion >= 78 &&
    entries.length >= 3 &&
    validPhotoCount >= 1 &&
    title.trim().length > 2;

  type JourneyStepState = "ok" | "pending" | "blocked" | "idle";
  const journeyCoverState: JourneyStepState = !viewerToken?.trim()
    ? "idle"
    : !hasExistingReport
      ? "pending"
      : coverReadiness.gate === "blocked"
        ? "blocked"
        : coverReadiness.gate === "ready"
          ? "ok"
          : "pending";
  const journeyPhotosState: JourneyStepState = validPhotoCount > 0 ? "ok" : "pending";
  const journeyContentState: JourneyStepState = hasMeaningfulFindings ? "ok" : "pending";
  const journeyDotClass = (s: JourneyStepState) =>
    s === "ok"
      ? "bg-emerald-500"
      : s === "blocked"
        ? "bg-rose-500"
        : s === "idle"
          ? "bg-slate-300"
          : "bg-amber-400";

  const riskBadgeClass = generated.risk_level === "high"
    ? "bg-red-100 text-red-700 border-red-200"
    : generated.risk_level === "medium"
    ? "bg-amber-100 text-amber-700 border-amber-200"
    : "bg-emerald-100 text-emerald-700 border-emerald-200";
  const labels = useMemo(
    () =>
      (language === "en"
        ? {
      title: "Almost no writing — three steps",
      subtitle:
        "Cover once, add photos — zones, QC rows, client summary and preview update as analyses land — then review and export the PDF.",
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
        "Stays in sync with findings until you edit this box; then use “Regenerate draft” to follow the list again.",
      clientSectionLockedHint:
        "You edited the client summary — it will not auto-rewrite when new findings arrive. Use “Regenerate draft from findings” to sync again.",
      regenerateClient: "Regenerate draft from findings",
      journeyCaption: "Your path",
      journeyCover: "Cover",
      journeyPhotos: "Photos",
      journeyContent: "Summary & preview",
      journeyDone: "Done",
      journeyTodo: "Next",
      journeyBlocked: "Action needed",
      journeyOpenCover: "Open cover",
      journeyScrollPreview: "Open summary step",
      journeyNeedsToken: "Token",
      journeyJumpPhotos: "Jump to photos",
      journeyHint:
        "Follow the row left to right; the app fills most fields after photos. You stay in control before PDF.",
      stickyProgressLabel: "Draft progress",
      stickyPreviewFill: "Preview fill",
      stickyAutoSaving: "Saving to server…",
      coachTitle: "How this editor works",
      coachBullet1:
        "After photos import, zones and QC rows update automatically; the client summary follows unless you edit it.",
      coachBullet2:
        "Photo updates and your edits auto-save to the server in the background (no PDF) so you rarely lose work.",
      coachBullet3: "Finish the cover checklist before generating the PDF — the bar above shows what is left.",
      coachDismiss: "Got it, hide this",
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
      pdfBlockedCriticalBanner:
        "Cannot generate the report — essential cover information is missing (requester, address, or full cover). Open the cover page below.",
      pdfBlockedStandardBanner:
        "Complete the following on the cover page to continue:",
      pdfGateBlockedCritical:
        "Cannot generate the report — essential information is missing. Open the cover page and fill in requester, address, and required fields.",
      pdfGateBlockedStandardIntro: "Complete the following to continue:",
      openCoverPage: "Open cover page",
      pdfNotCertifiedWarning:
        "Report not certified — fix the items above or acknowledge warnings in the compliance panel before exporting the PDF.",
      finishInspectionTitle: "Inspection almost complete",
      finishInspectionReady:
        "You have enough findings and photos — generate the PDF to wrap up.",
      finishInspectionBlocked:
        "Finish cover & compliance, then generate the PDF to finalize.",
      finishInspectionGoPdf: "Scroll to PDF generation",
      htmlPreviewTitle: "Live report layout (same HTML as PDF)",
      htmlPreviewLoading: "Building HTML preview…",
      htmlPreviewError: "HTML preview unavailable (draft may be too minimal).",
      step1Title: "Step 1 — Cover, seller declaration & report language",
      step1Hint:
        "Requester, clients and property identity belong on the cover together with the seller declaration. On this screen you only set the report title and PDF language.",
      step1CoverBoxTitle: "Start on the cover page",
      step1CoverBoxBody:
        "That is where the requérant, clients and address are recorded together with the declaration — needed before a proper PDF.",
      step2Title: "Step 2 — Photos & findings (mostly pick lists)",
      step2Hint:
        "Upload photos — after a short server vision delay, “Other” photo zones and draft QC findings (including electrical when visible) are applied automatically. You can still tap “Generate now” in the blue box to refresh immediately.",
      step3Title: "Step 3 — Optional notes, client letter, preview & PDF",
      step3Hint:
        "Field note and client summary can stay automatic. Save the draft to the server, then generate when cover checks pass.",
      entriesBlockHint:
        "Use the dropdowns for zone and issue — type a note only if you want extra detail.",
      qcMergeDialogTitle: "This report was edited — how should QC apply?",
      qcMergeDialogBody:
        "New photo zones and draft findings are available. Because the title, client summary, field note, or findings changed since the page loaded, choose whether to merge AI draft findings with your current rows or only update “Other” photo zones.",
      qcMergeMergeAll: "Merge draft findings anyway",
      qcMergeZonesOnly: "Update photo zones only",
      qcMergeCancel: "Cancel",
      applyPhotoQcDraft: "Auto-generate from photos",
      applyPhotoQcDraftRun: "Generate now",
      applyPhotoQcDraftHint:
        "Uses every stored photo analysis for this inspection. After each upload the page re-fetches analyses a few times and applies zones + draft findings automatically (with a short delay). This button forces an immediate pass. If you edited title / client text / findings, auto-apply still merges drafts; you can also choose merge vs zones-only from the dialog when you run manually. Needs OPENAI_API_KEY on the server.",
      photoAfterUploadReminder:
        "Zones and draft findings update automatically a few seconds after import once vision has run — use “Generate now” below if you want to refresh without waiting.",
      photoSmartSelectionHint: `Up to ${REPORT_PHOTO_MAX_TOTAL} photos are marked “In report”: the app keeps the best shots per finding (zone + analysis text). Toggle any thumbnail to override.`,
      saveDraftButton: "Save draft to server (no PDF)",
      saveDraftHint:
        "Persists structured findings, client summary, inspector note, and photo coverage. Use this to validate zero-touch edits before generating the PDF.",
      qcDraftZonesOnlyManualEdits:
        "Photo zones updated. Automatic QC draft findings were not merged because the title, client summary, field note, or findings were edited manually.",
      qcDraftSkippedFindingsNoZones:
        "QC draft findings were skipped (manual edits) and no “Other” photo zones were updated — try again after vision analysis finishes, or reset zones to Other where needed.",
    }
    : {
      title: "Presque sans rédaction — trois étapes",
      subtitle:
        "Couverture une fois, puis photos : zones, grille QC, compte rendu client et aperçu se mettent à jour avec les analyses — il reste à relire et exporter le PDF.",
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
        "Reste aligné sur les constats tant que vous ne modifiez pas ce champ ; sinon utilisez « Régénérer » pour suivre à nouveau la liste.",
      clientSectionLockedHint:
        "Vous avez modifié le compte rendu client — il ne se réécrit plus tout seul quand de nouveaux constats arrivent. Utilisez « Régénérer le brouillon à partir des constats » pour resynchroniser.",
      regenerateClient: "Régénérer le brouillon à partir des constats",
      journeyCaption: "Parcours",
      journeyCover: "Couverture",
      journeyPhotos: "Photos",
      journeyContent: "Texte & aperçu",
      journeyDone: "OK",
      journeyTodo: "À faire",
      journeyBlocked: "À compléter",
      journeyOpenCover: "Ouvrir la couverture",
      journeyScrollPreview: "Aller au texte & aperçu",
      journeyNeedsToken: "Lien",
      journeyJumpPhotos: "Aller aux photos",
      journeyHint:
        "Suivez la ligne de gauche à droite ; l’application remplit la majeure partie après les photos. Vous gardez le contrôle avant le PDF.",
      stickyProgressLabel: "Avancement du brouillon",
      stickyPreviewFill: "Aperçu",
      stickyAutoSaving: "Enregistrement serveur…",
      coachTitle: "Comment fonctionne cette page",
      coachBullet1:
        "Après l’import des photos, les zones et la grille QC se mettent à jour automatiquement ; le compte rendu client suit sauf si vous le modifiez.",
      coachBullet2:
        "Les mises à jour photo et vos modifications sont enregistrées automatiquement sur le serveur en arrière-plan (sans PDF), pour limiter les pertes.",
      coachBullet3: "Complétez la couverture avant le PDF — la barre ci-dessus indique ce qu’il reste.",
      coachDismiss: "Compris, masquer",
      polishClientLabel: "Peaufiner la rédaction avec l'IA (OpenAI, optionnel)",
      reportGeneratedOk: "Rapport généré avec succès. Le PDF est prêt.",
      polishSkippedTooLong:
        "Note : texte client trop long pour le polish IA ; le brouillon a été enregistré.",
      polishSkippedAborted:
        "Note : polish IA interrompu (délai ou limite) ; le brouillon a été enregistré.",
      polishSkippedUnavailable:
        "Note : polish IA indisponible ; le brouillon a été enregistré.",
      polishSkippedTimeout:
        "Note : polish IA interrompu (délai réseau / OpenAI) ; le brouillon a été enregistré.",
      reportLockedShort:
        "Ce rapport est finalisé ou verrouillé — la base refuse l'enregistrement.",
      reportLockedHelp:
        "Pour un test terrain, utilisez un lien de rapport neuf (nouvelle inspection). Sinon, déverrouillez la ligne dans Supabase.",
      reportLockedLink: "Accéder à un autre rapport",
      pdfBlockedCriticalBanner:
        "Impossible de générer le rapport tant que ces informations essentielles manquent (requérant, adresse ou couverture complète). Utilisez le lien ci-dessous.",
      pdfBlockedStandardBanner:
        "Complétez les éléments suivants sur la couverture pour continuer :",
      pdfGateBlockedCritical:
        "Impossible de générer le rapport — informations d’identité ou d’adresse manquantes. Ouvrez la couverture et complétez les champs requis.",
      pdfGateBlockedStandardIntro: "Complétez les éléments suivants pour continuer :",
      openCoverPage: "Ouvrir la couverture",
      pdfNotCertifiedWarning:
        "Rapport non certifié — corrigez les points bloquants ou accusez réception des avertissements (zone conformité) avant l’export PDF.",
      finishInspectionTitle: "Inspection presque terminée",
      finishInspectionReady:
        "Vous avez assez de constats et de photos — générez le PDF pour conclure.",
      finishInspectionBlocked:
        "Finalisez la couverture et la conformité, puis générez le PDF.",
      finishInspectionGoPdf: "Aller à la génération PDF",
      htmlPreviewTitle: "Mise en page du rapport (même HTML que le PDF)",
      htmlPreviewLoading: "Génération de l'aperçu HTML…",
      htmlPreviewError: "Aperçu HTML indisponible (brouillon peut-être trop minimal).",
      step1Title: "Étape 1 — Couverture, déclaration du vendeur (DV) et langue",
      step1Hint:
        "Requérant, clients et adresse du bien se saisissent sur la page couverture avec la DV. Ici vous indiquez seulement le titre du rapport et la langue du PDF.",
      step1CoverBoxTitle: "Commencer par la couverture",
      step1CoverBoxBody:
        "C’est là qu’on enregistre requérant, clients et identité du bien avec la déclaration du vendeur — nécessaire avant un PDF conforme.",
      step2Title: "Étape 2 — Photos et constats (surtout des listes)",
      step2Hint:
        "Téléversez les photos — après un court délai d’analyse serveur, les zones « Autre » et les brouillons de constats QC (dont électrique si visible) s’appliquent automatiquement. Vous pouvez quand même cliquer sur « Lancer maintenant » dans l’encadré bleu pour forcer un passage immédiat.",
      step3Title: "Étape 3 — Notes (optionnel), texte client, aperçu et PDF",
      step3Hint:
        "La note terrain et le compte rendu client peuvent rester sur le texte automatique. Enregistrez le brouillon, puis générez le PDF quand la couverture est complète.",
      entriesBlockHint:
        "Choisissez la zone et le type de problème dans les listes — une note seulement si vous voulez préciser.",
      qcMergeDialogTitle: "Rapport modifié — comment appliquer le QC ?",
      qcMergeDialogBody:
        "De nouvelles zones photo et des brouillons de constats sont disponibles. Comme le titre, le compte rendu client, la note ou les constats ont changé depuis le chargement de la page, choisissez : fusionner les brouillons proposés avec vos lignes actuelles, mettre à jour uniquement les photos « Autre », ou annuler.",
      qcMergeMergeAll: "Fusionner les brouillons quand même",
      qcMergeZonesOnly: "Mettre à jour les zones photo seulement",
      qcMergeCancel: "Annuler",
      applyPhotoQcDraft: "Auto-générer le contenu à partir des photos",
      applyPhotoQcDraftRun: "Lancer maintenant",
      applyPhotoQcDraftHint:
        "Utilise toutes les analyses enregistrées pour les photos de cette inspection. Après chaque import, la page relit les analyses plusieurs fois et applique zones + brouillons automatiquement (court délai). Ce bouton force un passage immédiat. Si le titre, le texte client ou les constats ont été modifiés, l’application auto fusionne quand même les brouillons ; en lancement manuel, une fenêtre peut encore proposer fusion ou zones seulement. Sur Vercel : OPENAI_API_KEY requise côté serveur.",
      photoAfterUploadReminder:
        "Les zones et brouillons se mettent à jour automatiquement quelques secondes après l’import une fois l’analyse vision prête — utilisez « Lancer maintenant » ci-dessous pour rafraîchir sans attendre.",
      photoSmartSelectionHint: `Jusqu’à ${REPORT_PHOTO_MAX_TOTAL} photos sont marquées « Dans le rapport » : l’app garde les meilleures prises par constat (zone + texte d’analyse). Vous pouvez corriger chaque vignette.`,
      saveDraftButton: "Enregistrer le brouillon (serveur, sans PDF)",
      saveDraftHint:
        "Enregistre en base les constats, le compte rendu client, la note terrain et la couverture photo. À utiliser pour valider le parcours zéro rédaction avant de générer le PDF.",
      qcDraftZonesOnlyManualEdits:
        "Zones photo mises à jour. Les brouillons de constats QC n’ont pas été fusionnés car le titre, le compte rendu client, la note terrain ou les constats ont été modifiés à la main.",
      qcDraftSkippedFindingsNoZones:
        "Constats automatiques ignorés (brouillon modifié) et aucune zone photo « Autre » à mettre à jour — réessayez après l’analyse vision, ou remettez des zones sur « Autre » si besoin.",
    }),
    [language],
  );

  /** Une fois par rapport : si le client en base = brouillon auto des constats, rester en mode auto (sinon les photos ne « mettent pas à jour » le texte client). */
  useEffect(() => {
    if (!hasExistingReport || !existingPayload) return;
    if (clientPayloadHydratedForReportIdRef.current === reportId) return;
    clientPayloadHydratedForReportIdRef.current = reportId;
    const raw = existingPayload.client_section;
    const trimmed = typeof raw === "string" ? raw.trim() : "";
    if (!trimmed) {
      setClientOverride(null);
      setClientSectionUserLocked(false);
      return;
    }
    const auto = buildClientFacingSection(entries, language, jurisdiction, inspectorNote || undefined);
    if (trimmed === auto.trim()) {
      setClientOverride(null);
      setClientSectionUserLocked(false);
    } else {
      setClientOverride(trimmed);
      setClientSectionUserLocked(true);
    }
  }, [reportId, hasExistingReport, existingPayload, entries, language, jurisdiction, inspectorNote]);

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
    ensureSessionStart(reportId);
  }, [reportId, viewerToken]);

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
          setClientSectionUserLocked(true);
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

  const uploadOnePhoto = useCallback(
    async (
      file: File,
      slotId: string,
      attempt: number,
    ): Promise<boolean> => {
      const form = new FormData();
      form.append("file", file);
      form.append("report_id", reportId);
      if (viewerToken?.trim()) {
        form.append("access_token", viewerToken.trim());
      }
      form.append("language", language);
      try {
        const res = await fetch("/api/upload-photo", { method: "POST", body: form });
        const body = (await res.json().catch(() => ({}))) as Record<string, unknown>;
        const suggested =
          typeof body.suggested_inspector_note === "string" && body.suggested_inspector_note.trim()
            ? body.suggested_inspector_note.trim()
            : null;
        if (suggested) {
          setInspectorNote((prev) => (prev.trim() ? `${prev.trim()}\n\n${suggested}` : suggested));
        }
        const ok = res.ok;
        if (!ok && attempt === 0) {
          // On 429 (rate limit), wait before retrying to avoid hammering the server.
          if (res.status === 429) {
            await new Promise((resolve) => setTimeout(resolve, 1500));
          }
          return uploadOnePhoto(file, slotId, 1);
        }
        let ai_score: number | undefined;
        if (ok) {
          try {
            const sc = await scorePhotoHeuristic(file);
            ai_score = sc.final;
          } catch {
            /* ignore */
          }
        }
        const serverPid =
          typeof body.photo_id === "string" && body.photo_id.trim() ? body.photo_id.trim() : null;
        setPhotos((prev) => {
          const preset = terrainPresetZoneRef.current;
          return prev.map((p) => {
            if (p.id !== slotId) return p;
            const next = {
              ...p,
              uploading: false,
              url: typeof body.url === "string" ? body.url : null,
              serverPhotoId: ok ? serverPid : p.serverPhotoId,
              error: !ok
                ? (typeof body.error === "string" ? body.error : `Erreur ${res.status}`)
                : undefined,
              ...(ai_score != null ? { ai_score } : {}),
            };
            if (ok && preset) {
              terrainPresetZoneRef.current = null;
              return { ...next, linked_zone: preset };
            }
            return next;
          });
        });
        return ok;
      } catch (e) {
        if (attempt === 0) {
          return uploadOnePhoto(file, slotId, 1);
        }
        setPhotos((prev) =>
          prev.map((p) =>
            p.id === slotId
              ? { ...p, uploading: false, error: e instanceof Error ? e.message : String(e) }
              : p,
          ),
        );
        return false;
      }
    },
    [reportId, viewerToken, language],
  );

  const schedulePhotoAnalysisRefresh = useCallback(() => {
    for (const tid of analysisRefreshTimersRef.current) {
      window.clearTimeout(tid);
    }
    analysisRefreshTimersRef.current = [];
    for (const delay of [2500, 7000, 15_000]) {
      analysisRefreshTimersRef.current.push(
        window.setTimeout(() => {
          setPhotoAnalysisRefreshEpoch((n) => n + 1);
        }, delay),
      );
    }
  }, []);

  const handlePhotoUpload = useCallback(
    async (files: FileList | File[]) => {
      const arr = Array.from(files).filter((f) => f.type.startsWith("image/") || /\.(jpe?g|png|webp|gif)$/i.test(f.name));
      if (arr.length === 0) return;
      if (arr.length > MAX_BULK_SOFT) {
        window.alert(
          language === "en"
            ? `Large batch: up to ${MAX_BULK_HARD} photos. Uploading the first ${MAX_BULK_HARD} in chunks of ${PHOTO_CHUNK}.`
            : `Lot volumineux : jusqu’à ${MAX_BULK_HARD} photos. Téléversement des ${MAX_BULK_HARD} premières par paquets de ${PHOTO_CHUNK}.`,
        );
      }
      const batch = arr.slice(0, MAX_BULK_HARD);
      const uploadStartedAt = Date.now();
      setUploadingPhoto(true);
      setPhotoUploadProgress({ done: 0, total: batch.length });
      emitProductEvent("photos_bulk_upload_started", {
        count: batch.length,
        report_id: reportId,
      });
      const additions = batch.map((f) => ({
        id: crypto.randomUUID(),
        name: f.name,
        url: null as string | null,
        uploading: true,
        report_tier: "excluded" as ReportPhotoTier,
      }));
      setPhotos((prev) => [...prev, ...additions]);

      const outcomes: boolean[] = [];
      let completed = 0;
      for (let chunkStart = 0; chunkStart < batch.length; chunkStart += PHOTO_CHUNK) {
        const chunkEnd = Math.min(chunkStart + PHOTO_CHUNK, batch.length);
        const chunkFiles = batch.slice(chunkStart, chunkEnd);
        const chunkAdd = additions.slice(chunkStart, chunkEnd);
        for (let i = 0; i < chunkFiles.length; i += UPLOAD_CONCURRENCY) {
          const slice = chunkFiles.slice(i, i + UPLOAD_CONCURRENCY);
          const sliceAdd = chunkAdd.slice(i, i + UPLOAD_CONCURRENCY);
          const batchOut = await Promise.all(
            slice.map((file, j) => uploadOnePhoto(file, sliceAdd[j]!.id, 0)),
          );
          outcomes.push(...batchOut);
          completed += slice.length;
          setPhotoUploadProgress({ done: completed, total: batch.length });
        }
      }

      setPhotos((prev) => {
        const batchIds = new Set(additions.map((a) => a.id));
        return prev.map((p) =>
          batchIds.has(p.id) ? { ...p, selected_for_report: false, report_tier: "excluded" } : p,
        );
      });
      setUploadingPhoto(false);
      setPhotoUploadProgress(null);
      const duration_ms = Date.now() - uploadStartedAt;
      const failed_count = outcomes.filter((o) => !o).length;
      const avg_time_per_file =
        batch.length > 0 ? Math.round((duration_ms / batch.length) * 100) / 100 : 0;
      emitProductEvent("photos_bulk_upload_finished", {
        count: batch.length,
        report_id: reportId,
        duration_ms,
        avg_time_per_file,
        failed_count,
      });
      if (failed_count > 0) {
        emitProductEvent("photos_bulk_upload_failed", {
          report_id: reportId,
          failed_count,
        });
      }
      const successCount = outcomes.filter(Boolean).length;
      if (successCount > 0) {
        schedulePhotoAnalysisRefresh();
      }
    },
    [reportId, language, uploadOnePhoto, schedulePhotoAnalysisRefresh],
  );

  const finalizeQcPhotoDraftApply = useCallback(
    (params: {
      photoZones: Record<string, string>;
      proposed: ReportEntryInput[];
      skipEntryMerge: boolean;
      zonePatchCount: number;
      photoCount: number;
      entriesSnapshot: ReportEntryInput[];
      titleSnapshot: string;
      inspectorSnapshot: string;
      clientSnapshot: string;
      merge_choice?: "merge_all" | "zones_only" | "auto_full";
    }) => {
      const {
        photoZones,
        proposed,
        skipEntryMerge,
        zonePatchCount,
        photoCount,
        entriesSnapshot,
        titleSnapshot,
        inspectorSnapshot,
        clientSnapshot,
        merge_choice,
      } = params;

      setPhotos((prev) =>
        prev.map((p) => {
          const sid = p.serverPhotoId?.trim();
          if (!sid) return p;
          const inferred = photoZones[sid];
          if (!inferred || !ZONES.some((z) => z.value === inferred)) return p;
          const z = inferred as ZoneCode;
          if ((p.linked_zone ?? "autre") !== "autre") return p;
          return { ...p, linked_zone: z };
        }),
      );

      let mergedEntries = entriesSnapshot;
      let mergedNewFindings = false;
      if (!skipEntryMerge && proposed.length > 0) {
        const prev = entriesSnapshot;
        const isPristineDefault =
          prev.length === 1 &&
          prev[0]?.zone === "salon" &&
          prev[0]?.issue === "water_infiltration" &&
          prev[0]?.severity === "medium" &&
          !(prev[0]?.note ?? "").trim();
        mergedEntries = isPristineDefault
          ? proposed.map((e) => ({ ...e }))
          : [...prev, ...proposed];
        mergedNewFindings = true;
        setEntries(mergedEntries);
      }

      let syncedClientFromFindings = false;
      if (mergedNewFindings && !clientSectionLockedRef.current) {
        setClientOverride(null);
        setClientSectionUserLocked(false);
        syncedClientFromFindings = true;
      }

      draftBaselineRef.current = {
        title: titleSnapshot.trim(),
        inspectorNote: inspectorSnapshot,
        clientFacingSnapshot: clientSnapshot,
        entriesJson: serializeEntriesForBaseline(mergedEntries),
      };

      const proposedApplied = skipEntryMerge ? 0 : proposed.length;
      const skippedFindingsManual = skipEntryMerge && proposed.length > 0;
      emitProductEvent("photos_qc_draft_apply", {
        report_id: reportId,
        ok: true,
        zone_patch_count: zonePatchCount,
        proposed_count: proposedApplied,
        photo_count: photoCount,
        skipped_findings_manual_edit: skippedFindingsManual,
        ...(merge_choice ? { merge_choice } : {}),
        ...(merge_choice === "auto_full" ? { auto: true } : {}),
      });

      if (skipEntryMerge && proposed.length > 0) {
        if (zonePatchCount > 0) {
          setStatus(labels.qcDraftZonesOnlyManualEdits);
        } else {
          setStatus(labels.qcDraftSkippedFindingsNoZones);
        }
      } else if (zonePatchCount === 0 && proposed.length === 0) {
        setStatus(
          language === "en"
            ? "Nothing new to apply — zones and QC sections may already match stored analyses."
            : "Rien de nouveau à appliquer — les zones et la grille QC correspondent peut-être déjà aux analyses.",
        );
      } else {
        const autoPre =
          merge_choice === "auto_full"
            ? language === "en"
              ? "Auto-update from photos — "
              : "Mise à jour automatique depuis les photos — "
            : "";
        const clientTail =
          syncedClientFromFindings
            ? language === "en"
              ? " Client letter draft refreshed from the new findings."
              : " Compte rendu client régénéré à partir des constats."
            : "";
        setStatus(
          autoPre +
            (language === "en"
              ? `Applied ${zonePatchCount} photo zone(s) and ${proposedApplied} draft finding(s). Review before generating the PDF.`
              : `${zonePatchCount} zone(s) photo et ${proposedApplied} brouillon(s) de constat appliqués. Relire avant de générer le PDF.`) +
            clientTail,
        );
      }

      const shouldScrollPreview = zonePatchCount > 0 || mergedNewFindings;
      if (shouldScrollPreview) {
        window.setTimeout(() => {
          document.getElementById("inspectflow-step-3")?.scrollIntoView({
            behavior: "smooth",
            block: "nearest",
          });
        }, 450);
      }

      const shouldRequestQcAutosave =
        Boolean(viewerToken?.trim()) &&
        photoCount > 0 &&
        !(zonePatchCount === 0 && proposed.length === 0) &&
        !(skipEntryMerge && proposed.length > 0 && zonePatchCount === 0);
      if (shouldRequestQcAutosave) {
        setQcAutoSaveNonce((n) => n + 1);
      }
    },
    [reportId, labels, language, viewerToken],
  );

  const resolveQcMergeChoice = useCallback(
    (choice: "merge_all" | "zones_only" | "cancel") => {
      if (choice === "cancel") {
        setQcMergePending(null);
        return;
      }
      const pending = qcMergePending;
      if (!pending) return;
      setQcMergePending(null);
      const skipEntryMerge = choice === "zones_only";
      finalizeQcPhotoDraftApply({
        photoZones: pending.photoZones,
        proposed: pending.proposed,
        skipEntryMerge,
        zonePatchCount: pending.zonePatchCount,
        photoCount: pending.photoCount,
        entriesSnapshot: entries,
        titleSnapshot: title,
        inspectorSnapshot: inspectorNote,
        clientSnapshot: clientSectionValue,
        merge_choice: choice,
      });
    },
    [
      qcMergePending,
      entries,
      title,
      inspectorNote,
      clientSectionValue,
      finalizeQcPhotoDraftApply,
    ],
  );

  useEffect(() => {
    if (!qcMergePending) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setQcMergePending(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [qcMergePending]);

  const applyPhotoQcDraftFromServer = useCallback(async (opts?: { auto?: boolean }) => {
    if (!viewerToken?.trim()) {
      if (!opts?.auto) {
        setError(
          language === "en"
            ? "Open this page with the full report link (includes ?token=…) to run this action."
            : "Ouvrez cette page avec le lien complet du rapport (?token=…) pour lancer cette action.",
        );
      }
      return;
    }
    if (photoQcDraftLockRef.current) return;
    photoQcDraftLockRef.current = true;
    setPhotoQcDraftBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/report-photos-qc-draft", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          report_id: reportId,
          access_token: viewerToken,
          language,
          entries: entries.map((e) => ({
            zone: e.zone,
            note: e.note ?? "",
          })),
        }),
      });
      const body = (await res.json().catch(() => ({}))) as {
        success?: boolean;
        error?: string;
        photo_count?: number;
        photo_zones?: Record<string, string>;
        proposed_entries?: ReportEntryInput[];
      };
      if (!res.ok || !body.success) {
        throw new Error(typeof body.error === "string" ? body.error : `Erreur ${res.status}`);
      }
      const photoZones = body.photo_zones ?? {};
      const proposed = Array.isArray(body.proposed_entries) ? body.proposed_entries : [];
      const photoCount = typeof body.photo_count === "number" ? body.photo_count : 0;
      if (photoCount === 0) {
        if (!opts?.auto) {
          setStatus(
            language === "en"
              ? "No usable photo analyses yet — upload photos and wait a few seconds, then retry."
              : "Pas d’analyses photo exploitables pour l’instant — téléversez des photos, attendez quelques secondes, puis réessayez.",
          );
        }
        emitProductEvent("photos_qc_draft_apply", { report_id: reportId, ok: true, empty: true });
        return;
      }

      const baseline = draftBaselineRef.current;
      const manualEdit =
        baseline != null &&
        (title.trim() !== baseline.title ||
          inspectorNote !== baseline.inspectorNote ||
          clientSectionValue !== baseline.clientFacingSnapshot ||
          serializeEntriesForBaseline(entries) !== baseline.entriesJson);

      const zonePatchCount = photos.filter((p) => {
        const sid = p.serverPhotoId?.trim();
        if (!sid) return false;
        const inferred = photoZones[sid];
        if (!inferred || !ZONES.some((z) => z.value === inferred)) return false;
        return (p.linked_zone ?? "autre") === "autre";
      }).length;

      if (manualEdit && proposed.length > 0) {
        if (opts?.auto) {
          finalizeQcPhotoDraftApply({
            photoZones,
            proposed,
            skipEntryMerge: false,
            zonePatchCount,
            photoCount,
            entriesSnapshot: entries,
            titleSnapshot: title,
            inspectorSnapshot: inspectorNote,
            clientSnapshot: clientSectionValue,
            merge_choice: "auto_full",
          });
        } else {
          setQcMergePending({ photoZones, proposed, zonePatchCount, photoCount });
        }
        return;
      }

      finalizeQcPhotoDraftApply({
        photoZones,
        proposed,
        skipEntryMerge: false,
        zonePatchCount,
        photoCount,
        entriesSnapshot: entries,
        titleSnapshot: title,
        inspectorSnapshot: inspectorNote,
        clientSnapshot: clientSectionValue,
        ...(opts?.auto ? { merge_choice: "auto_full" as const } : {}),
      });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setError(msg);
      emitProductEvent("photos_qc_draft_apply", { report_id: reportId, ok: false, error: msg });
    } finally {
      photoQcDraftLockRef.current = false;
      setPhotoQcDraftBusy(false);
    }
  }, [
    viewerToken,
    reportId,
    language,
    entries,
    photos,
    title,
    inspectorNote,
    clientSectionValue,
    finalizeQcPhotoDraftApply,
  ]);

  const applyPhotoQcDraftRef = useRef(applyPhotoQcDraftFromServer);
  applyPhotoQcDraftRef.current = applyPhotoQcDraftFromServer;

  useEffect(() => {
    if (!viewerToken?.trim() || !showEditor) return;
    if (photoAnalysisRefreshEpoch === 0) return;
    if (qcMergePending) return;
    const t = window.setTimeout(() => {
      void applyPhotoQcDraftRef.current({ auto: true });
    }, 2800);
    return () => window.clearTimeout(t);
  }, [photoAnalysisRefreshEpoch, viewerToken, showEditor, qcMergePending]);

  const buildReportContentBody = useMemo(
    () => ({
      report_id: reportId,
      access_token: viewerToken ?? "",
      title,
      inspector_note: inspectorNote,
      client_section: clientSectionValue,
      polish_client: polishClient,
      entries,
      language,
      jurisdiction,
      photos_coverage: photosCoverageByZone,
      ...(reportPhotoSelectionForPayload
        ? { report_photo_selection_v1: reportPhotoSelectionForPayload }
        : {}),
    }),
    [
      reportId,
      viewerToken,
      title,
      inspectorNote,
      clientSectionValue,
      polishClient,
      entries,
      language,
      jurisdiction,
      photosCoverageByZone,
      reportPhotoSelectionForPayload,
    ],
  );

  const postReportContent = useCallback(async () => {
    const reportContentMs = polishClient ? 240_000 : 180_000;
    const saveRes = await withTimeout(
      fetch("/api/report-content", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(buildReportContentBody),
      }),
      reportContentMs,
      "report-content",
    );
    const saveBody = await readResponseJson<{
      success?: boolean;
      error?: string;
      code?: string;
      polish_outcome?: "applied" | "too_long" | "aborted" | "unavailable" | "timeout";
    }>(saveRes);
    if (!saveRes.ok || !saveBody?.success) {
      if (saveBody?.code === "report_locked") {
        setContentSaveErrorCode("report_locked");
      }
      throw new Error(
        saveBody?.error ?? `Impossible d'enregistrer le contenu (${saveRes.status})`,
      );
    }
    setContentSaveErrorCode(null);
    return saveBody;
  }, [buildReportContentBody, polishClient]);

  const persistReportDraft = useCallback(async () => {
    if (!viewerToken?.trim()) {
      setError(
        language === "en"
          ? "Open this page with the full report link (includes ?token=…) to save."
          : "Ouvrez cette page avec le lien complet (?token=…) pour enregistrer.",
      );
      return;
    }
    if (entries.length === 0) return;
    setSavingDraft(true);
    setError(null);
    setContentSaveErrorCode(null);
    try {
      const saveBody = await postReportContent();
      let done =
        language === "en"
          ? "Draft saved to the server. Generate or refresh the PDF when ready."
          : "Brouillon enregistré sur le serveur. Générez ou rafraîchissez le PDF quand vous serez prêt.";
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
        done = `${done} ${extra}`;
      }
      setStatus(done);
      emitProductEvent("report_draft_saved", { report_id: reportId });
      localStorage.removeItem(storageKey);
      draftBaselineRef.current = {
        title: title.trim(),
        inspectorNote,
        clientFacingSnapshot: clientSectionValue,
        entriesJson: serializeEntriesForBaseline(entries),
      };
      draftBaselineCapturedRef.current = true;
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setStatus(null);
    } finally {
      setSavingDraft(false);
    }
  }, [
    viewerToken,
    postReportContent,
    language,
    labels,
    polishClient,
    router,
    storageKey,
    reportId,
    title,
    inspectorNote,
    clientSectionValue,
    entries,
  ]);

  useEffect(() => {
    if (qcAutoSaveNonce === 0) return;
    if (!viewerToken?.trim()) return;
    if (entries.length === 0) return;
    let cancelled = false;
    setAutoSavingAfterQc(true);
    setQcAutoSaveHint(null);
    void (async () => {
      try {
        const body = { ...buildReportContentBody, polish_client: false };
        const saveRes = await withTimeout(
          fetch("/api/report-content", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(body),
          }),
          180_000,
          "report-content",
        );
        const saveBody = await readResponseJson<{
          success?: boolean;
          error?: string;
          code?: string;
        }>(saveRes);
        if (cancelled) return;
        if (!saveRes.ok || !saveBody?.success) {
          if (saveBody?.code === "report_locked") {
            setQcAutoSaveHint(
              language === "en"
                ? "Auto-save skipped — report is locked. Use Save draft or unlock in admin."
                : "Sauvegarde auto impossible — rapport verrouillé. Enregistrez à la main ou déverrouillez en admin.",
            );
          } else {
            setQcAutoSaveHint(
              language === "en"
                ? "Auto-save failed — use “Save draft to server (no PDF)” below."
                : "Échec de la sauvegarde auto — utilisez « Enregistrer le brouillon (serveur, sans PDF) » ci-dessous.",
            );
          }
          return;
        }
        emitProductEvent("report_draft_saved", { report_id: reportId, trigger: "qc_photo_apply" });
        try {
          localStorage.removeItem(storageKey);
        } catch {
          /* ignore */
        }
        draftBaselineRef.current = {
          title: title.trim(),
          inspectorNote,
          clientFacingSnapshot: clientSectionValue,
          entriesJson: serializeEntriesForBaseline(entries),
        };
        draftBaselineCapturedRef.current = true;
        router.refresh();
        const okHint =
          language === "en"
            ? "Also saved to the server (you can keep working)."
            : "Également enregistré sur le serveur — vous pouvez continuer sereinement.";
        setQcAutoSaveHint(okHint);
        window.setTimeout(() => {
          setQcAutoSaveHint((cur) => (cur === okHint ? null : cur));
        }, 10_000);
      } catch {
        if (!cancelled) {
          setQcAutoSaveHint(
            language === "en"
              ? "Auto-save failed — check the connection and use Save draft."
              : "Sauvegarde auto échouée — vérifiez la connexion puis « Enregistrer le brouillon ».",
          );
        }
      } finally {
        if (!cancelled) setAutoSavingAfterQc(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [
    qcAutoSaveNonce,
    viewerToken,
    entries.length,
    entries,
    buildReportContentBody,
    language,
    router,
    storageKey,
    title,
    inspectorNote,
    clientSectionValue,
    reportId,
  ]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!showEditor || !viewerToken?.trim() || entries.length === 0) return;
    if (!draftBaselineCapturedRef.current) return;
    const baseline = draftBaselineRef.current;
    if (!baseline) return;
    const dirty =
      title.trim() !== baseline.title ||
      inspectorNote !== baseline.inspectorNote ||
      clientSectionValue !== baseline.clientFacingSnapshot ||
      serializeEntriesForBaseline(entries) !== baseline.entriesJson;
    if (!dirty) return;
    if (manualSaveDebounceTimerRef.current != null) {
      window.clearTimeout(manualSaveDebounceTimerRef.current);
    }
    manualSaveDebounceTimerRef.current = window.setTimeout(() => {
      manualSaveDebounceTimerRef.current = null;
      if (savingDraftRef.current || autoSavingAfterQcRef.current) return;
      const rt = viewerToken?.trim();
      if (!rt) return;
      void (async () => {
        try {
          const body = { ...buildReportContentBody, polish_client: false };
          const saveRes = await withTimeout(
            fetch("/api/report-content", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify(body),
            }),
            180_000,
            "report-content",
          );
          const saveBody = await readResponseJson<{ success?: boolean; code?: string }>(saveRes);
          if (!saveRes.ok || !saveBody?.success) return;
          emitProductEvent("report_draft_saved", { report_id: reportId, trigger: "idle_debounce" });
          try {
            localStorage.removeItem(storageKey);
          } catch {
            /* ignore */
          }
          draftBaselineRef.current = {
            title: title.trim(),
            inspectorNote,
            clientFacingSnapshot: clientSectionValue,
            entriesJson: serializeEntriesForBaseline(entries),
          };
          draftBaselineCapturedRef.current = true;
          router.refresh();
          const idleHint =
            language === "en"
              ? "Draft synced to the server while you edit."
              : "Brouillon synchronisé sur le serveur pendant vos modifications.";
          setQcAutoSaveHint(idleHint);
          window.setTimeout(() => {
            setQcAutoSaveHint((cur) => (cur === idleHint ? null : cur));
          }, 8000);
        } catch {
          /* ignore */
        }
      })();
    }, 5200);
    return () => {
      if (manualSaveDebounceTimerRef.current != null) {
        window.clearTimeout(manualSaveDebounceTimerRef.current);
        manualSaveDebounceTimerRef.current = null;
      }
    };
  }, [
    showEditor,
    viewerToken,
    entries,
    title,
    inspectorNote,
    clientSectionValue,
    buildReportContentBody,
    language,
    router,
    storageKey,
    reportId,
  ]);

  const requestPdfGeneration = useCallback(async () => {
    let pdfRes: Response;
    try {
      pdfRes = await withTimeout(
        fetch("/api/trigger-inspection", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            report_id: reportId,
            access_token: viewerToken ?? "",
          }),
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
  }, [reportId, viewerToken]);

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
    draftBaselineCapturedRef.current = false;
    draftBaselineRef.current = null;
    setTitle(language === "en" ? "Automated inspection report" : "Rapport d'inspection automatisé");
    setInspectorNote("");
    setClientOverride(null);
    setClientSectionUserLocked(false);
    setPolishClient(false);
    setEntries([defaultEntry()]);
    setError(null);
    setStatus(null);
    setPdfLink(null);
    setLastSavedAt(null);
    setRetryAvailable(false);
  };

  const handleGenerate = async () => {
    try {
      setLoading(true);
      setError(null);
      setContentSaveErrorCode(null);
      setPdfLink(null);
      setRetryAvailable(false);

      const readiness = coverReadiness;

      if (readiness.gate === "blocked") {
        const critical = readiness.blocking.some((b) => b.severity === "block_critical");
        if (critical) {
          setError(labels.pdfGateBlockedCritical);
        } else {
          const lines = readiness.blocking.map((i) => `• ${i.messageFr}`).join("\n");
          setError(`${labels.pdfGateBlockedStandardIntro}\n${lines}`);
        }
        setLoading(false);
        noteFirstPdfBlocked(reportId);
        emitProductEvent("pdf_generate_blocked", {
          critical,
          gate: "blocked",
          blocking_codes: readiness.blocking.map((b) => b.code),
        });
        requestAnimationFrame(() => {
          document
            .getElementById(REPORT_READINESS_ZONE_ID)
            ?.scrollIntoView({ behavior: "smooth", block: "center" });
        });
        return;
      }
      if (readiness.gate === "warning") {
        const msg = readiness.warnings.map((w) => w.messageFr).join("\n");
        if (
          !window.confirm(
            `${msg}\n\nContinuer la génération du rapport et du PDF ?`,
          )
        ) {
          setLoading(false);
          return;
        }
      }

      setStatus(
        "Etape 1/2: generation du contenu structure… (1er appel : jusqu’a ~3 min si Next compile la route ou disque lent)",
      );
      const saveBody = await postReportContent();

      setStatus("Etape 2/2: generation du PDF...");
      const nextPdfLink = await requestPdfGeneration();
      if (nextPdfLink) {
        window.open(nextPdfLink, "_blank");
        setPdfLink(nextPdfLink);
      }
      emitProductEvent("pdf_generate_success", {
        report_id: reportId,
        has_pdf_link: !!nextPdfLink,
        via_retry: false,
        ...buildPdfSuccessTimingDetail(reportId),
      });
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

        {SIMPLE_MODE ? (
          <div className="rounded-xl border border-blue-200 bg-blue-50/90 p-4 shadow-sm">
            <p className="text-sm font-semibold text-blue-950">
              {language === "en" ? "Choose how to continue" : "Choisissez comment continuer"}
            </p>
            <p className="mt-1 text-xs text-blue-900/90">
              {language === "en"
                ? "Simple flow: one clear action at a time."
                : "Mode simple: une action claire à la fois."}
            </p>
            <div className="mt-3 grid gap-2 md:grid-cols-2">
              <button
                type="button"
                onClick={() => {
                  setSimpleFlowMode("live");
                  setShowEditor(true);
                }}
                className="rounded-xl border border-slate-300 bg-white px-4 py-3 text-left shadow-sm transition hover:bg-slate-50"
              >
                <p className="text-sm font-semibold text-slate-900">📷 {language === "en" ? "On site" : "Sur place"}</p>
                <p className="mt-0.5 text-xs text-slate-600">
                  {language === "en" ? "Add photos and findings" : "Ajouter photos et constats"}
                </p>
              </button>
              <button
                type="button"
                onClick={openUploadFlow}
                className="rounded-xl border border-blue-300 bg-white px-4 py-3 text-left shadow-sm transition hover:bg-blue-50"
              >
                <p className="text-sm font-semibold text-slate-900">📂 {language === "en" ? "Import photos" : "Importer photos"}</p>
                <p className="mt-0.5 text-xs text-slate-600">
                  {language === "en"
                    ? "Upload all photos, then review auto findings"
                    : "Importer toutes les photos, puis revoir les constats auto"}
                </p>
              </button>
            </div>
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => {
                  setSimpleFlowMode("live");
                  setShowEditor(true);
                }}
                className="rounded-lg border border-slate-300 bg-white px-4 py-2.5 text-sm font-medium text-slate-700 shadow-sm transition hover:bg-slate-50"
              >
                {labels.editReport}
              </button>
              <button
                type="button"
                onClick={openEditorAndJumpToPhotos}
                className="rounded-lg bg-blue-700 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-blue-800"
              >
                {language === "en" ? "Go to photos" : "Aller aux photos"}
              </button>
            </div>
          </div>
        ) : (
          <div className="sticky top-2 z-20 rounded-xl border border-blue-200 bg-blue-50/90 p-3 shadow-sm">
            <p className="text-xs text-blue-900">
              {language === "en"
                ? "Quick actions: edit findings and add photos without scrolling to the end."
                : "Actions rapides : modifier les constats et ajouter des photos sans descendre en bas de page."}
            </p>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => setShowEditor(true)}
                className="rounded-lg border border-slate-300 bg-white px-4 py-2.5 text-sm font-medium text-slate-700 shadow-sm transition hover:bg-slate-50"
              >
                {labels.editReport}
              </button>
              <button
                type="button"
                onClick={openEditorAndJumpToPhotos}
                className="rounded-lg bg-blue-700 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-blue-800"
              >
                {language === "en" ? "Add / manage photos" : "Ajouter / gérer les photos"}
              </button>
            </div>
          </div>
        )}

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
    <div className={`mx-auto max-w-5xl space-y-6 ${showEditor && SIMPLE_MODE ? "pb-24" : ""}`}>
      {hasExistingReport && existingSections.length > 0 ? (
        <button
          type="button"
          onClick={() => setShowEditor(false)}
          className="rounded-lg border border-slate-300 bg-white px-4 py-2.5 text-sm font-medium text-slate-700 shadow-sm transition hover:bg-slate-50"
        >
          {labels.viewSections}
        </button>
      ) : null}

      {showEditor ? (
        <div
          className="sticky top-0 z-30 -mx-4 border-b border-slate-200/90 bg-white/95 px-4 py-2.5 shadow-sm backdrop-blur-sm supports-[backdrop-filter]:bg-white/85 md:mx-0 md:rounded-lg md:border md:px-3"
          role="region"
          aria-label={labels.stickyProgressLabel}
        >
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-xs">
            <span className="font-semibold tracking-tight text-slate-700">{labels.stickyProgressLabel}</span>
            <div className="flex items-center gap-1.5" title={`${labels.journeyCover} · ${labels.journeyPhotos} · ${labels.journeyContent}`}>
              <span className={`inline-block h-2.5 w-2.5 rounded-full ${journeyDotClass(journeyCoverState)}`} />
              <span className={`inline-block h-2.5 w-2.5 rounded-full ${journeyDotClass(journeyPhotosState)}`} />
              <span className={`inline-block h-2.5 w-2.5 rounded-full ${journeyDotClass(journeyContentState)}`} />
            </div>
            <div className="flex min-w-[120px] max-w-[200px] flex-1 items-center gap-2">
              <span className="shrink-0 text-[10px] font-medium uppercase text-slate-500">
                {labels.stickyPreviewFill}
              </span>
              <div className="h-1.5 flex-1 rounded-full bg-slate-200">
                <div
                  className="h-1.5 rounded-full bg-slate-800 transition-all duration-500"
                  style={{ width: `${previewCompletion}%` }}
                />
              </div>
              <span className="shrink-0 font-mono text-[11px] font-semibold text-slate-700">{previewCompletion}%</span>
            </div>
            {autoSavingAfterQc ? (
              <span className="text-[11px] font-medium text-sky-800">{labels.stickyAutoSaving}</span>
            ) : qcAutoSaveHint ? (
              <span className="max-w-[min(100%,28rem)] text-[11px] font-medium text-emerald-800">{qcAutoSaveHint}</span>
            ) : null}
          </div>
        </div>
      ) : null}

      {showEditor && SIMPLE_MODE ? (
        <div className="rounded-xl border border-indigo-200 bg-indigo-50/80 p-4 shadow-sm">
          <p className="text-sm font-semibold text-indigo-950">
            {language === "en" ? "Inspection mission — 3 quick steps" : "Mission inspection — 3 étapes rapides"}
          </p>
          <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
            <span className="rounded-full bg-white px-2.5 py-1 font-semibold text-slate-800">1. {language === "en" ? "Photos" : "Photos"}</span>
            <span className="rounded-full bg-white px-2.5 py-1 font-semibold text-slate-800">2. {language === "en" ? "Findings" : "Constats"}</span>
            <span className="rounded-full bg-white px-2.5 py-1 font-semibold text-slate-800">3. PDF</span>
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={openEditorAndJumpToPhotos}
              className="rounded-lg bg-indigo-700 px-3 py-2 text-xs font-semibold text-white hover:bg-indigo-800"
            >
              {language === "en" ? "Step 1: Add photos" : "Étape 1 : Ajouter photos"}
            </button>
            <button
              type="button"
              onClick={() =>
                document.getElementById("report-entries-zone")?.scrollIntoView({
                  behavior: "smooth",
                  block: "start",
                })
              }
              className="rounded-lg border border-indigo-300 bg-white px-3 py-2 text-xs font-semibold text-indigo-900 hover:bg-indigo-100"
            >
              {language === "en" ? "Step 2: Add finding" : "Étape 2 : Ajouter constat"}
            </button>
            <button
              type="button"
              onClick={goToGenerateForOnboarding}
              className="rounded-lg border border-indigo-300 bg-white px-3 py-2 text-xs font-semibold text-indigo-900 hover:bg-indigo-100"
            >
              {language === "en" ? "Step 3: Generate PDF" : "Étape 3 : Générer PDF"}
            </button>
          </div>
        </div>
      ) : null}

      <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="text-xl font-semibold text-slate-900">{labels.title}</h2>
        {SIMPLE_MODE ? (
          <>
            <p className="mt-1 text-sm text-slate-600">
              {language === "en"
                ? "Simple mission: photos, findings, PDF."
                : "Mission simple: photos, constats, PDF."}
            </p>
            <div className="mt-3 flex flex-wrap items-center gap-2">
              {viewerToken ? (
                <Link
                  href={`/rapport/couverture?report=${encodeURIComponent(reportId)}&token=${encodeURIComponent(viewerToken)}`}
                  className="rounded-md border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-800 hover:bg-slate-50"
                >
                  {language === "en" ? "Open cover form" : "Ouvrir couverture"}
                </Link>
              ) : null}
              <button
                type="button"
                className="rounded-md bg-slate-900 px-3 py-2 text-xs font-semibold text-white hover:bg-slate-800"
                onClick={openEditorAndJumpToPhotos}
              >
                {language === "en" ? "Open photo step" : "Ouvrir étape photos"}
              </button>
              <button
                type="button"
                className="rounded-md border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-800 hover:bg-slate-50"
                onClick={() =>
                  document.getElementById("report-entries-zone")?.scrollIntoView({
                    behavior: "smooth",
                    block: "start",
                  })
                }
              >
                {language === "en" ? "Open findings step" : "Ouvrir étape constats"}
              </button>
            </div>
            <p className="mt-2 text-[11px] text-slate-500">
              {language === "en"
                ? "All AI fields remain editable for inspector validation."
                : "Tous les champs remplis par IA restent modifiables par l’inspecteur."}
            </p>
          </>
        ) : (
          <>
            <p className="mt-1 text-sm text-slate-600">
              {labels.subtitle}
            </p>
            <p className="mt-2 text-xs text-slate-500 leading-relaxed">
              {labels.complianceBilingual}
            </p>
            <p className="mt-1 text-xs text-slate-500">Environnement actif: {hostInfo || "n/a"}</p>
          </>
        )}
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
        {!SIMPLE_MODE ? (
        <div className="mt-4 rounded-lg border border-slate-100 bg-slate-50/90 px-3 py-3">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
            {labels.journeyCaption}
          </p>
          <ol className="mt-2 flex flex-wrap items-stretch gap-2">
            {(
              [
                {
                  key: "cover",
                  label: labels.journeyCover,
                  state: journeyCoverState,
                  action:
                    viewerToken?.trim() ? (
                      <Link
                        href={`/rapport/couverture?report=${encodeURIComponent(reportId)}&token=${encodeURIComponent(viewerToken)}`}
                        className="mt-1 inline-flex text-[11px] font-medium text-sky-800 underline-offset-2 hover:underline"
                      >
                        {labels.journeyOpenCover}
                      </Link>
                    ) : null,
                },
                {
                  key: "photos",
                  label: labels.journeyPhotos,
                  state: journeyPhotosState,
                  action: (
                    <button
                      type="button"
                      className="mt-1 inline-flex text-left text-[11px] font-medium text-sky-800 underline-offset-2 hover:underline"
                      onClick={goToPhotosForOnboarding}
                    >
                      {labels.journeyJumpPhotos}
                    </button>
                  ),
                },
                {
                  key: "content",
                  label: labels.journeyContent,
                  state: journeyContentState,
                  action: (
                    <button
                      type="button"
                      className="mt-1 inline-flex text-left text-[11px] font-medium text-sky-800 underline-offset-2 hover:underline"
                      onClick={goToGenerateForOnboarding}
                    >
                      {labels.journeyScrollPreview}
                    </button>
                  ),
                },
              ] as const
            ).map((step) => {
              const badge =
                step.state === "ok"
                  ? { bg: "bg-emerald-100", text: "text-emerald-900", cap: labels.journeyDone }
                  : step.state === "blocked"
                    ? { bg: "bg-rose-100", text: "text-rose-900", cap: labels.journeyBlocked }
                    : step.state === "idle"
                      ? { bg: "bg-slate-100", text: "text-slate-600", cap: labels.journeyNeedsToken }
                      : { bg: "bg-amber-50", text: "text-amber-950", cap: labels.journeyTodo };
              return (
                <li
                  key={step.key}
                  className="flex min-w-[140px] flex-1 flex-col rounded-md border border-slate-200/80 bg-white px-2.5 py-2 shadow-sm"
                >
                  <div className="flex items-center justify-between gap-1">
                    <span className="text-xs font-semibold text-slate-900">{step.label}</span>
                    <span
                      className={`shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-bold ${badge.bg} ${badge.text}`}
                    >
                      {badge.cap}
                    </span>
                  </div>
                  {step.action}
                </li>
              );
            })}
          </ol>
          <p className="mt-2 text-[11px] leading-snug text-slate-600">{labels.journeyHint}</p>
        </div>
        ) : null}

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

      {showEditor && !composerCoachDismissed && !SIMPLE_MODE ? (
        <div className="rounded-xl border border-sky-200 bg-gradient-to-br from-sky-50 to-white px-4 py-3.5 shadow-sm">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <p className="text-sm font-semibold text-sky-950">{labels.coachTitle}</p>
            <button
              type="button"
              className="shrink-0 rounded-md border border-sky-300 bg-white px-2.5 py-1 text-[11px] font-semibold text-sky-900 hover:bg-sky-100"
              onClick={() => {
                try {
                  localStorage.setItem("inspectflow:report-composer-coach-dismissed", "1");
                } catch {
                  /* ignore */
                }
                setComposerCoachDismissed(true);
              }}
            >
              {labels.coachDismiss}
            </button>
          </div>
          <ul className="mt-2 space-y-1.5 text-xs leading-snug text-sky-950/95">
            <li className="flex gap-2">
              <span className="font-bold text-sky-700" aria-hidden>
                1.
              </span>
              <span>{labels.coachBullet1}</span>
            </li>
            <li className="flex gap-2">
              <span className="font-bold text-sky-700" aria-hidden>
                2.
              </span>
              <span>{labels.coachBullet2}</span>
            </li>
            <li className="flex gap-2">
              <span className="font-bold text-sky-700" aria-hidden>
                3.
              </span>
              <span>{labels.coachBullet3}</span>
            </li>
          </ul>
        </div>
      ) : null}

      {!SIMPLE_MODE ? (
      <FirstReportGuidedOnboarding
        reportId={reportId}
        language={language}
        suppress={!!pdfLink || !!initialData?.hasPdf}
        validPhotoCount={validPhotoCount}
        reportTitleStarted={title.trim().length > 2}
        onGoToCover={goToCoverStepForOnboarding}
        onGoToPhotos={goToPhotosForOnboarding}
        onGoToGenerate={goToGenerateForOnboarding}
      />
      ) : null}

      {!SIMPLE_MODE ? (
      <ReportMissionSummary
        language={language}
        entries={entries}
        photosCoverageByZone={photosCoverageByZone as Record<string, number>}
        validPhotoCount={validPhotoCount}
        reportPayload={reportPayloadForBuyer}
        terrainPreferences={terrainPrefs}
        buyerProfile={buyerProfilePick}
      />
      ) : null}

      {!SIMPLE_MODE ? (
      <div className="grid gap-3 md:grid-cols-2">
        <ReportViewModeToggle
          mode={viewMode}
          language={language}
          onChange={(m) => {
            setViewMode(m);
            saveReportViewMode(m);
            scheduleCloudProfileSync(userProfile, m);
          }}
        />
        <UserAgentPreferencesInline
          profile={userProfile}
          language={language}
          onChange={(p) => {
            const next = saveUserAgentProfile(p);
            setUserProfile(next);
            scheduleCloudProfileSync(next, viewMode);
          }}
        />
      </div>
      ) : null}

      {reportAlmostComplete ? (
        <div
          className={`mt-3 rounded-xl border px-4 py-3 text-sm shadow-sm ${
            pdfExportBlocked
              ? "border-amber-200 bg-amber-50 text-amber-950"
              : "border-emerald-200 bg-emerald-50 text-emerald-950"
          }`}
          role="status"
        >
          <p className="font-semibold">{labels.finishInspectionTitle}</p>
          <p className="mt-1 text-xs leading-snug opacity-95">
            {pdfExportBlocked ? labels.finishInspectionBlocked : labels.finishInspectionReady}
          </p>
          <button
            type="button"
            className="mt-2 inline-flex rounded-md bg-slate-900 px-3 py-1.5 text-xs font-semibold text-white hover:bg-slate-800"
            onClick={() =>
              document.getElementById("inspectflow-step-3")?.scrollIntoView({
                behavior: "smooth",
                block: "start",
              })
            }
          >
            {labels.finishInspectionGoPdf}
          </button>
        </div>
      ) : null}

      <div className="mt-3">
        <ReportLivePreviewBanner
          language={language}
          previewText={clientSectionValue}
          entriesCount={entries.length}
          photosCount={validPhotoCount}
          completionPercent={previewCompletion}
          reportId={reportId}
          viewerToken={viewerToken}
          supabaseAccessToken={supabaseAccessToken}
          livePayload={htmlPreviewPayload}
          labels={{
            htmlPreview: labels.htmlPreviewTitle,
            htmlLoading: labels.htmlPreviewLoading,
            htmlError: labels.htmlPreviewError,
          }}
        />
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <div className="space-y-6">
          <InspectorStepBlock
            step={1}
            title={labels.step1Title}
            hint={labels.step1Hint}
            id="inspectflow-step-1"
          >
            {viewerToken?.trim() ? (
              <div className="rounded-lg border border-amber-200 bg-amber-50/90 p-4">
                <p className="text-sm font-semibold text-amber-950">{labels.step1CoverBoxTitle}</p>
                <p className="mt-1 text-xs leading-relaxed text-amber-900">{labels.step1CoverBoxBody}</p>
                <Link
                  href={`/rapport/couverture?report=${encodeURIComponent(reportId)}&token=${encodeURIComponent(viewerToken.trim())}`}
                  className="mt-3 inline-flex rounded-md bg-amber-800 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-amber-900"
                >
                  {labels.openCoverPage}
                </Link>
              </div>
            ) : (
              <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
                {labels.missingToken}
              </p>
            )}

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
          </InspectorStepBlock>

          <InspectorStepBlock
            step={2}
            title={labels.step2Title}
            hint={labels.step2Hint}
            id="inspectflow-step-2"
          >
          {viewMode === "inspector" ? (
            <TerrainGuidePanel
              language={language}
              entries={entries}
              photosCoverageByZone={photosCoverageByZone as Record<string, number>}
              validPhotoCount={validPhotoCount}
              preferences={terrainPrefs}
              onPresetZoneForNextPhoto={(z) => {
                terrainPresetZoneRef.current = z;
              }}
              onScrollToPhotos={scrollToPhotosZone}
            />
          ) : null}

          <BuyerModePanel
            language={language}
            entries={entries}
            reportPayload={reportPayloadForBuyer}
            profile={buyerProfilePick}
            viewMode={viewMode}
          />

          <div
            id="report-photos-zone"
            className={`scroll-mt-28 rounded-lg border border-slate-200 p-4 transition-shadow ${
              photoZoneOnboardingGlow
                ? "ring-2 ring-sky-400 ring-offset-2 shadow-md"
                : ""
            }`}
          >
            <p className="text-sm font-medium text-slate-700 mb-3">
              {language === "en" ? "Photos" : "Photos"}
            </p>
            <LiveInspectionCapture
              reportId={reportId}
              viewerToken={viewerToken}
              language={language}
              disabled={loading || uploadingPhoto}
              guideHint={
                terrainStepLive?.kind === "photo"
                  ? language === "en"
                    ? terrainStepLive.title_en
                    : terrainStepLive.title_fr
                  : undefined
              }
              onPhotoUploaded={() => {
                router.refresh();
                schedulePhotoAnalysisRefresh();
              }}
            />
            {validPhotoCount > 0 && viewerToken?.trim() ? (
              <p
                className="mt-2 rounded-md border border-emerald-200 bg-emerald-50/95 px-3 py-2 text-xs font-medium leading-snug text-emerald-950"
                role="note"
              >
                {labels.photoAfterUploadReminder}
              </p>
            ) : null}
            {validPhotoCount > 0 && viewerToken?.trim() ? (
              <p
                className="mt-2 rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-xs leading-snug text-slate-800"
                role="note"
              >
                {labels.photoSmartSelectionHint}
              </p>
            ) : null}
            {validPhotoCount > 0 && viewerToken?.trim() ? (
              <label className="mt-2 flex cursor-pointer items-start gap-2 rounded-md border border-amber-200/90 bg-amber-50/80 px-3 py-2 text-xs leading-snug text-amber-950">
                <input
                  type="checkbox"
                  className="mt-0.5 h-3.5 w-3.5 shrink-0 rounded border-amber-400 text-amber-700 focus:ring-amber-600"
                  checked={photoSelectionLocked}
                  onChange={(e) => setPhotoSelectionLocked(e.target.checked)}
                  disabled={loading || uploadingPhoto}
                />
                <span>
                  <span className="font-semibold">
                    {language === "en" ? "Lock photo selection" : "Verrouiller la sélection des photos"}
                  </span>
                  <span className="mt-0.5 block text-amber-900/90">
                    {language === "en"
                      ? "Turns off automatic picks when findings or analyses change. You can still include or exclude each photo manually."
                      : "Désactive les choix automatiques quand les constats ou les analyses changent. Vous pouvez toujours inclure ou retirer chaque photo à la main."}
                  </span>
                </span>
              </label>
            ) : null}
            {viewerToken?.trim() ? (
              <div className="mt-3 rounded-lg border border-indigo-200/80 bg-indigo-50/70 px-3 py-2.5 text-xs text-indigo-950">
                <p className="font-semibold text-sm text-indigo-950">{labels.applyPhotoQcDraft}</p>
                <p className="mt-1 leading-snug text-indigo-900/90">{labels.applyPhotoQcDraftHint}</p>
                <button
                  type="button"
                  disabled={loading || uploadingPhoto || photoQcDraftBusy}
                  onClick={() => void applyPhotoQcDraftFromServer()}
                  className="mt-2 rounded-md bg-indigo-600 px-3 py-1.5 text-xs font-semibold text-white shadow-sm hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {photoQcDraftBusy
                    ? language === "en"
                      ? "Working…"
                      : "Traitement…"
                    : labels.applyPhotoQcDraftRun}
                </button>
              </div>
            ) : null}
            <input
              ref={photoInputRef}
              id="report-photos-input"
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
            <div
              className={`rounded-md border-2 border-dashed px-4 py-6 text-sm transition ${
                photoDropHover
                  ? "border-blue-500 bg-blue-50/80 text-blue-800"
                  : "border-slate-300 text-slate-500 hover:border-blue-400 hover:text-blue-600"
              }`}
              onDragEnter={(e) => {
                e.preventDefault();
                e.stopPropagation();
                photoDragDepthRef.current += 1;
                setPhotoDropHover(true);
              }}
              onDragLeave={(e) => {
                e.preventDefault();
                e.stopPropagation();
                photoDragDepthRef.current = Math.max(0, photoDragDepthRef.current - 1);
                if (photoDragDepthRef.current === 0) setPhotoDropHover(false);
              }}
              onDragOver={(e) => {
                e.preventDefault();
                e.stopPropagation();
              }}
              onDrop={(e) => {
                e.preventDefault();
                e.stopPropagation();
                photoDragDepthRef.current = 0;
                setPhotoDropHover(false);
                if (loading || uploadingPhoto) return;
                const dt = e.dataTransfer?.files;
                if (dt && dt.length > 0) handlePhotoUpload(dt);
              }}
            >
              <button
                type="button"
                disabled={loading || uploadingPhoto}
                onClick={() => photoInputRef.current?.click()}
                className="flex w-full cursor-pointer flex-col items-center justify-center gap-1 bg-transparent text-inherit disabled:cursor-not-allowed disabled:opacity-60"
              >
                {uploadingPhoto ? (
                  <>
                    <span>
                      {language === "en"
                        ? "🧠 Upload & photo analysis…"
                        : "🧠 Téléversement & analyse des photos…"}
                    </span>
                    {photoUploadProgress ? (
                      <span className="text-xs font-medium tabular-nums">
                        {photoUploadProgress.done} / {photoUploadProgress.total}
                      </span>
                    ) : null}
                  </>
                ) : (
                  <span>
                    {language === "en"
                      ? "Click or drop photos here"
                      : "Cliquez ou déposez des photos ici"}
                  </span>
                )}
              </button>
            </div>
            {photos.length > 0 ? (
              <div className="mt-3 grid grid-cols-3 gap-2">
                {photos.map((photo) => {
                  const photoRowKeyForReason = (photo.serverPhotoId?.trim() || photo.id).trim();
                  const photoSelectionReason = photoSelectionReasonsByKey[photoRowKeyForReason];
                  const selectedForReport =
                    photo.report_tier != null ? photo.report_tier !== "excluded" : Boolean(photo.selected_for_report);
                  const currentTier: Exclude<ReportPhotoTier, "excluded"> =
                    photo.report_tier === "critical" ? "critical" : "support";
                  return (
                  <div key={photo.id} className="rounded-md border border-slate-200 p-1.5 text-center">
                    {photo.url ? (
                      // URLs Storage publiques — évite next/image (domaines / tailles variables en session).
                      // eslint-disable-next-line @next/next/no-img-element -- thumbnails terrain depuis Supabase public URL
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
                    {photo.url && !photo.uploading ? (
                      <label className="mt-1 block text-left">
                        <span className="sr-only">Zone</span>
                        <select
                          className="mt-0.5 w-full rounded border border-slate-200 px-1 py-0.5 text-[10px] text-slate-800"
                          value={photo.linked_zone ?? "autre"}
                          onChange={(e) => {
                            const z = e.target.value as ZoneCode;
                            setPhotos((prev) =>
                              prev.map((p) => (p.id === photo.id ? { ...p, linked_zone: z } : p)),
                            );
                          }}
                        >
                          {ZONES.map((z) => (
                            <option key={z.value} value={z.value}>
                              {z.label}
                            </option>
                          ))}
                        </select>
                      </label>
                    ) : null}
                    {photo.ai_score != null && !photo.error ? (
                      <p className="text-[10px] font-medium text-violet-800">
                        IA {(photo.ai_score * 100).toFixed(0)}%
                        {selectedForReport ? (
                          <span className="ml-1 rounded bg-violet-100 px-1 font-semibold text-violet-900">
                            {language === "en" ? "AI selected" : "IA sélectionnée"}
                          </span>
                        ) : null}
                      </p>
                    ) : null}
                    {photo.url && !photo.uploading ? (
                      <button
                        type="button"
                        className="mt-1 text-[10px] font-medium text-blue-700 underline"
                        onClick={() =>
                          setPhotos((prev) =>
                            prev.map((p) =>
                              p.id === photo.id
                                ? {
                                    ...p,
                                    selected_for_report: !selectedForReport,
                                    report_tier: !selectedForReport ? "support" : "excluded",
                                  }
                                : p,
                            ),
                          )
                        }
                      >
                        {selectedForReport
                          ? language === "en"
                            ? "Deselect for summary"
                            : "Retirer de la sélection"
                          : language === "en"
                            ? "Select for summary"
                            : "Inclure sélection"}
                      </button>
                    ) : null}
                    {photo.url && !photo.uploading && selectedForReport ? (
                      <label className="mt-1 block text-left">
                        <span className="sr-only">
                          {language === "en" ? "Photo tier" : "Niveau de photo"}
                        </span>
                        <select
                          className="w-full rounded border border-amber-200 bg-amber-50 px-1 py-0.5 text-[10px] font-medium text-amber-950"
                          value={currentTier}
                          onChange={(e) => {
                            const t = e.target.value === "critical" ? "critical" : "support";
                            setPhotos((prev) =>
                              prev.map((p) =>
                                p.id === photo.id
                                  ? { ...p, report_tier: t, selected_for_report: true }
                                  : p,
                              ),
                            );
                          }}
                        >
                          <option value="critical">
                            {language === "en" ? "Critical evidence" : "Critique (preuve)"}
                          </option>
                          <option value="support">
                            {language === "en" ? "Support context" : "Support (contexte)"}
                          </option>
                        </select>
                      </label>
                    ) : null}
                    {selectedForReport && photoSelectionReason ? (
                      <p className="mt-1 text-left text-[9px] leading-snug text-slate-600">
                        {language === "en" ? photoSelectionReason.en : photoSelectionReason.fr}
                      </p>
                    ) : null}
                    {photo.error ? (
                      <p className="text-xs text-red-500">{photo.error}</p>
                    ) : null}
                  </div>
                  );
                })}
              </div>
            ) : null}
          </div>

            <p className="text-xs leading-relaxed text-slate-600">{labels.entriesBlockHint}</p>
            <div id="report-entries-zone" className="scroll-mt-28 space-y-3">
              {entries.map((entry, idx) => (
                <div key={idx} className="rounded-lg border border-slate-200 p-3">
                  <div className="mb-2 flex items-center justify-between">
                    <p className="text-sm font-semibold text-slate-800">
                      {labels.finding} #{idx + 1}
                    </p>
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

            <div className="flex flex-wrap items-center gap-2">
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
          </InspectorStepBlock>
        </div>

        <InspectorStepBlock
          step={3}
          title={labels.step3Title}
          hint={labels.step3Hint}
          id="inspectflow-step-3"
          surfaceClassName="bg-slate-50"
        >
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
                onClick={() => {
                  setClientOverride(null);
                  setClientSectionUserLocked(false);
                }}
              >
                {labels.regenerateClient}
              </button>
            </div>
            <p className="mt-1 text-xs text-slate-600">{labels.clientSectionHint}</p>
            {clientSectionUserLocked ? (
              <p className="mt-2 rounded-md border border-amber-200 bg-amber-50/90 px-2.5 py-2 text-[11px] leading-snug text-amber-950">
                {labels.clientSectionLockedHint}
              </p>
            ) : null}
            <textarea
              className="mt-2 min-h-36 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900"
              value={clientSectionValue}
              onChange={(e) => {
                setClientOverride(e.target.value);
                setClientSectionUserLocked(true);
              }}
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

          <NotesCapture
            reportId={reportId}
            language={language}
            onNotesProcessed={handleNotesProcessed}
          />

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

          {pdfExportBlocked && hasExistingReport ? (
            <div
              className={`rounded-lg border px-3 py-2 text-sm ${
                pdfGateWarning
                  ? "border-violet-200 bg-violet-50 text-violet-950"
                  : pdfBlockedCritical
                  ? "border-rose-300 bg-rose-50 text-rose-950"
                  : "border-amber-200 bg-amber-50 text-amber-950"
              }`}
              role="status"
            >
              <p className="font-medium">
                {pdfGateWarning
                  ? labels.pdfNotCertifiedWarning
                  : pdfBlockedCritical
                  ? labels.pdfBlockedCriticalBanner
                  : labels.pdfBlockedStandardBanner}
              </p>
              {viewerToken?.trim() ? (
                <Link
                  href={`/rapport/couverture?report=${encodeURIComponent(reportId)}&token=${encodeURIComponent(viewerToken.trim())}`}
                  className="mt-2 inline-block text-sm font-semibold text-blue-800 underline decoration-blue-400 underline-offset-2 hover:text-blue-950"
                >
                  {labels.openCoverPage}
                </Link>
              ) : null}
            </div>
          ) : null}

          {viewerToken?.trim() ? (
            <div className="space-y-1.5">
              <p className="text-xs text-slate-600">{labels.saveDraftHint}</p>
              <button
                type="button"
                disabled={loading || savingDraft || entries.length === 0}
                onClick={() => void persistReportDraft()}
                className="w-full rounded-md border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-800 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {savingDraft
                  ? language === "en"
                    ? "Saving…"
                    : "Enregistrement…"
                  : labels.saveDraftButton}
              </button>
            </div>
          ) : null}

          <button
            id="inspectflow-generate-pdf-cta"
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
                  emitProductEvent("pdf_generate_success", {
                    report_id: reportId,
                    has_pdf_link: !!nextPdfLink,
                    via_retry: true,
                    ...buildPdfSuccessTimingDetail(reportId),
                  });
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
        </InspectorStepBlock>
      </div>

      {showEditor && SIMPLE_MODE ? (
        <div className="fixed inset-x-0 bottom-0 z-40 border-t border-slate-200 bg-white/95 px-3 pb-[max(0.5rem,env(safe-area-inset-bottom))] pt-2 shadow-[0_-8px_24px_rgba(15,23,42,0.08)] backdrop-blur-sm">
          <div className="mx-auto grid max-w-5xl grid-cols-3 gap-2">
            <button
              type="button"
              onClick={openEditorAndJumpToPhotos}
              className="min-h-12 rounded-xl border border-slate-300 bg-white px-2 py-2 text-[11px] font-semibold text-slate-800 shadow-sm hover:bg-slate-50"
            >
              📷 {language === "en" ? "Photos" : "Photos"}
            </button>
            <button
              type="button"
              onClick={() =>
                document.getElementById("report-entries-zone")?.scrollIntoView({
                  behavior: "smooth",
                  block: "start",
                })
              }
              className="min-h-12 rounded-xl border border-slate-300 bg-white px-2 py-2 text-[11px] font-semibold text-slate-800 shadow-sm hover:bg-slate-50"
            >
              ➕ {language === "en" ? "Findings" : "Constats"}
            </button>
            <button
              type="button"
              onClick={goToGenerateForOnboarding}
              className="min-h-12 rounded-xl bg-slate-900 px-2 py-2 text-[11px] font-semibold text-white shadow-sm hover:bg-slate-800"
            >
              🧾 PDF
            </button>
          </div>
        </div>
      ) : null}

      {qcMergePending ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 p-4"
          role="presentation"
          onClick={() => resolveQcMergeChoice("cancel")}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="qc-merge-dialog-title"
            className="max-w-lg rounded-xl border border-slate-200 bg-white p-5 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 id="qc-merge-dialog-title" className="text-lg font-semibold text-slate-900">
              {labels.qcMergeDialogTitle}
            </h3>
            <p className="mt-2 text-sm leading-relaxed text-slate-600">{labels.qcMergeDialogBody}</p>
            <div className="mt-5 flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:justify-end">
              <button
                type="button"
                className="order-3 rounded-md border border-slate-300 bg-white px-4 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-50 sm:order-1"
                onClick={() => resolveQcMergeChoice("cancel")}
              >
                {labels.qcMergeCancel}
              </button>
              <button
                type="button"
                className="order-2 rounded-md border border-indigo-300 bg-indigo-50 px-4 py-2.5 text-sm font-semibold text-indigo-950 hover:bg-indigo-100"
                onClick={() => resolveQcMergeChoice("zones_only")}
              >
                {labels.qcMergeZonesOnly}
              </button>
              <button
                type="button"
                className="order-1 rounded-md bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white hover:bg-slate-800 sm:order-3"
                onClick={() => resolveQcMergeChoice("merge_all")}
              >
                {labels.qcMergeMergeAll}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
