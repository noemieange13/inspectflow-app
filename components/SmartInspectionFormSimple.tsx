"use client";

import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import {
  PROVINCES,
  REQUIRED_SECTIONS,
  LEGAL_CLAUSES,
  DISCLAIMER_TEMPLATES,
  TERMINOLOGY,
} from "@/lib/compliance/inspection-norms";
import type { ProvinceCode, SectionId } from "@/lib/compliance/inspection-norms";
import { useRouter } from "next/navigation";
import {
  Camera,
  Upload,
  MapPin,
  Calendar,
  Clock,
  User,
  FileText,
  CheckCircle,
  Sparkles,
  ChevronRight,
  CloudSun,
  AlertCircle,
  ChevronDown,
  ChevronUp,
  Mic,
  FolderOpen,
} from "lucide-react";
import FileUploadDebug from "@/components/FileUploadDebug";
import { compressDataUrlForStorage } from "@/lib/compressDataUrlForStorage";
import { extractExifBatch, formatExifLabel } from "@/lib/exif-utils";
import type { ExifData } from "@/lib/exif-utils";
import { useNetworkStatus } from "@/lib/hooks/useNetworkStatus";
import { saveOffline, getPendingSyncCount } from "@/lib/offline-storage";
import OfflineBanner from "@/components/OfflineBanner";
import { createObservationId } from "@/lib/observationIds";
import { persistSmartInspectionComplianceValidation } from "@/lib/compliance/persistSmartComplianceValidation";
import type { ComplianceValidationV1 } from "@/lib/compliance/compliance-rules/types";
import { COMPLIANCE_VALIDATION_RESPONSE_HEADER } from "@/lib/compliance/compliance-rules/validate";
import {
  applyPhotoPickAssignments,
  createSmartPhotoId,
  parseSmartPhotoRegistry,
  serializeSmartPhotoRegistry,
  SMART_PHOTO_REGISTRY_KEY,
  stripSmartSectionsForStorage,
  type SmartInspectionConstat,
  type SmartInspectionPhoto,
  type SmartInspectionSection,
  type SmartPhotoRegistryEntry,
} from "@/lib/smartInspectionPhotos";

// ─── fetchWithRetry ──────────────────────────────────────────────────────────
const fetchWithRetry = async (
  url: string,
  options: RequestInit,
  maxRetries = 5,
): Promise<Response> => {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const response = await fetch(url, {
        ...options,
        signal: AbortSignal.timeout(90_000),
      });

      if (response.status === 429) {
        if (attempt === maxRetries) {
          throw new Error("Erreur 429: Limite de débit OpenAI atteinte. Veuillez réessayer dans quelques secondes.");
        }
        const exponentialMs = Math.min(5000 * Math.pow(2, attempt - 1), 120_000);
        let retryAfterMs = exponentialMs;
        try {
          const data = await response.clone().json() as { retryAfterMs?: unknown };
          if (typeof data.retryAfterMs === "number" && Number.isFinite(data.retryAfterMs) && data.retryAfterMs > 0) {
            retryAfterMs = Math.max(retryAfterMs, Math.min(data.retryAfterMs, 120_000));
          }
        } catch { /* body non-JSON */ }
        const retryAfterHeader = response.headers.get("Retry-After");
        if (retryAfterHeader) {
          const fromHeader = parseFloat(retryAfterHeader) * 1000;
          if (Number.isFinite(fromHeader) && fromHeader > 0) {
            retryAfterMs = Math.max(retryAfterMs, Math.min(fromHeader, 120_000));
          }
        }
        await new Promise(resolve => setTimeout(resolve, retryAfterMs));
        continue;
      }

      if (response.status === 502 || response.status === 503) {
        if (attempt === maxRetries) {
          throw new Error(`Erreur ${response.status}: Le serveur est temporairement indisponible.`);
        }
        await new Promise(resolve => setTimeout(resolve, Math.min(1000 * Math.pow(2, attempt - 1), 5000)));
        continue;
      }

      if (!response.ok) {
        throw new Error(`Erreur HTTP ${response.status}: ${response.statusText}`);
      }

      return response;
    } catch (error) {
      if (error instanceof Error && error.name === "AbortError") {
        throw new Error("Timeout: La requête a pris trop de temps. Veuillez réessayer.");
      }
      if (attempt === maxRetries) throw error;
      if (error instanceof Error && (error.message.includes("fetch") || error.message.includes("network"))) {
        await new Promise(resolve => setTimeout(resolve, Math.min(1000 * Math.pow(2, attempt - 1), 3000)));
      } else {
        throw error;
      }
    }
  }
  throw new Error("Échec de toutes les tentatives");
};

// ─── Constants ───────────────────────────────────────────────────────────────
const SECTION_ID_TO_FORM_NAMES: Partial<Record<SectionId, string[]>> = {
  structural:  ["Fondation"],
  exterior:    ["Extérieur"],
  roofing:     ["Toiture"],
  plumbing:    ["Plomberie"],
  electrical:  ["Électricité"],
  heating:     ["Chauffage et Ventilation"],
  ventilation: ["Chauffage et Ventilation"],
  interior:    ["Intérieur"],
  insulation:  ["Isolation"],
};

const CONSTAT_SECTIONS = [
  "Toiture",
  "Fondation",
  "Extérieur",
  "Intérieur",
  "Plomberie",
  "Électricité",
  "Chauffage et Ventilation",
  "Isolation",
] as const;

type ConstatSection = typeof CONSTAT_SECTIONS[number];

// ─── Types ────────────────────────────────────────────────────────────────────
interface Deficiency {
  description: string;
  severity: "mineur" | "modéré" | "majeur" | "sécurité";
  category: string;
  recommendation: string;
  urgency: string;
  description_en?: string;
  recommendation_en?: string;
}

type ToastType = "success" | "error" | "info";
interface Toast {
  id: string;
  message: string;
  type: ToastType;
}

// ─── Module-level helpers ────────────────────────────────────────────────────
const sectionColor = (section: string): string => {
  const map: Record<string, string> = {
    "Toiture": "bg-blue-100 text-blue-800",
    "Fondation": "bg-red-100 text-red-800",
    "Extérieur": "bg-green-100 text-green-800",
    "Intérieur": "bg-purple-100 text-purple-800",
    "Plomberie": "bg-cyan-100 text-cyan-800",
    "Électricité": "bg-yellow-100 text-yellow-800",
    "Chauffage et Ventilation": "bg-orange-100 text-orange-800",
    "Isolation": "bg-indigo-100 text-indigo-800",
  };
  return map[section] ?? "bg-gray-100 text-gray-800";
};

const severityColor = (severity: string): string => {
  switch (severity) {
    case "mineur":   return "bg-yellow-100 text-yellow-800";
    case "modéré":   return "bg-orange-100 text-orange-800";
    case "majeur":   return "bg-red-100 text-red-800";
    case "sécurité": return "bg-red-200 text-red-900 animate-pulse";
    default:         return "bg-gray-100 text-gray-800";
  }
};


const fileToDataUrl = (file: File): Promise<string> =>
  new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onloadend = () => resolve(String(r.result));
    r.onerror = () => reject(r.error);
    r.readAsDataURL(file);
  });

const formatTime = (s: number): string =>
  `${Math.floor(s / 60).toString().padStart(2, "0")}:${(s % 60).toString().padStart(2, "0")}`;

// ─── Component ────────────────────────────────────────────────────────────────
export default function SmartInspectionFormSimple() {
  const router = useRouter();
  const conditionsMeteoRef = useRef<string>("");

  // ── Form state ───────────────────────────────────────────────────────────
  const [formData, setFormData] = useState({
    requerants: "",
    propriete_adresse: "",
    client_nom: "",
    client_telephone: "",
    client_courriel: "",
    type_propriete: "residential",
    annee_construction: "",
    date_heure: new Date()
      .toLocaleString("fr-CA", {
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
        hour12: false,
      })
      .replace(",", " h"),
    conditions_meteo: "",
    duree_inspection: "",
    description_mode: "photos_ia",
    description_sommaire: "",
    condition_generale: "",
    orientation_facade: "",
    dv_photo: null as File | null,
    building_photos: [] as File[],
    inspector_notes: [] as File[],
    voice_notes: [] as File[],
  });

  // ── Inspector state ──────────────────────────────────────────────────────
  const [inspectorInfo, setInspectorInfo] = useState({
    name: "",
    company: "",
    address: "",
    phone: "",
    email: "",
    aibqNumber: "",
    logoUrl: "",
    province: "QC",
    reportLanguage: "fr" as "fr" | "en" | "bilingual",
  });
  const [inspectorAccordionOpen, setInspectorAccordionOpen] = useState(true);

  // ── File states ──────────────────────────────────────────────────────────
  const [buildingPhotos, setBuildingPhotos] = useState<File[]>([]);
  const [dvPhoto, setDvPhoto] = useState<File | null>(null);
  const [inspectorNotes, setInspectorNotes] = useState<File[]>([]);
  const [voiceNotes, setVoiceNotes] = useState<File[]>([]);

  // ── Processing states ────────────────────────────────────────────────────
  const [isProcessing, setIsProcessing] = useState(false);
  const [weatherLoading, setWeatherLoading] = useState(false);
  const [isDragging, setIsDragging] = useState(false);

  // ── Photo classification ─────────────────────────────────────────────────
  const [photoClassifications, setPhotoClassifications] = useState<
    Map<string, { section: string; subTopic: string; confidence: number }>
  >(new Map());
  const [classificationProgress, setClassificationProgress] = useState(0);
  const [classifyBatchInfo, setClassifyBatchInfo] = useState<{
    current: number; total: number; photoTotal: number; unidentified: number;
  } | null>(null);
  const [editingClassification, setEditingClassification] = useState<string | null>(null);

  // ── Auto-constats ────────────────────────────────────────────────────────
  const [autoConstats, setAutoConstats] = useState<Map<string, string>>(new Map());
  const [autoConstatsEn, setAutoConstatsEn] = useState<Map<string, string>>(new Map());
  const [autoDeficiencies, setAutoDeficiencies] = useState<Map<string, Deficiency[]>>(new Map());
  const [autoConstatsLoading, setAutoConstatsLoading] = useState<Set<string>>(new Set());
  const [autoConstatsError, setAutoConstatsError] = useState<string | null>(null);
  const [autoConstatsInProgress, setAutoConstatsInProgress] = useState(false);
  const triggeredSectionsRef = useRef<Set<string>>(new Set());

  // ── Voice recording ──────────────────────────────────────────────────────
  const [isRecording, setIsRecording] = useState<string | null>(null);
  const [recordingTime, setRecordingTime] = useState(0);
  const [voiceLoading, setVoiceLoading] = useState(false);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const recordingTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // ── Toasts ───────────────────────────────────────────────────────────────
  const [toasts, setToasts] = useState<Toast[]>([]);

  // ── PDF state ─────────────────────────────────────────────────────────────
  const [isPdfGenerating, setIsPdfGenerating] = useState(false);
  const [submittedInspectionId, setSubmittedInspectionId] = useState<string | null>(null);

  // ── Network / Offline ────────────────────────────────────────────────────
  const { isOnline, wasOffline } = useNetworkStatus();
  const [pendingSyncCount, setPendingSyncCount] = useState(0);
  const [syncStatus, setSyncStatus] = useState<"idle" | "syncing" | "synced">("idle");
  const offlineSessionId = useRef("current-inspection");

  // ── Thumbnail cache ──────────────────────────────────────────────────────
  const thumbnailUrlsRef = useRef<Map<string, string>>(new Map());
  const [thumbnailVersion, setThumbnailVersion] = useState(0);

  // ── EXIF metadata ────────────────────────────────────────────────────────
  const [photoMetadata, setPhotoMetadata] = useState<Map<string, ExifData>>(new Map());

  // ── Compression cache ────────────────────────────────────────────────────
  const compressionCache = useRef<Map<string, string>>(new Map());
  const isAddingPhotosRef = useRef(false);
  const photoIdByFileNameRef = useRef<Map<string, string>>(new Map());
  const smartPhotoRegistryRef = useRef<Map<string, SmartPhotoRegistryEntry>>(new Map());
  const fileInputBrowseRef = useRef<HTMLInputElement>(null);
  const fileInputCameraRef = useRef<HTMLInputElement>(null);
  const fileInputDirRef = useRef<HTMLInputElement>(null);

  // ── addToast ─────────────────────────────────────────────────────────────
  const addToast = useCallback((message: string, type: ToastType = "info") => {
    const id = Math.random().toString(36).slice(2);
    setToasts(prev => [...prev, { id, message, type }]);
    setTimeout(() => setToasts(prev => prev.filter(t => t.id !== id)), 4000);
  }, []);

  // ── Effects: localStorage load ───────────────────────────────────────────
  useEffect(() => {
    const saved = localStorage.getItem("inspectorInfo");
    if (saved) {
      try {
        const parsed = JSON.parse(saved) as Partial<typeof inspectorInfo>;
        setInspectorInfo(prev => ({ ...prev, ...parsed }));
        if (parsed.name && parsed.company) {
          setInspectorAccordionOpen(false);
        }
      } catch { /* ignore */ }
    }
  }, []);

  useEffect(() => {
    try {
      const saved = localStorage.getItem("photoClassifications");
      if (saved) {
        const parsed = JSON.parse(saved) as [string, { section: string; subTopic: string; confidence: number }][];
        setPhotoClassifications(new Map(parsed));
      }
    } catch { /* ignore */ }
  }, []);

  useEffect(() => {
    try {
      const saved = localStorage.getItem(SMART_PHOTO_REGISTRY_KEY);
      if (!saved) return;
      const registry = parseSmartPhotoRegistry(JSON.parse(saved));
      smartPhotoRegistryRef.current = registry;
      for (const entry of registry.values()) {
        if (entry.name) photoIdByFileNameRef.current.set(entry.name, entry.photo_id);
      }
    } catch { /* ignore */ }
  }, []);

  const persistSmartPhotoRegistry = useCallback(() => {
    try {
      localStorage.setItem(
        SMART_PHOTO_REGISTRY_KEY,
        JSON.stringify(serializeSmartPhotoRegistry(smartPhotoRegistryRef.current)),
      );
    } catch { /* quota */ }
  }, []);

  const registerBuildingPhotoIds = useCallback(
    (files: File[]) => {
      let changed = false;
      for (const file of files) {
        let photoId = photoIdByFileNameRef.current.get(file.name);
        if (!photoId) {
          photoId = createSmartPhotoId();
          photoIdByFileNameRef.current.set(file.name, photoId);
          smartPhotoRegistryRef.current.set(photoId, {
            photo_id: photoId,
            name: file.name,
            observation_id: null,
          });
          changed = true;
        }
      }
      if (changed) persistSmartPhotoRegistry();
    },
    [persistSmartPhotoRegistry],
  );

  // ── Effect: default reportLanguage by province ───────────────────────────
  useEffect(() => {
    const prov = inspectorInfo.province || "QC";
    const defaultLang: "fr" | "en" | "bilingual" =
      prov === "QC" ? "fr" : prov === "NB" ? "bilingual" : "en";
    setInspectorInfo(prev => {
      if (prev.reportLanguage === defaultLang) return prev;
      // Only auto-set if the current value matches a previous province default
      // (so manual changes by the user are not overridden by unrelated province changes)
      const prevProvDefault: "fr" | "en" | "bilingual" =
        prev.province === "QC" ? "fr" : prev.province === "NB" ? "bilingual" : "en";
      if (prev.reportLanguage !== prevProvDefault) return prev; // user customised it
      const updated = { ...prev, reportLanguage: defaultLang };
      localStorage.setItem("inspectorInfo", JSON.stringify(updated));
      return updated;
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [inspectorInfo.province]);

  // ── Effect: auto date/heure ──────────────────────────────────────────────
  useEffect(() => {
    if (!formData.date_heure) {
      const now = new Date();
      setFormData(prev => ({
        ...prev,
        date_heure: now.toLocaleString("fr-CA", {
          year: "numeric",
          month: "2-digit",
          day: "2-digit",
          hour: "2-digit",
          minute: "2-digit",
        }),
      }));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Effect: auto-weather debounce (1.5s after address, skip if already set) ─
  useEffect(() => {
    if (!formData.propriete_adresse || formData.conditions_meteo) return;
    const timer = setTimeout(() => {
      fetchWeather();
    }, 1500);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [formData.propriete_adresse]);

  // ── Effect: thumbnail management ─────────────────────────────────────────
  useEffect(() => {
    const currentNames = new Set(buildingPhotos.map(f => f.name));
    for (const [name, url] of thumbnailUrlsRef.current) {
      if (!currentNames.has(name)) {
        URL.revokeObjectURL(url);
        thumbnailUrlsRef.current.delete(name);
      }
    }
    for (const file of buildingPhotos) {
      if (!thumbnailUrlsRef.current.has(file.name)) {
        thumbnailUrlsRef.current.set(file.name, URL.createObjectURL(file));
      }
    }
    setThumbnailVersion(v => v + 1);
  }, [buildingPhotos]);

  useEffect(() => {
    return () => {
      for (const url of thumbnailUrlsRef.current.values()) URL.revokeObjectURL(url);
    };
  }, []);

  // ── Effect: set webkitdirectory on directory file input ──────────────────
  useEffect(() => {
    if (fileInputDirRef.current) {
      fileInputDirRef.current.setAttribute("webkitdirectory", "");
      fileInputDirRef.current.setAttribute("directory", "");
    }
  }, []);

  // ── Effect: persist photos + voice notes to IDB (offline backup) ─────────
  useEffect(() => {
    if (buildingPhotos.length === 0 && voiceNotes.length === 0) return;
    const sessionId = offlineSessionId.current;
    saveOffline(sessionId, {
      photos: buildingPhotos,
      voiceNotes,
      formData: formData as unknown as Record<string, unknown>,
    }).catch(() => {/* non-critical */});
    // Update pending count when offline
    if (!isOnline) {
      getPendingSyncCount().then(setPendingSyncCount).catch(() => {});
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [buildingPhotos.length, voiceNotes.length]);

  // ── Effect: re-classify unclassified photos when network comes back ───────
  useEffect(() => {
    if (!wasOffline) return;
    const unclassified = buildingPhotos.filter(
      (f) => !photoClassifications.has(f.name)
    );
    if (unclassified.length === 0) {
      setSyncStatus("synced");
      setPendingSyncCount(0);
      return;
    }
    setSyncStatus("syncing");
    classifyPhotosInBackground(unclassified).finally(() => {
      setSyncStatus("synced");
      setPendingSyncCount(0);
      setTimeout(() => setSyncStatus("idle"), 4_000);
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [wasOffline]);


  const updateInspectorInfo = (field: keyof typeof inspectorInfo, value: string) => {
    const updated = { ...inspectorInfo, [field]: value } as typeof inspectorInfo;
    setInspectorInfo(updated);
    localStorage.setItem("inspectorInfo", JSON.stringify(updated));
  };

  // ── fetchWeather ─────────────────────────────────────────────────────────
  const fetchWeather = async () => {
    if (!formData.propriete_adresse) return;
    setWeatherLoading(true);
    try {
      await new Promise(resolve => setTimeout(resolve, 1000));
      const weatherValue = "Ensoleillé, 18°C, vent léger du sud-ouest";
      conditionsMeteoRef.current = weatherValue;
      setFormData(prev => ({ ...prev, conditions_meteo: weatherValue }));
    } catch (error) {
      console.error("Erreur météo:", error);
    } finally {
      setWeatherLoading(false);
    }
  };

  // ── classifyPhotosInBackground ───────────────────────────────────────────
  const classifyPhotosInBackground = useCallback(async (photos: File[]) => {
    if (photos.length === 0) return;
    const photosToProcess = photos; // classify ALL photos — no 50-photo cap
    const batchSize = 20; // was 10
    const totalBatches = Math.ceil(photosToProcess.length / batchSize);
    const sections = (REQUIRED_SECTIONS[(inspectorInfo.province || "QC") as ProvinceCode] ?? REQUIRED_SECTIONS.CA)
      .filter(s => s.isPhysicalSystem)
      .map(s => s.labelFr);
    const accumulated = new Map<string, { section: string; subTopic: string; confidence: number }>();
    setClassificationProgress(0);
    setClassifyBatchInfo({ current: 0, total: totalBatches, photoTotal: photosToProcess.length, unidentified: 0 });

    let totalUnidentified = 0;

    for (let i = 0; i < photosToProcess.length; i += batchSize) {
      const batchIndex = Math.floor(i / batchSize) + 1;
      const batch = photosToProcess.slice(i, i + batchSize);
      const thumbs: { name: string; dataUrl: string }[] = [];

      for (const file of batch) {
        try {
          const raw = await fileToDataUrl(file);
          let compressed = compressionCache.current.get(file.name);
          if (!compressed) {
            compressed = await compressDataUrlForStorage(raw, 800, 0.7);
            compressionCache.current.set(file.name, compressed);
          }
          if (compressed.startsWith("data:image") && compressed.length >= 500) {
            thumbs.push({ name: file.name, dataUrl: compressed });
          } else {
            console.log(`[classify-bg] batch ${batchIndex}/${totalBatches} — skipped (trop petit): ${file.name} (${compressed?.length ?? 0} chars)`);
          }
        } catch { /* skip */ }
      }

      console.log(`[classify-bg] batch ${batchIndex}/${totalBatches} — ${batch.length} photos, ${thumbs.length} thumbs valides`);

      if (thumbs.length > 0) {
        try {
          const res = await fetchWithRetry(
            "/api/smart-inspect/photo-classify",
            {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ photos: thumbs, sections, language: "fr" }),
            },
            3,
          );
          const data = await res.json();
          if (data?.ok && Array.isArray(data.results)) {
            let batchClassified = 0;
            let batchNone = 0;
            let batchLowConf = 0;
            for (const result of data.results) {
              if (typeof result.photoName !== "string" || typeof result.section !== "string") continue;
              if (result.section === "none") {
                batchNone++;
                totalUnidentified++;
                // Keep in map so user can correct manually
                accumulated.set(result.photoName, {
                  section: "none",
                  subTopic: "",
                  confidence: typeof result.confidence === "number" ? result.confidence : 0,
                });
              } else if (typeof result.confidence !== "number" || result.confidence < 0.3) {
                batchLowConf++;
                totalUnidentified++;
              } else {
                batchClassified++;
                accumulated.set(result.photoName, {
                  section: result.section,
                  subTopic: typeof result.subTopic === "string" ? result.subTopic : "",
                  confidence: result.confidence,
                });
              }
            }
            console.log(`[classify-bg] batch ${batchIndex}/${totalBatches} résultats — classifiées: ${batchClassified}, none: ${batchNone}, conf<0.3: ${batchLowConf}`);
            setPhotoClassifications(new Map(accumulated));
            setClassifyBatchInfo({ current: batchIndex, total: totalBatches, photoTotal: photosToProcess.length, unidentified: totalUnidentified });
            try {
              localStorage.setItem("photoClassifications", JSON.stringify([...accumulated]));
            } catch { /* quota exceeded — non-critique */ }
          }
        } catch (e) {
          console.warn(`[classify-bg] batch ${batchIndex}/${totalBatches} FAILED:`, e);
        }
      }

      const progress = Math.min(100, Math.round(((i + batchSize) / photosToProcess.length) * 100));
      setClassificationProgress(progress);

      // 15s between batches (was 65s) — safely under 200K TPM limit (~8K tokens/batch)
      if (i + batchSize < photosToProcess.length) {
        await new Promise(resolve => setTimeout(resolve, 15_000));
      }
    }

    setClassificationProgress(100);
    setClassifyBatchInfo(null);
    const identifiedCount = [...accumulated.values()].filter(v => v.section !== "none").length;
    if (accumulated.size > 0) {
      addToast(`${identifiedCount} photo(s) classifiée(s)${totalUnidentified > 0 ? `, ${totalUnidentified} non identifiables` : ""}`, "success");
    }
  }, [addToast, inspectorInfo.province]);

  // ── generateAutoConstatForSection ────────────────────────────────────────
  const generateAutoConstatForSection = useCallback(async (sectionKey: string) => {
    // Get ALL classified photos for this section, sorted by confidence
    const sectionPhotos = buildingPhotos
      .filter(f => photoClassifications.get(f.name)?.section === sectionKey)
      .sort((a, b) =>
        (photoClassifications.get(b.name)?.confidence ?? 0) -
        (photoClassifications.get(a.name)?.confidence ?? 0),
      );

    if (sectionPhotos.length === 0) return;

    setAutoConstatsLoading(prev => new Set(prev).add(sectionKey));
    setAutoConstatsInProgress(true);
    setAutoConstatsError(null);

    try {
      // Compress photos once upfront
      const photoDataMap = new Map<string, string>();
      for (const file of sectionPhotos) {
        try {
          const raw = await fileToDataUrl(file);
          let compressed = compressionCache.current.get(file.name);
          if (!compressed) {
            compressed = await compressDataUrlForStorage(raw, 800, 0.7);
            compressionCache.current.set(file.name, compressed);
          }
          if (compressed.startsWith("data:image")) {
            photoDataMap.set(file.name, compressed);
          }
        } catch { /* skip */ }
      }

      if (photoDataMap.size === 0) return;

      // Group photos by subTopic — photos without subTopic go into "__default__"
      const groups = new Map<string, File[]>();
      for (const file of sectionPhotos) {
        if (!photoDataMap.has(file.name)) continue;
        const cls = photoClassifications.get(file.name);
        const subTopic = cls?.subTopic?.trim() || "__default__";
        if (!groups.has(subTopic)) groups.set(subTopic, []);
        groups.get(subTopic)!.push(file);
      }

      const constatParts: string[] = [];
      const constatEnParts: string[] = [];
      const allDeficiencies: Deficiency[] = [];

      // Generate one constat per subTopic group (top 3 photos each)
      for (const [subTopic, groupFiles] of groups) {
        const groupPhotos = groupFiles.slice(0, 3);
        const photosForApi = groupPhotos.map(f => ({
          name: f.name,
          base64: photoDataMap.get(f.name)!,
          section: sectionKey,
        }));

        const displaySubTopic = subTopic === "__default__" ? "" : subTopic;
        const effectiveSectionName = displaySubTopic
          ? `${sectionKey} — ${displaySubTopic}`
          : sectionKey;

        try {
          const res = await fetchWithRetry(
            "/api/smart-inspect/auto-constat",
            {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                photos: photosForApi,
                sectionName: effectiveSectionName,
                province: inspectorInfo.province || "QC",
                reportLanguage: inspectorInfo.reportLanguage || "fr",
              }),
            },
            3,
          );
          const data = await res.json();
          if (data?.ok) {
            if (data.constat) constatParts.push(data.constat as string);
            if (data.constat_en) constatEnParts.push(data.constat_en as string);
            if (Array.isArray(data.deficiencies) && data.deficiencies.length > 0) {
              allDeficiencies.push(...(data.deficiencies as Deficiency[]));
            }
          }
        } catch (e) {
          console.warn(`[auto-constat] groupe "${subTopic}" échoué:`, e);
        }
      }

      if (constatParts.length > 0) {
        setAutoConstats(prev => {
          const next = new Map(prev);
          next.set(sectionKey, constatParts.join("\n\n"));
          return next;
        });
      }
      if (constatEnParts.length > 0) {
        setAutoConstatsEn(prev => {
          const next = new Map(prev);
          next.set(sectionKey, constatEnParts.join("\n\n"));
          return next;
        });
      }
      if (allDeficiencies.length > 0) {
        setAutoDeficiencies(prev => {
          const next = new Map(prev);
          next.set(sectionKey, allDeficiencies);
          return next;
        });
      }

      if (constatParts.length > 0) {
        addToast(
          groups.size > 1
            ? `Constats générés pour ${sectionKey} (${groups.size} groupes)`
            : `Constat généré pour ${sectionKey}`,
          "success",
        );
      } else {
        setAutoConstatsError("Aucun constat généré");
        addToast(`Erreur constat ${sectionKey}: aucun constat généré`, "error");
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Erreur réseau";
      setAutoConstatsError(msg);
      addToast(msg, "error");
    } finally {
      setAutoConstatsLoading(prev => {
        const next = new Set(prev);
        next.delete(sectionKey);
        return next;
      });
      setAutoConstatsInProgress(false);
    }
  }, [buildingPhotos, photoClassifications, inspectorInfo.province, inspectorInfo.reportLanguage, addToast]);

  // ── Auto-trigger: quand une section a une photo classifiée ───────────────
  useEffect(() => {
    if (photoClassifications.size === 0) return;
    const sectionsWithPhotos = new Set<string>();
    for (const val of photoClassifications.values()) {
      sectionsWithPhotos.add(val.section);
    }
    for (const section of sectionsWithPhotos) {
      if (!triggeredSectionsRef.current.has(section)) {
        triggeredSectionsRef.current.add(section);
        generateAutoConstatForSection(section);
      }
    }
  }, [photoClassifications, generateAutoConstatForSection]);

  // ── generateAutoConstats (bouton fallback manuel) ────────────────────────
  const generateAutoConstats = useCallback(async () => {
    // Manual button — force regeneration for ALL sections with classified photos
    const sectionsToGenerate = (CONSTAT_SECTIONS as readonly string[]).filter(s =>
      [...photoClassifications.values()].some(c => c.section === s),
    );
    if (sectionsToGenerate.length === 0) {
      addToast("Aucune section à générer (pas de photos classifiées)", "info");
      return;
    }
    // Clear triggeredSectionsRef so this manual run regenerates everything
    triggeredSectionsRef.current.clear();
    addToast(`Génération des constats pour ${sectionsToGenerate.length} section(s)…`, "info");
    for (const section of sectionsToGenerate) {
      triggeredSectionsRef.current.add(section);
      await generateAutoConstatForSection(section);
    }
  }, [photoClassifications, generateAutoConstatForSection, addToast]);

  // ── stopRecording (défini avant startRecording pour éviter la TDZ) ───────
  const stopRecording = useCallback(() => {
    if (recordingTimerRef.current) {
      clearInterval(recordingTimerRef.current);
      recordingTimerRef.current = null;
    }
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== "inactive") {
      mediaRecorderRef.current.stop();
    }
  }, []);

  // ── startRecording ───────────────────────────────────────────────────────
  const startRecording = useCallback(async (sectionKey: string) => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mimeType = MediaRecorder.isTypeSupported("audio/webm") ? "audio/webm" : "audio/mp4";
      const recorder = new MediaRecorder(stream, { mimeType });
      audioChunksRef.current = [];

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) audioChunksRef.current.push(e.data);
      };

      recorder.onstop = async () => {
        stream.getTracks().forEach(t => t.stop());
        const audioBlob = new Blob(audioChunksRef.current, { type: mimeType });
        setIsRecording(null);
        setRecordingTime(0);
        setVoiceLoading(true);
        try {
          const fd = new FormData();
          fd.append("audio", audioBlob, `recording.${mimeType.includes("mp4") ? "mp4" : "webm"}`);
          fd.append("sectionName", sectionKey);
          fd.append("province", inspectorInfo.province || "QC");
          fd.append("reportLanguage", inspectorInfo.reportLanguage || "fr");
          const res = await fetch("/api/smart-inspect/voice-to-constat", {
            method: "POST",
            body: fd,
            signal: AbortSignal.timeout(90_000),
          });
          if (!res.ok) throw new Error(`API error ${res.status}`);
          const data = await res.json();
          if (data?.ok && data.constat) {
            const targetSection = (data.detectedSection ?? sectionKey) as string;
            if (targetSection !== "auto") {
              setAutoConstats(prev => {
                const next = new Map(prev);
                const existing = next.get(targetSection) ?? "";
                next.set(targetSection, existing ? `${existing}\n\n${data.constat}` : data.constat);
                return next;
              });
              addToast(`Constat dicté ajouté à ${targetSection}`, "success");
            }
          } else {
            addToast(data.error ?? "Erreur transcription", "error");
          }
        } catch (e) {
          addToast(e instanceof Error ? e.message : "Erreur enregistrement", "error");
        } finally {
          setVoiceLoading(false);
        }
      };

      mediaRecorderRef.current = recorder;
      recorder.start(1000);
      setIsRecording(sectionKey);
      setRecordingTime(0);

      // Max 60 s auto-stop
      const maxStopTimer = setTimeout(() => {
        if (recordingTimerRef.current) {
          clearInterval(recordingTimerRef.current);
          recordingTimerRef.current = null;
        }
        if (mediaRecorderRef.current && mediaRecorderRef.current.state !== "inactive") {
          mediaRecorderRef.current.stop();
        }
      }, 60_000);

      recordingTimerRef.current = setInterval(() => {
        setRecordingTime(prev => {
          if (prev >= 59) {
            clearInterval(recordingTimerRef.current!);
            clearTimeout(maxStopTimer);
            return prev;
          }
          return prev + 1;
        });
      }, 1000);
    } catch {
      addToast("Permission microphone refusée ou indisponible", "error");
      setIsRecording(null);
    }
  }, [inspectorInfo.province, inspectorInfo.reportLanguage, addToast]);

  // ── Photo handlers ────────────────────────────────────────────────────────
  const addPhotos = useCallback((newFiles: File[]) => {
    if (newFiles.length === 0) return;
    registerBuildingPhotoIds(newFiles);
    setBuildingPhotos(prev => [...prev, ...newFiles]);
    setTimeout(() => classifyPhotosInBackground(newFiles), 200);
    // Extract EXIF in background — non-blocking
    extractExifBatch(newFiles).then(batchMeta => {
      setPhotoMetadata(prev => {
        const next = new Map(prev);
        for (const [name, data] of batchMeta) next.set(name, data);
        return next;
      });
    }).catch(() => { /* graceful — no EXIF */ });
    addToast(`${newFiles.length} photo(s) ajoutée(s)`, "success");
  }, [classifyPhotosInBackground, addToast, registerBuildingPhotoIds]);

  const handleBuildingPhotosChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files || e.target.files.length === 0) return;
    if (isAddingPhotosRef.current) return; // guard against double-fire
    isAddingPhotosRef.current = true;
    const files = Array.from(e.target.files);
    e.target.value = ''; // reset so same files can be re-selected and prevent re-fire on remount
    addPhotos(files);
    // release guard after current microtask queue clears
    setTimeout(() => { isAddingPhotosRef.current = false; }, 0);
  };

  const handleDirectoryChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (isAddingPhotosRef.current) return;
    isAddingPhotosRef.current = true;
    if (e.target.files && e.target.files.length > 0) {
      // Copy to array immediately before browser GC can collect the FileList
      const imageFiles = Array.from(e.target.files).filter(f => f.type.startsWith("image/"));
      e.target.value = "";
      addPhotos(imageFiles);
    }
    setTimeout(() => { isAddingPhotosRef.current = false; }, 0);
  };

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(false);
    const files = Array.from(e.dataTransfer.files).filter(f => f.type.startsWith("image/"));
    if (files.length > 0) addPhotos(files);
  };

  const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(false);
  };

  const handleInspectorNotesChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) setInspectorNotes(prev => [...prev, ...Array.from(e.target.files!)]);
  };

  const handleVoiceNotesChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) setVoiceNotes(prev => [...prev, ...Array.from(e.target.files!)]);
  };

  // ── Compliance checklist ─────────────────────────────────────────────────
  const complianceChecklist = useMemo(() => {
    const province = (inspectorInfo.province || "QC") as ProvinceCode;
    const sections = REQUIRED_SECTIONS[province] ?? REQUIRED_SECTIONS.CA;
    return sections.map(sec => {
      let covered = false;
      if (!sec.mandatory) {
        covered = true;
      } else if (!sec.isPhysicalSystem) {
        if (sec.id === "cover_page") {
          covered = !!(formData.requerants && formData.propriete_adresse && inspectorInfo.name);
        } else if (sec.id === "summary") {
          covered = !!(formData.description_sommaire || formData.condition_generale);
        } else {
          covered = true;
        }
      } else {
        const formNames = SECTION_ID_TO_FORM_NAMES[sec.id as SectionId] ?? [];
        const hasClassifiedPhotos = formNames.some(name => {
          for (const cls of photoClassifications.values()) {
            if (cls.section === name) return true;
          }
          return false;
        });
        const hasAutoConstat = formNames.some(name => (autoConstats.get(name) ?? "").length > 0);
        covered = hasClassifiedPhotos || hasAutoConstat || buildingPhotos.length > 0;
      }
      return { ...sec, covered };
    });
  }, [
    inspectorInfo.province,
    inspectorInfo.name,
    formData.requerants,
    formData.propriete_adresse,
    formData.description_sommaire,
    formData.condition_generale,
    buildingPhotos.length,
    photoClassifications,
    autoConstats,
  ]);

  const complianceMissing = complianceChecklist.filter(s => s.mandatory && !s.covered);
  const isCompliant = complianceMissing.length === 0;

  // ── Province-dynamic inspection sections ─────────────────────────────────
  // Derives physical-system section labels from REQUIRED_SECTIONS for the selected province.
  // Used when sending section names to photo-classify and auto-constat APIs.
  const inspectionSections = useMemo(() => {
    const prov = (inspectorInfo.province || "QC") as ProvinceCode;
    return (REQUIRED_SECTIONS[prov] ?? REQUIRED_SECTIONS.CA)
      .filter(s => s.isPhysicalSystem)
      .map(s => s.labelFr);
  }, [inspectorInfo.province]);

  // ── Completed sections badge ─────────────────────────────────────────────
  const completedSectionsCount = useMemo(() => {
    let count = 0;
    if (inspectorInfo.name && inspectorInfo.company) count++;
    if (formData.requerants && formData.propriete_adresse) count++;
    if (formData.date_heure) count++;
    if (buildingPhotos.length > 0) count++;
    if (autoConstats.size > 0) count++;
    return count;
  }, [
    inspectorInfo.name,
    inspectorInfo.company,
    formData.requerants,
    formData.propriete_adresse,
    formData.date_heure,
    buildingPhotos.length,
    autoConstats.size,
  ]);

  // ── extractFromDV ────────────────────────────────────────────────────────
  const extractFromDV = async () => {
    if (!dvPhoto) {
      addToast("Veuillez d'abord sélectionner un fichier DV", "error");
      return;
    }
    setIsProcessing(true);
    try {
      await new Promise(resolve => setTimeout(resolve, 2000));
      setFormData(prev => ({
        ...prev,
        requerants: "Jean Dupont et Marie Tremblay",
        client_nom: "Jean Dupont",
        client_telephone: "514-123-4567",
        client_courriel: "jean.dupont@email.com",
        propriete_adresse: "123 Rue Principale, Montréal, QC H3A 1A1",
        type_propriete: "residential",
        annee_construction: "1985",
      }));
      addToast("Informations extraites du DV avec succès", "success");
    } catch {
      addToast("Erreur lors de l'extraction du fichier", "error");
    } finally {
      setIsProcessing(false);
    }
  };

  // ── generateDescription (rapport complet — full report generation) ────────
  const generateDescription = async () => {
    if (buildingPhotos.length === 0) return;
    setIsProcessing(true);
    try {
      registerBuildingPhotoIds(buildingPhotos);

      let extractedNotes = "Notes générales de l'inspecteur:\n";
      if (inspectorNotes.length > 0) extractedNotes += "- Notes manuscrites analysées et intégrées\n";
      if (voiceNotes.length > 0) extractedNotes += "- Notes vocales transcrites et intégrées\n";

      type ConstatSeed = Omit<SmartInspectionConstat, "id" | "photos">;
      const mk = (seed: ConstatSeed): SmartInspectionConstat => ({
        ...seed,
        id: createObservationId(),
        photos: [],
      });

      const sections: SmartInspectionSection[] = [
        {
          name: "Toiture", icon: "🏠",
          constats: [
            mk({ title: "État général de la couverture", maxPhotos: 3, observation: "Bardeaux d'asphalte en fin de vie utile. Granulés manquants sur 30% de la surface. Déformation visible sur les pentes sud et ouest. Signes de vieillissement accéléré dû à l'exposition solaire.", recommendation: "Remplacement complet de la toiture recommandé dans les 12-24 mois. Inspection préalable des structures de support par un ingénieur. Prévoir budget de $15,000-25,000.", gravite: "Majeur", urgence: "À court terme" }),
            mk({ title: "Cheminée et solins", maxPhotos: 2, observation: "Solin de cheminée détérioré avec fissures. Briques de cheminée effritées. Mortier dégradé. Signes d'infiltration d'eau potentiels autour de la base.", recommendation: "Réparation complète des solins avec membrane d'étanchéité. Reconstruction partielle de la cheminée. Inspection par un maçon certifié.", gravite: "Modéré", urgence: "À court terme" }),
            mk({ title: "Gouttières et évacuation", maxPhotos: 1, observation: "Gouttières partiellement obstruées. Points de stagnation d'eau visibles. Fixations légèrement desserrées. Absence de protection contre les feuilles.", recommendation: "Nettoyage complet des gouttières. Installation de protecteurs contre les feuilles. Vérification et resserrage des fixations.", gravite: "Mineur", urgence: "Non urgent" }),
          ],
        },
        {
          name: "Fondation", icon: "🏗",
          constats: [
            mk({ title: "Fissures et déformations", maxPhotos: 3, observation: "Fissures horizontales de 2-3mm sur mur sud. Fissures verticales aux coins. Signes de pression latérale. Légères infiltrations d'humidité visibles à l'intérieur.", recommendation: "Inspection immédiate par ingénieur en structure. Monitoring des fissures pendant 6 mois. Système de drainage extérieur probablement nécessaire. Budget $8,000-15,000.", gravite: "Majeur", urgence: "Urgent" }),
            mk({ title: "Humidité et infiltration", maxPhotos: 2, observation: "Traces d'humidité sur 15% des murs de fondation. Efflorescences blanches visibles. Odeur de moisi légère dans le sous-sol. Condensation excessive.", recommendation: "Installation de système de drainage français. Application de membranes d'étanchéité extérieures. Amélioration de la ventilation du sous-sol.", gravite: "Modéré", urgence: "À court terme" }),
            mk({ title: "Éléments structurels", maxPhotos: 1, observation: "Poteaux de support légèrement affaissés. Poutres principales en bon état mais nécessitant inspection. Ancrages adéquats mais vieillissants.", recommendation: "Inspection détaillée des éléments structurels par ingénieur. Renforcement des poteaux si nécessaire.", gravite: "Modéré", urgence: "À court terme" }),
          ],
        },
        {
          name: "Extérieur", icon: "🏡",
          constats: [
            mk({ title: "Revêtement mural", maxPhotos: 3, observation: "Brique dégradée avec mortier effrité sur 20% de la surface. Fissures dans le revêtement. Infiltration d'eau visible derrière certaines briques. Peinture écaillée.", recommendation: "Rejointoiement complet des murs en brique. Remplacement des briques endommagées. Application de scellant hydrofuge.", gravite: "Modéré", urgence: "À court terme" }),
            mk({ title: "Portes et fenêtres", maxPhotos: 2, observation: "Fenêtres en bois avec peinture écaillée. Joints d'étanchéité détériorés. Condensation entre vitrages. Portes d'entrée mal ajustées.", recommendation: "Remplacement des fenêtres par modèles PVC double vitrage. Rejointoiement des portes.", gravite: "Modéré", urgence: "À court terme" }),
            mk({ title: "Aménagement extérieur", maxPhotos: 1, observation: "Pente négative vers la fondation. Puits d'évacuation obstrué. Arbres trop près des fondations. Terrasse en bois dégradée.", recommendation: "Correction de la pente du terrain. Nettoyage des systèmes d'évacuation. Élagage des arbres.", gravite: "Mineur", urgence: "Non urgent" }),
          ],
        },
        {
          name: "Intérieur", icon: "🏠",
          constats: [
            mk({ title: "Planchers et revêtements", maxPhotos: 3, observation: "Planchers légèrement inégaux dans le sous-sol. Carrelage fissuré à quelques endroits. Tapis usé et taché. Bois franc nécessitant réfection.", recommendation: "Nivelage des planchers du sous-sol. Remplacement des sections de carrelage fissurées.", gravite: "Modéré", urgence: "À court terme" }),
            mk({ title: "Murs et plafonds", maxPhotos: 2, observation: "Fissures dans les murs porteurs. Taches d'humidité au plafond. Papier peint décollé. Plâtre effrité à certains endroits.", recommendation: "Réparation des fissures structurelles. Traitement des taches d'humidité.", gravite: "Modéré", urgence: "À court terme" }),
            mk({ title: "Moisissure et qualité de l'air", maxPhotos: 1, observation: "Traces de moisissure dans le sous-sol. Odeur d'humidité persistante. Manque de ventilation générale.", recommendation: "Test de qualité de l'air immédiat. Traitement professionnel des moisissures.", gravite: "Majeur", urgence: "Urgent" }),
          ],
        },
        {
          name: "Plomberie", icon: "🔧",
          constats: [
            mk({ title: "Tuyaux et distribution", maxPhotos: 3, observation: "Tuyaux en cuivre oxydés. Fuites mineures aux raccords. Pression d'eau irrégulière. Absence de vannes d'arrêt individuelles.", recommendation: "Remplacement progressif des tuyaux oxydés. Installation de vannes d'arrêt.", gravite: "Modéré", urgence: "À court terme" }),
            mk({ title: "Chauffe-eau", maxPhotos: 1, observation: "Chauffe-eau de 10 ans avec traces de rouille. Manque de bac de rétention.", recommendation: "Remplacement du chauffe-eau dans les 2 ans. Installation bac de rétention.", gravite: "Modéré", urgence: "À court terme" }),
            mk({ title: "Évacuation et drainage", maxPhotos: 1, observation: "Évacuations lentes dans les éviers. Absence de clapets anti-refoulement.", recommendation: "Nettoyage complet des conduits d'évacuation. Installation de clapets anti-refoulement.", gravite: "Mineur", urgence: "Non urgent" }),
          ],
        },
        {
          name: "Électricité", icon: "⚡",
          constats: [
            mk({ title: "Panneau électrique", maxPhotos: 3, observation: "Panneau de 100A surchargé pour les besoins actuels. Disjoncteurs anciens type screw-in. Absence de protection GFCI dans les zones humides.", recommendation: "Mise à niveau obligatoire à 200A. Remplacement du panneau complet. Installation GFCI.", gravite: "Majeur", urgence: "Urgent" }),
            mk({ title: "Câblage et prises", maxPhotos: 2, observation: "Câblage aluminium dans certaines sections. Prises non mises à la terre. Surcharge de circuits visibles.", recommendation: "Remplacement des circuits aluminium. Mise à la terre de toutes les prises.", gravite: "Majeur", urgence: "Urgent" }),
            mk({ title: "Éclairage et interrupteurs", maxPhotos: 1, observation: "Interrupteurs anciens et usés. Fixations d'éclairage non sécurisées.", recommendation: "Remplacement des interrupteurs et prises. Fixation sécurisée des luminaires.", gravite: "Mineur", urgence: "Non urgent" }),
          ],
        },
        {
          name: "Chauffage et Ventilation", icon: "🔥",
          constats: [
            mk({ title: "Système de chauffage", maxPhotos: 3, observation: "Thermostats anciens et imprécis. Électroménagers de chauffage surchargés.", recommendation: "Installation thermostats programmables. Répartition des charges électriques.", gravite: "Modéré", urgence: "À court terme" }),
            mk({ title: "Ventilation et VRC", maxPhotos: 2, observation: "Absence de système de ventilation mécanique contrôlée. Extracteurs de cuisine et salle de bain inefficaces.", recommendation: "Installation VRC obligatoire selon Code du Bâtiment. Remplacement extracteurs.", gravite: "Modéré", urgence: "À court terme" }),
          ],
        },
        {
          name: "Isolation", icon: "🛡",
          constats: [
            mk({ title: "Isolation des murs", maxPhotos: 2, observation: "Isolation insuffisante dans les murs extérieurs. Ponts thermiques visibles. Condensation dans les cavités murales.", recommendation: "Ajout d'isolation par l'extérieur ou intérieur. Correction des ponts thermiques.", gravite: "Modéré", urgence: "À court terme" }),
            mk({ title: "Isolation des combles", maxPhotos: 1, observation: "Isolation des combles insuffisante et tassée. Absence de pare-vapeur.", recommendation: "Ajout isolation jusqu'à R-60 minimum. Installation pare-vapeur adéquat.", gravite: "Modéré", urgence: "À court terme" }),
          ],
        },
      ];

      const sectionNames = sections.map(s => s.name);

      // Réinitialiser les liens avant photo-pick
      for (const entry of smartPhotoRegistryRef.current.values()) {
        entry.observation_id = null;
      }

      const filesBySection = new Map<string, File[]>();
      for (const file of buildingPhotos) {
        const cls = photoClassifications.get(file.name);
        if (cls && cls.section !== "none" && sectionNames.includes(cls.section)) {
          if (!filesBySection.has(cls.section)) filesBySection.set(cls.section, []);
          filesBySection.get(cls.section)!.push(file);
        }
      }

      const convertPhotoToBase64 = (photo: File): Promise<string> =>
        new Promise((resolve, reject) => {
          const reader = new FileReader();
          reader.onloadend = () => resolve(reader.result as string);
          reader.onerror = reject;
          reader.readAsDataURL(photo);
        });

      for (const section of sections) {
        const sectionFiles = filesBySection.get(section.name) ?? [];
        if (sectionFiles.length === 0) {
          section.photos_pool = [];
          for (const constat of section.constats) constat.photos = [];
          continue;
        }

        const pickBatch: { photo_id: string; file: File; dataUrl: string }[] = [];
        for (const file of sectionFiles) {
          const photoId = photoIdByFileNameRef.current.get(file.name);
          if (!photoId) continue;
          try {
            const raw = await fileToDataUrl(file);
            let compressed = compressionCache.current.get(file.name);
            if (!compressed) {
              compressed = await compressDataUrlForStorage(raw, 800, 0.7);
              compressionCache.current.set(file.name, compressed);
            }
            if (compressed.startsWith("data:image") && compressed.length >= 500) {
              pickBatch.push({ photo_id: photoId, file, dataUrl: compressed });
            }
          } catch { /* skip */ }
        }

        if (pickBatch.length > 0 && section.constats.length > 0) {
          try {
            const pickRes = await fetchWithRetry(
              "/api/smart-inspect/photo-pick",
              {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  sectionName: section.name,
                  language: "fr",
                  constats: section.constats.map(c => ({
                    id: c.id,
                    title: c.title,
                    maxPhotos: c.maxPhotos ?? 3,
                    context: (c.observation ?? "").slice(0, 220),
                  })),
                  photos: pickBatch.map(p => ({ name: p.photo_id, dataUrl: p.dataUrl })),
                }),
              },
              3,
            );
            const pickData = await pickRes.json();
            if (pickData?.ok && pickData.assignments && typeof pickData.assignments === "object") {
              applyPhotoPickAssignments(
                pickBatch,
                pickData.assignments as Record<string, number[]>,
                new Set(section.constats.map(c => c.id)),
                smartPhotoRegistryRef.current,
              );
            }
          } catch (e) {
            console.warn(`[photo-pick] section "${section.name}" échouée:`, e);
          }
        }

        const sectionPool: SmartInspectionPhoto[] = [];
        for (const item of pickBatch) {
          const reg = smartPhotoRegistryRef.current.get(item.photo_id);
          const observation_id = reg?.observation_id ?? null;
          try {
            const dataUrl = await convertPhotoToBase64(item.file);
            sectionPool.push({
              photo_id: item.photo_id,
              observation_id,
              name: item.file.name,
              size: item.file.size,
              type: item.file.type || "image/jpeg",
              lastModified: item.file.lastModified,
              sectionName: section.name,
              url: dataUrl,
              base64: dataUrl,
              originalFileName: item.file.name,
            });
          } catch {
            sectionPool.push({
              photo_id: item.photo_id,
              observation_id,
              name: item.file.name,
              size: item.file.size,
              type: item.file.type || "image/jpeg",
              lastModified: item.file.lastModified,
              sectionName: section.name,
              url: null,
              base64: null,
              originalFileName: item.file.name,
            });
          }
        }

        section.photos_pool = sectionPool;
        for (const constat of section.constats) {
          constat.photos = sectionPool.filter(p => p.observation_id === constat.id);
          if (inspectorNotes.length > 0 || voiceNotes.length > 0) {
            constat.inspector_notes = extractedNotes;
          }
        }
      }

      persistSmartPhotoRegistry();

      const allConstats = sections.flatMap(s => s.constats);
      const totalConstats = allConstats.length;
      const constatsMajeurs = allConstats.filter(c => c.gravite === "Majeur").length;
      const constatsModeres = allConstats.filter(c => c.gravite === "Modéré").length;
      const constatsMineurs = allConstats.filter(c => c.gravite === "Mineur").length;
      const constatsUrgents = allConstats.filter(c => c.urgence === "Urgent").length;

      setFormData(prev => ({
        ...prev,
        description_sommaire: `Inspection exhaustive de propriété résidentielle avec ${buildingPhotos.length} photos analysées. ${sections.length} sections complètes inspectées révélant ${totalConstats} constats détaillés nécessitant attention.`,
        condition_generale: `Bâtiment nécessitant interventions majeures et immédiates. ${constatsMajeurs} constats majeurs critiques, ${constatsModeres} constats modérés et ${constatsMineurs} constats mineurs identifiés. ${constatsUrgents} interventions urgentes requises immédiatement.`,
        orientation_facade: "sud",
      }));

      (window as unknown as Record<string, unknown>).inspectionSections = sections;

      const sectionsForStorage = stripSmartSectionsForStorage(sections);

      try {
        localStorage.setItem("inspectionSections", JSON.stringify(sectionsForStorage));
        console.log("✅ Sections sauvegardées dans localStorage:", sections.length);
      } catch {
        try {
          sessionStorage.setItem("inspectionSections", JSON.stringify(sectionsForStorage));
        } catch {
          console.error("❌ Impossible de sauvegarder les sections");
        }
      }

      console.log("=== ANALYSE IA EXHAUSTIVE COMPLÈTE ===");
      console.log("Total constats:", totalConstats, "— Urgents:", constatsUrgents);
      addToast(`Analyse terminée : ${totalConstats} constats générés`, "success");
    } catch (error) {
      console.error("Erreur description IA:", error);
      addToast("Erreur lors de l'analyse des photos", "error");
    } finally {
      setIsProcessing(false);
    }
  };

  // ── submitInspection (logique découplée du form event) ────────────────────
  const submitInspection = useCallback(async () => {
    setIsProcessing(true);

    const saveToHybridStorage = (key: string, data: unknown): boolean => {
      try {
        localStorage.setItem(key, JSON.stringify(data));
        return true;
      } catch {
        try {
          sessionStorage.setItem(key, JSON.stringify(data));
          return true;
        } catch {
          (window as unknown as Record<string, unknown>).tempInspectionData = data;
          return false;
        }
      }
    };

    try {
      await new Promise(resolve => setTimeout(resolve, 1500));

      let savedSections: unknown[] = [];
      const windowAny = window as unknown as Record<string, unknown>;
      if (Array.isArray(windowAny.inspectionSections) && (windowAny.inspectionSections as unknown[]).length > 0) {
        savedSections = windowAny.inspectionSections as unknown[];
      } else {
        try {
          const sectionsData = localStorage.getItem("inspectionSections");
          if (sectionsData) savedSections = JSON.parse(sectionsData) as unknown[];
        } catch { /* ignore */ }
      }

      if (savedSections.length === 0) {
        addToast(
          "Veuillez d'abord analyser les photos avec le bouton \"Analyser les photos\" puis soumettre à nouveau.",
          "error",
        );
        setIsProcessing(false);
        return;
      }

      const conditions_meteo_final = conditionsMeteoRef.current.trim()
        ? conditionsMeteoRef.current.trim()
        : "Ensoleillé, 18°C, vent léger du sud-ouest";

      const province = (inspectorInfo.province || "QC") as ProvinceCode;
      const inspectionData = {
        id: `INS-${Date.now()}`,
        ...formData,
        conditions_meteo: conditions_meteo_final,
        dv_photo: dvPhoto?.name || "",
        building_photos: buildingPhotos.map(p => p.name),
        created_at: new Date().toISOString(),
        sections: savedSections,
        inspector_notes_files: inspectorNotes.map(n => n.name),
        voice_notes_files: voiceNotes.map(n => n.name),
        compliance_province: province,
        legal_clauses: LEGAL_CLAUSES[province] ?? LEGAL_CLAUSES.CA,
        disclaimer: DISCLAIMER_TEMPLATES[province] ?? DISCLAIMER_TEMPLATES.CA,
        auto_constats: Object.fromEntries(autoConstats),
        deficiencies: Object.fromEntries(autoDeficiencies),
        recommendations: [...autoDeficiencies.values()]
          .flat()
          .map(d => d.recommendation)
          .filter(Boolean),
        photo_metadata: Object.fromEntries(photoMetadata),
      };

      // Purge stale inspection keys
      try {
        const staleKeys: string[] = [];
        for (let i = 0; i < localStorage.length; i++) {
          const k = localStorage.key(i);
          if (k && k.startsWith("inspection_") && k !== `inspection_${inspectionData.id}`) {
            staleKeys.push(k);
          }
        }
        staleKeys.forEach(k => localStorage.removeItem(k));
      } catch { /* non-critique */ }

      const inspectionDataForStorage = {
        ...inspectionData,
        sections: stripSmartSectionsForStorage(
          inspectionData.sections as SmartInspectionSection[],
        ),
      };

      saveToHybridStorage(`inspection_${inspectionData.id}`, inspectionDataForStorage);
      setSubmittedInspectionId(inspectionData.id);
      addToast("Inspection créée avec succès ! Vous pouvez télécharger le rapport PDF.", "success");

      setTimeout(() => {
        router.push(`/rapport/preview/${inspectionData.id}`);
      }, 2000);
    } catch (error) {
      console.error("Erreur création inspection:", error);
      addToast("Erreur lors de la création de l'inspection", "error");
    } finally {
      setIsProcessing(false);
    }
  }, [
    formData,
    dvPhoto,
    buildingPhotos,
    inspectorNotes,
    voiceNotes,
    inspectorInfo.province,
    autoConstats,
    autoDeficiencies,
    photoMetadata,
    addToast,
    router,
  ]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    await submitInspection();
  };

  // ── downloadPdf ───────────────────────────────────────────────────────────
  const downloadPdf = useCallback(async () => {
    setIsPdfGenerating(true);
    addToast("Génération du PDF en cours…", "info");
    try {
      // Build payload with base64 photos from window.inspectionSections
      const windowAny = window as unknown as Record<string, unknown>;
      const richSections = Array.isArray(windowAny.inspectionSections)
        ? windowAny.inspectionSections
        : [];

      const province = (inspectorInfo.province || "QC") as import("@/lib/compliance/inspection-norms").ProvinceCode;
      const conditions_meteo_final = conditionsMeteoRef.current.trim()
        ? conditionsMeteoRef.current.trim()
        : formData.conditions_meteo || "—";

      const pdfPayload = {
        id: submittedInspectionId ?? `INS-${Date.now()}`,
        ...formData,
        conditions_meteo: conditions_meteo_final,
        compliance_province: province,
        legal_clauses: LEGAL_CLAUSES[province] ?? LEGAL_CLAUSES.CA,
        disclaimer: DISCLAIMER_TEMPLATES[province] ?? DISCLAIMER_TEMPLATES.CA,
        auto_constats: Object.fromEntries(autoConstats),
        auto_constats_en: Object.fromEntries(autoConstatsEn),
        deficiencies: Object.fromEntries(autoDeficiencies),
        recommendations: [...autoDeficiencies.values()]
          .flat()
          .map(d => d.recommendation)
          .filter(Boolean),
        sections: richSections,
        // Inspector info
        inspectorName: inspectorInfo.name,
        inspectorCompany: inspectorInfo.company,
        inspectorAddress: inspectorInfo.address,
        inspectorPhone: inspectorInfo.phone,
        inspectorEmail: inspectorInfo.email,
        inspectorAibqNumber: inspectorInfo.aibqNumber,
        inspectorLogoUrl: inspectorInfo.logoUrl,
        inspectorProvince: inspectorInfo.province,
        reportLanguage: inspectorInfo.reportLanguage || "fr",
      };

      const res = await fetch("/api/report-pdf", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(pdfPayload),
        signal: AbortSignal.timeout(60_000),
      });

      if (!res.ok) {
        const err = (await res.json().catch(() => ({
          error: `Erreur HTTP ${res.status}`,
        }))) as {
          error?: string;
          compliance_validation_v1?: ComplianceValidationV1;
        };
        if (err.compliance_validation_v1 && pdfPayload.id) {
          persistSmartInspectionComplianceValidation(
            pdfPayload.id,
            err.compliance_validation_v1,
          );
        }
        throw new Error(err.error ?? `Erreur HTTP ${res.status}`);
      }

      const validationHeader = res.headers.get(COMPLIANCE_VALIDATION_RESPONSE_HEADER);
      let complianceValidation: ComplianceValidationV1 | null = null;
      if (validationHeader && pdfPayload.id) {
        try {
          complianceValidation = JSON.parse(validationHeader) as ComplianceValidationV1;
          persistSmartInspectionComplianceValidation(pdfPayload.id, complianceValidation);
        } catch {
          /* ignore */
        }
      }

      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      const id = pdfPayload.id;
      const safeAddr = (formData.propriete_adresse ?? "rapport")
        .replace(/[^a-zA-Z0-9\-_]/g, "_")
        .slice(0, 40);
      a.download = `inspection-${id}-${safeAddr}.pdf`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      if (complianceValidation?.gate === "warning") {
        const warnMsg = complianceValidation.warnings
          .map((w) => w.messageFr)
          .filter(Boolean)
          .join(" ");
        addToast(
          warnMsg
            ? `PDF généré — avertissement conformité : ${warnMsg}`
            : "PDF généré — avertissement conformité (voir détail dans le dossier).",
          "info",
        );
      } else {
        addToast("Rapport PDF téléchargé avec succès !", "success");
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Erreur génération PDF";
      addToast(`Erreur PDF : ${msg}`, "error");
    } finally {
      setIsPdfGenerating(false);
    }
  }, [
    submittedInspectionId,
    formData,
    inspectorInfo,
    autoConstats,
    autoConstatsEn,
    autoDeficiencies,
    addToast,
  ]);

  // ── Scroll to section ────────────────────────────────────────────────────
  const scrollToSection = (id: string) => {
    document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  const STEPS = [
    { label: "Photos",         id: "section-photos" },
    { label: "Classification", id: "section-classification" },
    { label: "Constats",       id: "section-constats" },
    { label: "Révision",       id: "section-revision" },
    { label: "Soumettre",      id: "section-submit" },
  ];

  // ─── JSX ─────────────────────────────────────────────────────────────────
  return (
    <div className="max-w-4xl mx-auto pb-32">

      {/* Toast notifications */}
      <div className="fixed top-4 right-4 z-50 space-y-2 pointer-events-none">
        {toasts.map(toast => (
          <div
            key={toast.id}
            className={`px-4 py-3 rounded-lg shadow-lg text-sm font-medium max-w-sm pointer-events-auto transition-all ${
              toast.type === "success" ? "bg-green-600 text-white" :
              toast.type === "error"   ? "bg-red-600 text-white" :
              "bg-blue-600 text-white"
            }`}
          >
            {toast.message}
          </div>
        ))}
      </div>

      {/* Offline / Sync banner */}
      <OfflineBanner
        isOnline={isOnline}
        wasOffline={wasOffline}
        syncStatus={syncStatus}
        pendingSyncCount={pendingSyncCount}
      />

      {/* Sticky stepper */}
      <div className="sticky top-0 z-40 bg-white border-b border-gray-200 shadow-sm">
        <div className="max-w-4xl mx-auto px-4 py-3 flex items-center gap-1 overflow-x-auto">
          {STEPS.map((step, idx) => (
            <div key={step.id} className="flex items-center gap-1 flex-shrink-0">
              <button
                type="button"
                onClick={() => scrollToSection(step.id)}
                className="px-3 py-1.5 text-sm font-medium rounded-lg text-blue-700 hover:bg-blue-50 transition-colors whitespace-nowrap"
              >
                {step.label}
              </button>
              {idx < STEPS.length - 1 && (
                <ChevronRight className="w-4 h-4 text-gray-400 flex-shrink-0" />
              )}
            </div>
          ))}
          {/* Sync status indicator */}
          <div className="ml-auto flex-shrink-0 flex items-center gap-1 text-xs font-medium">
            {!isOnline && (
              <span className="flex items-center gap-1 text-amber-600 bg-amber-50 px-2 py-1 rounded-full border border-amber-200">
                <span>⚡</span>
                <span>Hors-ligne</span>
                {pendingSyncCount > 0 && <span className="font-bold">({pendingSyncCount})</span>}
              </span>
            )}
            {isOnline && syncStatus === "syncing" && (
              <span className="flex items-center gap-1 text-blue-600 bg-blue-50 px-2 py-1 rounded-full border border-blue-200">
                <span className="animate-spin inline-block">↻</span>
                <span>Sync…</span>
              </span>
            )}
            {isOnline && syncStatus === "synced" && (
              <span className="flex items-center gap-1 text-green-600 bg-green-50 px-2 py-1 rounded-full border border-green-200">
                <span>✓</span>
                <span>Synchronisé</span>
              </span>
            )}
          </div>
        </div>
      </div>

      <div className="bg-white rounded-xl shadow-lg p-6 mt-4">
        <div className="mb-6">
          <h1 className="text-3xl font-bold text-gray-900 mb-1">Inspection Intelligente</h1>
          <p className="text-gray-600 flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-blue-500" />
            Formulaire avec IA et reconnaissance automatique
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-8">

          {/* ── Accordéon inspecteur ───────────────────────────────────── */}
          <div className="border rounded-xl overflow-hidden">
            <button
              type="button"
              onClick={() => setInspectorAccordionOpen(o => !o)}
              className="w-full flex items-center justify-between p-5 bg-purple-50 hover:bg-purple-100 transition-colors"
            >
              <div className="flex items-center gap-2">
                <User className="w-5 h-5 text-purple-600" />
                <span className="text-lg font-semibold">Informations de l'inspecteur</span>
                {inspectorInfo.name && inspectorInfo.company && (
                  <span className="text-sm text-green-700 bg-green-100 px-2 py-0.5 rounded-full">
                    {inspectorInfo.name} — {inspectorInfo.company}
                  </span>
                )}
              </div>
              {inspectorAccordionOpen
                ? <ChevronUp className="w-5 h-5 text-purple-600" />
                : <ChevronDown className="w-5 h-5 text-purple-600" />
              }
            </button>

            {inspectorAccordionOpen && (
              <div className="p-5 bg-purple-50 border-t border-purple-100">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Nom de l'inspecteur *</label>
                    <input type="text" value={inspectorInfo.name} onChange={e => updateInspectorInfo("name", e.target.value)} className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500" placeholder="Nom complet de l'inspecteur" required />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Compagnie *</label>
                    <input type="text" value={inspectorInfo.company} onChange={e => updateInspectorInfo("company", e.target.value)} className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500" placeholder="Nom de la compagnie" required />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Adresse *</label>
                    <input type="text" value={inspectorInfo.address} onChange={e => updateInspectorInfo("address", e.target.value)} className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500" placeholder="Adresse complète" required />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Téléphone *</label>
                    <input type="tel" value={inspectorInfo.phone} onChange={e => updateInspectorInfo("phone", e.target.value)} className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500" placeholder="(514) 123-4567" required />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Courriel *</label>
                    <input type="email" value={inspectorInfo.email} onChange={e => updateInspectorInfo("email", e.target.value)} className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500" placeholder="inspecteur@exemple.com" required />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Numéro AIBQ *</label>
                    <input type="text" value={inspectorInfo.aibqNumber} onChange={e => updateInspectorInfo("aibqNumber", e.target.value)} className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500" placeholder="AIBQ-XXXXX" required />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Province *</label>
                    <select value={inspectorInfo.province || "QC"} onChange={e => {
                        const newProvince = e.target.value;
                        const defaultLang: "fr" | "en" | "bilingual" = newProvince === "QC" ? "fr" : newProvince === "NB" ? "bilingual" : "en";
                        const updated = { ...inspectorInfo, province: newProvince, reportLanguage: defaultLang } as typeof inspectorInfo;
                        setInspectorInfo(updated);
                        localStorage.setItem("inspectorInfo", JSON.stringify(updated));
                      }} className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 bg-white">
                      {Object.values(PROVINCES).map(p => (
                        <option key={p.code} value={p.code}>{p.nameFr}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Langue du rapport</label>
                    <select
                      value={inspectorInfo.reportLanguage || "fr"}
                      onChange={e => updateInspectorInfo("reportLanguage", e.target.value as "fr" | "en" | "bilingual")}
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 bg-white"
                    >
                      <option value="fr">Français</option>
                      <option value="en">Anglais / English</option>
                      <option value="bilingual">Bilingue / Bilingual (FR + EN)</option>
                    </select>
                    {inspectorInfo.reportLanguage === "bilingual" && (
                      <p className="text-xs text-blue-600 mt-1">Chaque section contiendra le texte en français suivi de la traduction anglaise.</p>
                    )}
                  </div>
                  <div className="md:col-span-2">
                    <label className="block text-sm font-medium text-gray-700 mb-1">Logo de la compagnie (optionnel)</label>
                    <div className="flex items-center gap-3">
                      <input
                        type="file"
                        accept="image/png,image/jpeg,image/jpg,image/svg+xml,image/webp"
                        className="hidden"
                        id="logo-upload"
                        onChange={e => {
                          const file = e.target.files?.[0];
                          if (!file) return;
                          if (file.size > 500 * 1024) { addToast("Le logo dépasse 500 Ko", "error"); e.target.value = ""; return; }
                          const reader = new FileReader();
                          reader.onloadend = () => updateInspectorInfo("logoUrl", reader.result as string);
                          reader.readAsDataURL(file);
                        }}
                      />
                      <label htmlFor="logo-upload" className="inline-flex items-center px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 cursor-pointer text-sm">
                        <Upload className="w-4 h-4 mr-2" />
                        {inspectorInfo.logoUrl ? "Changer le logo" : "Téléverser un logo"}
                      </label>
                      {inspectorInfo.logoUrl && (
                        <button type="button" onClick={() => updateInspectorInfo("logoUrl", "")} className="text-sm text-red-600 hover:text-red-800 underline">Supprimer</button>
                      )}
                    </div>
                    {inspectorInfo.logoUrl && (
                      <div className="mt-2 flex items-center gap-4">
                        <img src={inspectorInfo.logoUrl} alt="Logo de l'inspecteur" className="h-12 w-auto object-contain border border-gray-200 rounded p-1" />
                        <span className="text-sm text-gray-500">Aperçu du logo</span>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* ── Information de base ────────────────────────────────────── */}
          <div className="border rounded-xl p-6">
            <div className="flex items-center gap-2 mb-4">
              <User className="w-5 h-5 text-blue-600" />
              <h2 className="text-xl font-semibold">Information de base</h2>
            </div>

            {/* DV Upload — uses FileUploadDebug */}
            <div className="mb-5">
              <label className="block text-sm font-medium text-gray-700 mb-2">
                <MapPin className="inline w-4 h-4 mr-1" />
                Déclaration du vendeur (optionnel)
              </label>
              <FileUploadDebug
                label="Glissez la déclaration du vendeur ou cliquez pour sélectionner"
                accept="image/*,.pdf"
                onFileSelected={file => setDvPhoto(file)}
                currentFile={dvPhoto}
              />
              {dvPhoto && (
                <div className="mt-2">
                  <button type="button" onClick={extractFromDV} disabled={isProcessing} className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50 text-sm">
                    {isProcessing ? "Extraction..." : "Extraire les infos"}
                  </button>
                </div>
              )}
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Requérants * <span className="text-red-500">(obligatoire)</span></label>
                <input type="text" value={formData.requerants} onChange={e => setFormData(prev => ({ ...prev, requerants: e.target.value }))} className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500" placeholder="Ex: Jean Dupont et Marie Tremblay" required />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Adresse de la propriété * <span className="text-red-500">(obligatoire)</span></label>
                <div className="flex gap-2">
                  <input type="text" value={formData.propriete_adresse} onChange={e => setFormData(prev => ({ ...prev, propriete_adresse: e.target.value }))} className="flex-1 px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500" placeholder="Ex: 123 Rue Principale, Montréal, QC" required />
                  <button type="button" onClick={fetchWeather} disabled={weatherLoading || !formData.propriete_adresse} className="px-3 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50" title="Détecter la météo">
                    {weatherLoading ? <span className="animate-spin inline-block text-xs">⏳</span> : <CloudSun className="w-5 h-5" />}
                  </button>
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Nom du client</label>
                <input type="text" value={formData.client_nom} onChange={e => setFormData(prev => ({ ...prev, client_nom: e.target.value }))} className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500" placeholder="Ex: Jean Dupont" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Téléphone du client</label>
                <input type="tel" value={formData.client_telephone} onChange={e => setFormData(prev => ({ ...prev, client_telephone: e.target.value }))} className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500" placeholder="514-123-4567" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Courriel du client</label>
                <input type="email" value={formData.client_courriel} onChange={e => setFormData(prev => ({ ...prev, client_courriel: e.target.value }))} className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500" placeholder="jean.dupont@email.com" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Type de propriété</label>
                <select value={formData.type_propriete} onChange={e => setFormData(prev => ({ ...prev, type_propriete: e.target.value }))} className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500">
                  <option value="residential">Résidentiel</option>
                  <option value="commercial">Commercial</option>
                  <option value="multiplex">Multiplex</option>
                  <option value="condo">Condominium</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Année de construction</label>
                <input type="text" value={formData.annee_construction} onChange={e => setFormData(prev => ({ ...prev, annee_construction: e.target.value }))} className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500" placeholder="Ex: 1985" />
              </div>
            </div>
          </div>

          {/* ── Conditions d'inspection ────────────────────────────────── */}
          <div className="border rounded-xl p-6">
            <div className="flex items-center gap-2 mb-4">
              <Calendar className="w-5 h-5 text-blue-600" />
              <h2 className="text-xl font-semibold">Conditions d'inspection</h2>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  <Clock className="inline w-4 h-4 mr-1" />
                  Date et heure de l'inspection
                </label>
                <input type="text" value={formData.date_heure} onChange={e => setFormData(prev => ({ ...prev, date_heure: e.target.value }))} className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Conditions météo</label>
                <input type="text" value={formData.conditions_meteo} onChange={e => { conditionsMeteoRef.current = e.target.value; setFormData(prev => ({ ...prev, conditions_meteo: e.target.value })); }} className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500" placeholder="Ex: Ensoleillé, 18°C" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Durée de l'inspection</label>
                <input type="text" value={formData.duree_inspection} onChange={e => setFormData(prev => ({ ...prev, duree_inspection: e.target.value }))} className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500" placeholder="Ex: 2h30" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Orientation de la façade</label>
                <select value={formData.orientation_facade} onChange={e => setFormData(prev => ({ ...prev, orientation_facade: e.target.value }))} className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500">
                  <option value="">Sélectionner...</option>
                  <option value="nord">Nord</option>
                  <option value="sud">Sud</option>
                  <option value="est">Est</option>
                  <option value="ouest">Ouest</option>
                </select>
              </div>
            </div>
          </div>

          {/* ── Photos — drag & drop ───────────────────────────────────── */}
          <div id="section-photos" className="border rounded-xl p-6">
            <div className="flex items-center gap-2 mb-4">
              <Camera className="w-5 h-5 text-blue-600" />
              <h2 className="text-xl font-semibold">Photos et Notes</h2>
              {buildingPhotos.length > 0 && (
                <span className="bg-blue-100 text-blue-800 text-sm font-medium px-2.5 py-0.5 rounded-full">
                  {buildingPhotos.length} photo(s)
                </span>
              )}
            </div>

            {/* Large drag & drop zone */}
            <div
              onDrop={handleDrop}
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              className={`relative border-2 border-dashed rounded-xl p-10 text-center transition-all duration-200 mb-4 ${
                isDragging
                  ? "border-blue-500 bg-blue-50 scale-[1.01]"
                  : "border-gray-300 bg-gray-50 hover:border-blue-400 hover:bg-blue-50"
              }`}
            >
              <Camera className="w-16 h-16 text-gray-300 mx-auto mb-3" />
              <p className="text-gray-500 font-medium mb-2">
                {isDragging ? "Déposez vos photos ici" : "Glissez-déposez vos photos ici"}
              </p>
              <p className="text-gray-400 text-sm mb-4">ou utilisez les boutons ci-dessous</p>
              <div className="flex flex-wrap gap-3 justify-center">
                {/* Camera — mobile capture */}
                <div>
                  <input ref={fileInputCameraRef} type="file" accept="image/*" capture="environment" multiple onChange={handleBuildingPhotosChange} className="hidden" id="photos-camera" />
                  <label htmlFor="photos-camera" className="inline-flex items-center gap-2 px-5 py-2.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 cursor-pointer font-medium text-sm">
                    <Camera className="w-4 h-4" />
                    Prendre une photo
                  </label>
                </div>
                {/* Browse */}
                <div>
                  <input ref={fileInputBrowseRef} type="file" accept="image/*" multiple onChange={handleBuildingPhotosChange} className="hidden" id="photos-browse" />
                  <label htmlFor="photos-browse" className="inline-flex items-center gap-2 px-5 py-2.5 bg-gray-700 text-white rounded-lg hover:bg-gray-800 cursor-pointer font-medium text-sm">
                    <Upload className="w-4 h-4" />
                    Parcourir les fichiers
                  </label>
                </div>
                {/* Directory picker — bypasses Windows file picker ~28-file limit */}
                <div>
                  <input ref={fileInputDirRef} type="file" multiple onChange={handleDirectoryChange} className="hidden" id="photos-directory" />
                  <label htmlFor="photos-directory" className="inline-flex items-center gap-2 px-5 py-2.5 bg-emerald-700 text-white rounded-lg hover:bg-emerald-800 cursor-pointer font-medium text-sm">
                    <FolderOpen className="w-4 h-4" />
                    Importer un dossier
                  </label>
                </div>
              </div>
            </div>

            {/* Photo grid with classification badges — thumbnailVersion forces re-render */}
            {buildingPhotos.length > 0 && (
              <div key={`grid-${thumbnailVersion}`} className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 gap-2 mb-4">
                {buildingPhotos.map((photo) => {
                  const cls = photoClassifications.get(photo.name);
                  const thumbUrl = thumbnailUrlsRef.current.get(photo.name);
                  const isEditingThis = editingClassification === photo.name;
                  const exifLabel = formatExifLabel(photoMetadata.get(photo.name) ?? {});
                  return (
                    <div key={photo.name} className="relative group aspect-square rounded-lg overflow-hidden bg-gray-100 border border-gray-200">
                      {thumbUrl ? (
                        <img src={thumbUrl} alt={photo.name} className="w-full h-full object-cover" />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center">
                          <Camera className="w-6 h-6 text-gray-400" />
                        </div>
                      )}
                      {cls && !isEditingThis && (
                        <button
                          type="button"
                          onClick={() => setEditingClassification(photo.name)}
                          className={`absolute bottom-0 left-0 right-0 text-xs px-1 py-0.5 truncate font-medium ${sectionColor(cls.section)}`}
                          title={`${cls.section}${cls.subTopic ? ` — ${cls.subTopic}` : ""} (${Math.round(cls.confidence * 100)}%) — cliquer pour modifier`}
                        >
                          {cls.subTopic || cls.section.split(" ")[0]}
                        </button>
                      )}
                      {isEditingThis && (
                        <div className="absolute inset-0 bg-black/80 flex items-center justify-center p-1">
                          <select
                            autoFocus
                            value={cls?.section ?? ""}
                            onChange={e => {
                              const newSection = e.target.value;
                              setPhotoClassifications(prev => {
                                const next = new Map(prev);
                                next.set(photo.name, { section: newSection, subTopic: "", confidence: 1.0 });
                                return next;
                              });
                              setEditingClassification(null);
                            }}
                            onBlur={() => setEditingClassification(null)}
                            className="w-full text-xs rounded p-0.5"
                          >
                            <option value="">— Aucune —</option>
                            {CONSTAT_SECTIONS.map(s => <option key={s} value={s}>{s}</option>)}
                          </select>
                        </div>
                      )}
                      {exifLabel && !isEditingThis && (
                        <div className="absolute top-0 left-0 right-0 bg-black/50 text-white text-[9px] leading-tight px-1 py-0.5 truncate" title={exifLabel}>
                          {exifLabel}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}

            {/* Analyse button */}
            {buildingPhotos.length > 0 && (
              <div className="flex justify-center mt-2">
                <button
                  type="button"
                  onClick={generateDescription}
                  disabled={isProcessing}
                  className="px-6 py-3 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50 flex items-center gap-2"
                >
                  <Sparkles className="w-5 h-5" />
                  {isProcessing ? "Analyse en cours..." : "Analyser les photos (rapport complet)"}
                </button>
              </div>
            )}

            {/* Notes files */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-5">
              <div className="p-4 border-2 border-dashed border-gray-300 rounded-lg text-center">
                <FileText className="w-10 h-10 text-gray-400 mx-auto mb-2" />
                <p className="text-sm text-gray-600 mb-2">Notes manuscrites</p>
                <input type="file" accept="image/*" multiple onChange={handleInspectorNotesChange} className="hidden" id="inspector-notes" />
                <label htmlFor="inspector-notes" className="inline-flex items-center px-3 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 cursor-pointer text-sm">
                  {inspectorNotes.length > 0 ? `${inspectorNotes.length} note(s)` : "Ajouter des notes"}
                </label>
              </div>
              <div className="p-4 border-2 border-dashed border-gray-300 rounded-lg text-center">
                <div className="w-10 h-10 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-2">
                  <Mic className="w-5 h-5 text-red-500" />
                </div>
                <p className="text-sm text-gray-600 mb-2">Notes vocales (fichiers)</p>
                <input type="file" accept="audio/*" multiple onChange={handleVoiceNotesChange} className="hidden" id="voice-notes-upload" />
                <label htmlFor="voice-notes-upload" className="inline-flex items-center px-3 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 cursor-pointer text-sm">
                  {voiceNotes.length > 0 ? `${voiceNotes.length} fichier(s)` : "Ajouter des vocales"}
                </label>
              </div>
            </div>
          </div>

          {/* ── Classification IA ──────────────────────────────────────── */}
          <div id="section-classification" className="border rounded-xl p-6">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <Sparkles className="w-5 h-5 text-blue-600" />
                <h2 className="text-xl font-semibold">Classification IA</h2>
                <span className="text-sm text-gray-500">
                  {[...photoClassifications.values()].filter(v => v.section !== "none").length} photo(s) classifiée(s)
                  {classifyBatchInfo && classifyBatchInfo.unidentified > 0 && (
                    <span className="ml-2 text-orange-500">{classifyBatchInfo.unidentified} non identifiables</span>
                  )}
                </span>
              </div>
              {classificationProgress > 0 && classificationProgress < 100 && (
                <span className="text-sm font-medium text-blue-600">
                  {classifyBatchInfo
                    ? `${[...photoClassifications.values()].filter(v => v.section !== "none").length}/${classifyBatchInfo.photoTotal} — batch ${classifyBatchInfo.current}/${classifyBatchInfo.total}`
                    : `${classificationProgress}%`}
                </span>
              )}
            </div>

            {/* Gradient progress bar */}
            {classificationProgress > 0 && (
              <div className="w-full bg-gray-200 rounded-full h-2.5 mb-4">
                <div
                  className="h-2.5 rounded-full bg-gradient-to-r from-blue-500 to-indigo-600 transition-all duration-500"
                  style={{ width: `${classificationProgress}%` }}
                />
              </div>
            )}

            {photoClassifications.size === 0 && buildingPhotos.length === 0 && (
              <p className="text-gray-400 text-sm text-center py-4">
                Ajoutez des photos pour démarrer la classification automatique
              </p>
            )}

            {photoClassifications.size > 0 && (
              <div className="flex flex-wrap gap-2">
                {CONSTAT_SECTIONS.map(section => {
                  const count = [...photoClassifications.values()].filter(c => c.section === section).length;
                  if (count === 0) return null;
                  return (
                    <span key={section} className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-sm font-medium ${sectionColor(section)}`}>
                      {section} <span className="font-bold">{count}</span>
                    </span>
                  );
                })}
              </div>
            )}
          </div>

          {/* ── Auto-constats par section ──────────────────────────────── */}
          <div id="section-constats" className="border rounded-xl p-6">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <FileText className="w-5 h-5 text-green-600" />
                <h2 className="text-xl font-semibold">Constats par section</h2>
                {autoConstatsInProgress && (
                  <span className="text-sm text-blue-600 flex items-center gap-1">
                    <span className="animate-spin inline-block w-4 h-4 border-2 border-blue-600 border-t-transparent rounded-full" />
                    En cours…
                  </span>
                )}
              </div>
              {photoClassifications.size > 0 && (
                <button
                  type="button"
                  onClick={generateAutoConstats}
                  disabled={autoConstatsInProgress}
                  className="px-4 py-2 text-sm bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50 flex items-center gap-1"
                >
                  <Sparkles className="w-4 h-4" />
                  Rédiger les constats
                </button>
              )}
            </div>

            {autoConstatsError && (
              <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg flex items-center gap-2 text-sm text-red-700">
                <AlertCircle className="w-4 h-4 flex-shrink-0" />
                {autoConstatsError}
              </div>
            )}

            <div className="space-y-4">
              {(CONSTAT_SECTIONS as readonly ConstatSection[]).map(section => {
                const photosInSection = [...photoClassifications.entries()].filter(([, v]) => v.section === section);
                const constat = autoConstats.get(section) ?? "";
                const deficiencies = autoDeficiencies.get(section) ?? [];
                const isLoading = autoConstatsLoading.has(section);
                const hasContent = constat.length > 0 || isLoading || photosInSection.length > 0;

                if (!hasContent) return null;

                return (
                  <div key={section} className="border rounded-lg overflow-hidden">
                    <div className={`flex items-center justify-between px-4 py-3 ${sectionColor(section)}`}>
                      <div className="flex items-center gap-2">
                        <span className="font-semibold">{section}</span>
                        <span className="text-xs opacity-75">{photosInSection.length} photo(s)</span>
                      </div>
                      <div className="flex items-center gap-2">
                        {/* Mic per section */}
                        <button
                          type="button"
                          onClick={() => isRecording === section ? stopRecording() : startRecording(section)}
                          disabled={voiceLoading || (isRecording !== null && isRecording !== section)}
                          className={`flex items-center gap-1 px-2 py-1 rounded text-xs font-medium transition-colors ${
                            isRecording === section
                              ? "bg-red-600 text-white animate-pulse"
                              : "bg-white/50 hover:bg-white/80"
                          }`}
                        >
                          <Mic className="w-3.5 h-3.5" />
                          {isRecording === section ? formatTime(recordingTime) : "Dicter"}
                        </button>
                        {photosInSection.length > 0 && !constat && !isLoading && (
                          <button
                            type="button"
                            onClick={() => generateAutoConstatForSection(section)}
                            className="px-2 py-1 text-xs bg-white/50 hover:bg-white/80 rounded font-medium"
                          >
                            Générer
                          </button>
                        )}
                      </div>
                    </div>

                    <div className="p-4 bg-white">
                      {isLoading && (
                        <div className="flex items-center gap-2 text-sm text-gray-500 py-2">
                          <span className="animate-spin inline-block w-4 h-4 border-2 border-blue-500 border-t-transparent rounded-full" />
                          Rédaction du constat en cours…
                        </div>
                      )}
                      {!isLoading && (
                        <textarea
                          value={constat}
                          onChange={e => setAutoConstats(prev => { const next = new Map(prev); next.set(section, e.target.value); return next; })}
                          rows={4}
                          className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 text-sm resize-y"
                          placeholder={`Constat d'inspection pour ${section}…`}
                        />
                      )}

                      {/* Deficiency badges */}
                      {deficiencies.length > 0 && (
                        <div className="mt-3 space-y-2">
                          {deficiencies.map((d, i) => (
                            <div key={i} className="flex flex-wrap items-start gap-2">
                              <span className={`inline-block px-2 py-0.5 rounded text-xs font-semibold ${severityColor(d.severity)}`}>
                                {inspectorInfo.reportLanguage === "en"
                                  ? ({ mineur: "minor", modéré: "moderate", majeur: "major", sécurité: "safety" } as Record<string, string>)[d.severity] ?? d.severity
                                  : d.severity}
                              </span>
                              <span className="text-sm text-gray-700">{d.description}</span>
                              {d.recommendation && (
                                <span className="text-xs text-gray-500 italic w-full ml-2">{d.recommendation}</span>
                              )}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}

              {photoClassifications.size === 0 && (
                <p className="text-gray-400 text-sm text-center py-6">
                  Les constats seront générés automatiquement après la classification des photos
                </p>
              )}
            </div>
          </div>

          {/* ── Description du bâtiment ───────────────────────────────── */}
          <div className="border rounded-xl p-6">
            <div className="flex items-center gap-2 mb-4">
              <FileText className="w-5 h-5 text-blue-600" />
              <h2 className="text-xl font-semibold">Description du bâtiment</h2>
            </div>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Description sommaire</label>
                <textarea value={formData.description_sommaire} onChange={e => setFormData(prev => ({ ...prev, description_sommaire: e.target.value }))} rows={4} className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500" placeholder="Décrivez le bâtiment (type, matériaux, caractéristiques principales)…" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Condition générale du bâtiment</label>
                <textarea value={formData.condition_generale} onChange={e => setFormData(prev => ({ ...prev, condition_generale: e.target.value }))} rows={4} className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500" placeholder="État général du bâtiment, problèmes observés, recommandations…" />
              </div>
            </div>
          </div>

          {/* ── Révision de conformité ────────────────────────────────── */}
          <div id="section-revision" className="border rounded-xl p-6 bg-white">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <span className={`w-6 h-6 rounded-full text-white text-xs font-bold flex items-center justify-center ${isCompliant ? "bg-green-500" : "bg-amber-500"}`}>
                  {isCompliant ? "✓" : "!"}
                </span>
                <h2 className="text-xl font-semibold">Révision de conformité</h2>
                <span className="text-sm text-gray-500">({inspectorInfo.province || "QC"})</span>
              </div>
              <span className={`text-sm font-semibold px-2.5 py-1 rounded-full ${isCompliant ? "bg-green-100 text-green-700" : "bg-amber-100 text-amber-700"}`}>
                {complianceChecklist.filter(s => s.mandatory && s.covered).length}/{complianceChecklist.filter(s => s.mandatory).length} sections
              </span>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {complianceChecklist.map(sec => (
                <div key={sec.id} className={`flex items-start gap-2 p-2.5 rounded-lg text-sm border ${
                  sec.covered
                    ? "bg-green-50 border-green-100 text-green-800"
                    : sec.mandatory
                    ? "bg-red-50 border-red-100 text-red-800"
                    : "bg-yellow-50 border-yellow-100 text-yellow-800"
                }`}>
                  <span className={`flex-shrink-0 w-5 h-5 rounded-full flex items-center justify-center text-white text-xs font-bold mt-0.5 ${
                    sec.covered ? "bg-green-500" : sec.mandatory ? "bg-red-500" : "bg-yellow-500"
                  }`}>
                    {sec.covered ? "✓" : sec.mandatory ? "✗" : "!"}
                  </span>
                  <div className="min-w-0">
                    <p className="font-semibold">
                      {inspectorInfo.reportLanguage === "en"
                        ? (sec.labelEn ?? sec.labelFr)
                        : inspectorInfo.reportLanguage === "bilingual"
                        ? `${sec.labelFr} / ${sec.labelEn ?? sec.labelFr}`
                        : sec.labelFr}
                    </p>
                    {!sec.covered && sec.mandatory && (
                      <p className="text-xs mt-0.5 opacity-80">
                        {inspectorInfo.reportLanguage === "en"
                          ? (sec.descriptionEn ?? sec.descriptionFr).split(".")[0] + "."
                          : sec.descriptionFr.split(".")[0] + "."}
                      </p>
                    )}
                    {!sec.covered && !sec.mandatory && (
                      <p className="text-xs mt-0.5 opacity-75">
                        {inspectorInfo.reportLanguage === "en" ? "Recommended" : "Recommandé"}
                      </p>
                    )}
                  </div>
                </div>
              ))}
            </div>
            {!isCompliant && (
              <div className="mt-4 p-3 bg-amber-50 border border-amber-200 rounded-lg text-sm text-amber-800">
                <AlertCircle className="inline w-4 h-4 mr-1" />
                <span className="font-semibold">Sections manquantes :</span>{" "}
                {complianceMissing.map(s => s.labelFr).join(", ")}.{" "}
                Vous pouvez tout de même soumettre le formulaire.
              </div>
            )}
          </div>

          {/* ── Submit button ─────────────────────────────────────────── */}
          <div id="section-submit" className="flex flex-col items-center gap-4 pb-4">
            <button
              type="submit"
              disabled={isProcessing || !formData.requerants || !formData.propriete_adresse}
              className={`px-8 py-3 font-semibold rounded-lg disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2 ${
                isCompliant ? "bg-green-600 hover:bg-green-700 text-white" : "bg-amber-500 hover:bg-amber-600 text-white"
              }`}
            >
              {isProcessing ? (
                <>
                  <span className="animate-spin rounded-full h-4 w-4 border-b-2 border-white" />
                  Traitement en cours…
                </>
              ) : (
                <>
                  <CheckCircle className="w-5 h-5" />
                  {isCompliant ? "Créer l'inspection intelligente" : "⚠ Soumettre (conformité incomplète)"}
                </>
              )}
            </button>

            {/* ── PDF download button (shown after successful submission) ── */}
            {submittedInspectionId && (
              <div className="flex flex-col items-center gap-2">
                <p className="text-sm text-green-700 font-medium flex items-center gap-1">
                  <CheckCircle className="w-4 h-4" />
                  Inspection créée — {submittedInspectionId}
                </p>
                <button
                  type="button"
                  onClick={downloadPdf}
                  disabled={isPdfGenerating}
                  className="px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-lg disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2 shadow-md"
                >
                  {isPdfGenerating ? (
                    <>
                      <span className="animate-spin rounded-full h-4 w-4 border-b-2 border-white" />
                      Génération du PDF…
                    </>
                  ) : (
                    <>
                      <FileText className="w-5 h-5" />
                      Télécharger le rapport PDF
                    </>
                  )}
                </button>
              </div>
            )}
          </div>
        </form>
      </div>

      {/* ── CTA fixe en bas ──────────────────────────────────────────────── */}
      <div className="fixed bottom-0 left-0 right-0 z-40 bg-white border-t border-gray-200 shadow-lg">
        <div className="max-w-4xl mx-auto px-4 py-3 flex items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <span className="bg-blue-100 text-blue-800 text-sm font-semibold px-3 py-1 rounded-full">
              {completedSectionsCount}/5 sections
            </span>
            {autoConstats.size > 0 && (
              <span className="text-sm text-gray-500 hidden sm:inline">
                {autoConstats.size} constat(s) rédigé(s)
              </span>
            )}
          </div>
          <div className="flex items-center gap-2">
            {/* Bouton dictée global */}
            <button
              type="button"
              onClick={() => isRecording === "auto" ? stopRecording() : startRecording("auto")}
              disabled={voiceLoading || (isRecording !== null && isRecording !== "auto")}
              className={`flex items-center gap-1 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                isRecording === "auto"
                  ? "bg-red-600 text-white animate-pulse"
                  : "bg-gray-100 hover:bg-gray-200 text-gray-700"
              }`}
            >
              <Mic className="w-4 h-4" />
              {isRecording === "auto" ? formatTime(recordingTime) : "Dicter"}
            </button>
            {/* Soumettre le rapport */}
            <button
              type="button"
              onClick={submitInspection}
              disabled={isProcessing || !formData.requerants || !formData.propriete_adresse}
              className={`px-6 py-2 font-semibold rounded-lg text-sm disabled:opacity-50 flex items-center gap-2 ${
                isCompliant ? "bg-green-600 hover:bg-green-700 text-white" : "bg-amber-500 hover:bg-amber-600 text-white"
              }`}
            >
              <CheckCircle className="w-4 h-4" />
              Soumettre le rapport
            </button>
            {/* Bouton PDF (après soumission réussie) */}
            {submittedInspectionId && (
              <button
                type="button"
                onClick={downloadPdf}
                disabled={isPdfGenerating}
                className="px-5 py-2 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-lg text-sm disabled:opacity-50 flex items-center gap-1"
              >
                {isPdfGenerating
                  ? <span className="animate-spin rounded-full h-3.5 w-3.5 border-b-2 border-white" />
                  : <FileText className="w-3.5 h-3.5" />
                }
                PDF
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
