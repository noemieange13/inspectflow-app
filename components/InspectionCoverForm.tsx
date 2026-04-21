"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import {
  buildComplianceBlockV1,
  COMPLIANCE_JURISDICTIONS,
  COMPLIANCE_LABELS,
  COMPLIANCE_TEMPLATE_VERSION,
  defaultComplianceNote,
  defaultCoverPayloadV1,
  formatFrDateTime,
  hydrationSafeInitialCoverPayloadV1,
  loadInspectorProfile,
  parseCoverV1FromUnknown,
  saveInspectorProfile,
  type ComplianceJurisdiction,
  type FacadeOrientation,
  type InspectionCoverPayloadV1,
  type InspectorProfileV1,
} from "@/lib/inspectionCoverPayload";
import {
  effectiveDescriptionNarrative,
  formatDescriptionSommaireFr,
} from "@/lib/coverResumeFormat";
import { evaluateCoverReadiness } from "@/lib/reportReadiness";
import type { ReadinessIssue } from "@/lib/reportReadiness";
import { emitProductEvent } from "@/lib/productTelemetry";
import {
  LIMITATION_CHECKLIST_DEFS,
  type LimitationChecklistId,
  suggestLimitationsFromCover,
} from "@/lib/limitations";
import InspectionResumePanel from "@/components/InspectionResumePanel";
import ReportVersionTimeline from "@/components/ReportVersionTimeline";
import {
  TerrainDescriptionModePills,
  TerrainSmartEntryHero,
  TerrainWeatherGpsBadge,
  terrainAutoFieldClass,
} from "@/components/terrain/TerrainPrimitives";
import { fetchWeatherOpenMeteo, geolocationPosition } from "@/lib/weatherOpenMeteo";

export type InspectionCoverFormProps = {
  reportId?: string;
  viewerToken?: string;
  /** Indique si un PDF est déjà associé (affichage rassurant sur le résumé). */
  reportHasPdf?: boolean;
  initialCoverFromReport?: InspectionCoverPayloadV1 | null;
  initialInspectorProfileFromReport?: InspectorProfileV1 | null;
};

const DRAFT_KEY = "inspectflow:cover_form_draft_v1";

/** Contexte texte envoyé à `/api/inspection-assist` (pas d’images). */
function compactCoverContext(d: InspectionCoverPayloadV1): Record<string, string> {
  const out: Record<string, string> = {};
  const t = (s: string) => s.trim();
  if (t(d.requerants)) out.requerants = t(d.requerants);
  if (t(d.propriete.adresse)) out.adresse = t(d.propriete.adresse);
  if (t(d.propriete.type_propriete)) out.type_propriete = t(d.propriete.type_propriete);
  if (t(d.propriete.annee_construction)) out.annee_construction = t(d.propriete.annee_construction);
  if (t(d.propriete.client_nom)) out.client_nom = t(d.propriete.client_nom);
  if (t(d.propriete.client_telephone)) out.client_telephone = t(d.propriete.client_telephone);
  if (t(d.propriete.client_courriel)) out.client_courriel = t(d.propriete.client_courriel);
  if (t(d.intervenants_sur_place)) out.intervenants = t(d.intervenants_sur_place);
  const ds = d.description_sommaire;
  for (const key of [
    "type_maison",
    "construit_en",
    "facade",
    "cotes",
    "arriere",
    "toiture",
    "type_fondation",
    "type_structure",
    "chauffage",
  ] as const) {
    const v = t(ds[key]);
    if (v) out[`description_${key}`] = v;
  }
  if (t(d.condition_generale)) {
    out.condition_generale = t(d.condition_generale).slice(0, 2000);
  }
  if (d.orientation_facade) out.orientation_facade = d.orientation_facade;
  if (t(d.conditions_meteo)) out.meteo = t(d.conditions_meteo);
  if (t(d.duree_inspection)) out.duree_inspection = t(d.duree_inspection);
  out.mode_description = ds.mode;
  return out;
}

const inputClass =
  "mt-1 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500";
const labelClass = "block text-sm font-medium text-slate-700";

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="border-b border-slate-200 pb-2 text-lg font-semibold tracking-tight text-slate-900">
      {children}
    </h2>
  );
}

export default function InspectionCoverForm({
  reportId,
  viewerToken,
  reportHasPdf,
  initialCoverFromReport,
  initialInspectorProfileFromReport,
}: InspectionCoverFormProps = {}) {
  const [data, setData] = useState<InspectionCoverPayloadV1>(hydrationSafeInitialCoverPayloadV1);
  const [profile, setProfile] = useState<InspectorProfileV1 | null>(null);
  const [iaMessage, setIaMessage] = useState<string | null>(null);
  const [weatherLoading, setWeatherLoading] = useState(false);
  const [errors, setErrors] = useState<{ requerants?: string; adresse?: string }>({});
  const [remoteSaving, setRemoteSaving] = useState(false);
  const [dvLoading, setDvLoading] = useState(false);
  const [descriptionExtracting, setDescriptionExtracting] = useState(false);
  const [conditionSynthesizing, setConditionSynthesizing] = useState(false);
  const [notesSubmitting, setNotesSubmitting] = useState(false);
  const [aiImproveLoading, setAiImproveLoading] = useState<null | "description" | "condition">(null);
  const [terrainNoteText, setTerrainNoteText] = useState("");
  const [weatherFilledByGps, setWeatherFilledByGps] = useState(false);
  const [compassSampling, setCompassSampling] = useState(false);
  const [draftSaveHint, setDraftSaveHint] = useState<string | null>(null);
  /** `resume` = écran unique « document » ; `outils` = imports DV / photos / notes (ex-formulaire). */
  const [workspace, setWorkspace] = useState<"resume" | "outils">("resume");
  const didAutoDateRef = useRef(false);
  const descriptionFileInputRef = useRef<HTMLInputElement>(null);
  const notesPhotoRef = useRef<HTMLInputElement>(null);
  const notesAudioRef = useRef<HTMLInputElement>(null);

  const linkedToReport = !!(reportId && viewerToken);

  useEffect(() => {
    let next = defaultCoverPayloadV1();

    if (initialCoverFromReport) {
      next = {
        ...next,
        ...initialCoverFromReport,
        propriete: {
          ...next.propriete,
          ...initialCoverFromReport.propriete,
        },
        description_sommaire: {
          ...next.description_sommaire,
          ...initialCoverFromReport.description_sommaire,
        },
      };
    } else {
      try {
        const raw = localStorage.getItem(DRAFT_KEY);
        if (raw) {
          const parsed = JSON.parse(raw) as InspectionCoverPayloadV1;
          if (parsed?.schema_version === 1) {
            next = {
              ...next,
              ...parsed,
              propriete: { ...next.propriete, ...parsed.propriete },
              description_sommaire: {
                ...next.description_sommaire,
                ...parsed.description_sommaire,
              },
            };
          }
        }
      } catch {
        /* ignore */
      }
    }

    const prof = initialInspectorProfileFromReport ?? loadInspectorProfile();
    if (prof) {
      setProfile(prof);
      next = {
        ...next,
        inspecteur_nom: prof.nom || next.inspecteur_nom,
        inspecteur_numero_certification:
          prof.numero_certification || next.inspecteur_numero_certification,
        compagnie: prof.compagnie || next.compagnie,
      };
    }

    const normalized = parseCoverV1FromUnknown(next);
    if (normalized) {
      next = normalized;
    }

    setData(next);
  }, [initialCoverFromReport, initialInspectorProfileFromReport]);

  useEffect(() => {
    if (didAutoDateRef.current) return;
    didAutoDateRef.current = true;
    setData((prev) => {
      if (prev.date_heure_affichage.trim()) return prev;
      const now = new Date();
      return {
        ...prev,
        date_heure_affichage: formatFrDateTime(now),
        date_heure_iso: now.toISOString(),
      };
    });
  }, []);

  useEffect(() => {
    if (linkedToReport) return;
    const t = window.setTimeout(() => {
      try {
        localStorage.setItem(DRAFT_KEY, JSON.stringify(data));
        setDraftSaveHint(
          `Brouillon auto-enregistré — ${new Date().toLocaleTimeString("fr-CA", { hour: "2-digit", minute: "2-digit", second: "2-digit" })}`,
        );
      } catch {
        setDraftSaveHint(null);
      }
    }, 800);
    return () => window.clearTimeout(t);
  }, [data, linkedToReport]);

  const update = useCallback(<K extends keyof InspectionCoverPayloadV1>(
    key: K,
    value: InspectionCoverPayloadV1[K],
  ) => {
    setData((prev) => ({ ...prev, [key]: value }));
  }, []);

  const updatePropriete = useCallback(
    (key: keyof InspectionCoverPayloadV1["propriete"], value: string) => {
      setData((prev) => ({
        ...prev,
        propriete: { ...prev.propriete, [key]: value },
      }));
    },
    [],
  );

  const updateDescription = useCallback(
    (key: keyof InspectionCoverPayloadV1["description_sommaire"], value: string | InspectionCoverPayloadV1["description_sommaire"]["mode"]) => {
      setData((prev) => ({
        ...prev,
        description_sommaire: { ...prev.description_sommaire, [key]: value },
      }));
    },
    [],
  );

  const fillNow = useCallback(() => {
    const now = new Date();
    setData((prev) => ({
      ...prev,
      date_heure_affichage: formatFrDateTime(now),
      date_heure_iso: now.toISOString(),
    }));
  }, []);

  const fillWeather = useCallback(async () => {
    setWeatherLoading(true);
    setIaMessage(null);
    try {
      const pos = await geolocationPosition();
      const w = await fetchWeatherOpenMeteo(
        pos.coords.latitude,
        pos.coords.longitude,
      );
      update("conditions_meteo", w.line_fr);
      setWeatherFilledByGps(true);
    } catch (e) {
      setIaMessage(
        e instanceof Error
          ? e.message
          : "Impossible de récupérer la météo (permission lieu refusée ou réseau).",
      );
    } finally {
      setWeatherLoading(false);
    }
  }, [update]);

  const persistProfile = useCallback(() => {
    const p: InspectorProfileV1 = {
      nom: data.inspecteur_nom.trim(),
      numero_certification: data.inspecteur_numero_certification.trim(),
      compagnie: data.compagnie.trim(),
      logo_data_url: profile?.logo_data_url ?? null,
    };
    if (!saveInspectorProfile(p)) {
      setIaMessage(
        "Impossible d’enregistrer le profil dans ce navigateur (stockage plein, mode privé ou données bloquées). Réessayez après avoir réduit la taille du logo ou vidé un peu l’espace local.",
      );
      return;
    }
    setProfile(p);
    setIaMessage(
      "Profil inspecteur enregistré dans ce navigateur — nom, certification, compagnie et logo (si présent). Pensez à « Enregistrer sur le rapport » pour le PDF.",
    );
  }, [data.inspecteur_nom, data.inspecteur_numero_certification, data.compagnie, profile?.logo_data_url]);

  const onLogo = useCallback((file: File | null) => {
    if (!file) return;
    if (file.size > 800_000) {
      setIaMessage("Logo trop lourd (max ~800 Ko). Choisis une image plus petite.");
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      const url = typeof reader.result === "string" ? reader.result : null;
      setProfile((prev) => ({
        nom: data.inspecteur_nom.trim() || prev?.nom || "",
        numero_certification:
          data.inspecteur_numero_certification.trim() ||
          prev?.numero_certification ||
          "",
        compagnie: data.compagnie.trim() || prev?.compagnie || "",
        logo_data_url: url,
      }));
      setIaMessage(
        linkedToReport
          ? "Logo mis à jour — cliquez « Enregistrer sur le rapport » pour l’inclure au payload et au PDF."
          : "Logo enregistré dans le profil navigateur. Ouvrez la couverture depuis un rapport (lien avec jeton) et enregistrez-y pour que le logo parte dans le HTML/PDF.",
      );
    };
    reader.readAsDataURL(file);
  }, [data.inspecteur_nom, data.inspecteur_numero_certification, data.compagnie, linkedToReport]);

  const scrollToManualFields = useCallback(() => {
    document.getElementById("terrain-propriete-fields")?.scrollIntoView({
      behavior: "smooth",
      block: "start",
    });
  }, []);

  const tryCompassFacade = useCallback(async () => {
    if (typeof window === "undefined" || !window.DeviceOrientationEvent) {
      setIaMessage(
        "Boussole indisponible sur ce navigateur — choisissez Nord / Sud / Est / Ouest ci-dessous.",
      );
      return;
    }

    // iOS 13+ (Safari) : sans cette permission, aucun événement `deviceorientation` n’est émis.
    const OrientationCtor = window.DeviceOrientationEvent as typeof DeviceOrientationEvent & {
      requestPermission?: () => Promise<"granted" | "denied" | "default">;
    };
    if (typeof OrientationCtor.requestPermission === "function") {
      try {
        const perm = await OrientationCtor.requestPermission();
        if (perm !== "granted") {
          setIaMessage(
            "Accès à la boussole refusé — indiquez l’orientation à la main (Nord / Sud / Est / Ouest).",
          );
          return;
        }
      } catch {
        setIaMessage(
          "Impossible d’activer la boussole — choisissez l’orientation manuellement.",
        );
        return;
      }
    }

    setCompassSampling(true);
    setIaMessage("Tenez le téléphone à plat et tournez-vous ; lecture du cap…");
    let settled = false;
    const done = (dir: FacadeOrientation) => {
      if (settled) return;
      settled = true;
      window.removeEventListener("deviceorientation", onOrient);
      update("orientation_facade", dir);
      setCompassSampling(false);
      setIaMessage(
        `Orientation façade estimée : ${String(dir)} — vérifiez sur le terrain.`,
      );
    };
    const onOrient = (e: DeviceOrientationEvent) => {
      const a = e.alpha;
      if (a == null || Number.isNaN(a)) return;
      const x = ((a % 360) + 360) % 360;
      let dir: FacadeOrientation = "";
      if (x >= 315 || x < 45) dir = "nord";
      else if (x >= 45 && x < 135) dir = "est";
      else if (x >= 135 && x < 225) dir = "sud";
      else dir = "ouest";
      done(dir);
    };
    window.addEventListener("deviceorientation", onOrient);
    window.setTimeout(() => {
      if (!settled) {
        settled = true;
        window.removeEventListener("deviceorientation", onOrient);
        setCompassSampling(false);
        setIaMessage(
          "Cap non reçu (souvent sur ordinateur de bureau ou capteur inactif) — utilisez le choix manuel Nord / Sud / Est / Ouest.",
        );
      }
    }, 3500);
  }, [update]);

  const onDvPhoto = useCallback(async (file: File | null) => {
    if (!file) return;
    setDvLoading(true);
    setIaMessage(null);
    try {
      const fd = new FormData();
      fd.set("file", file);
      const res = await fetch("/api/cover-dv-extract", {
        method: "POST",
        body: fd,
      });
      const j = (await res.json()) as {
        ok?: boolean;
        extracted?: {
          requerants?: string;
          adresse?: string;
          type_propriete?: string;
          annee_construction?: string;
          client_nom?: string;
          client_telephone?: string;
          client_courriel?: string;
        };
        error?: string;
      };
      if (!res.ok || !j.ok || !j.extracted) {
        throw new Error(j.error ?? `Erreur ${res.status}`);
      }
      const e = j.extracted;
      setData((prev) => ({
        ...prev,
        requerants: e.requerants?.trim() ? e.requerants.trim() : prev.requerants,
        propriete: {
          ...prev.propriete,
          adresse: e.adresse?.trim() ? e.adresse.trim() : prev.propriete.adresse,
          type_propriete: e.type_propriete?.trim()
            ? e.type_propriete.trim()
            : prev.propriete.type_propriete,
          annee_construction: e.annee_construction?.trim()
            ? e.annee_construction.trim()
            : prev.propriete.annee_construction,
          client_nom: e.client_nom?.trim() ? e.client_nom.trim() : prev.propriete.client_nom,
          client_telephone: e.client_telephone?.trim()
            ? e.client_telephone.trim()
            : prev.propriete.client_telephone,
          client_courriel: e.client_courriel?.trim()
            ? e.client_courriel.trim()
            : prev.propriete.client_courriel,
        },
        ia_hints: {
          ...prev.ia_hints,
          dv_photo_imported: true,
        },
      }));
      setIaMessage(
        "Champs requérant / propriété mis à jour à partir de la photo. Vérifie et corrige si besoin.",
      );
    } catch (err) {
      setIaMessage(
        err instanceof Error ? err.message : "Échec de l’extraction DV.",
      );
    } finally {
      setDvLoading(false);
    }
  }, []);

  const runDescriptionFromPhotos = useCallback(async () => {
    const input = descriptionFileInputRef.current;
    const list = input?.files;
    if (!list?.length) {
      setIaMessage("Sélectionne d’abord une ou plusieurs photos du bâtiment.");
      return;
    }
    setDescriptionExtracting(true);
    setIaMessage(null);
    try {
      const fd = new FormData();
      for (let i = 0; i < list.length; i++) {
        fd.append("files", list[i]!);
      }
      const res = await fetch("/api/cover-description-extract", {
        method: "POST",
        body: fd,
      });
      const j = (await res.json()) as {
        ok?: boolean;
        extracted?: Record<string, string>;
        error?: string;
      };
      if (!res.ok || !j.ok || !j.extracted) {
        throw new Error(j.error ?? `Erreur ${res.status}`);
      }
      const e = j.extracted;
      setData((prev) => {
        const description_sommaire = {
          ...prev.description_sommaire,
          mode: "photos_ia" as const,
          type_maison: e.type_maison?.trim() || prev.description_sommaire.type_maison,
          construit_en: e.construit_en?.trim() || prev.description_sommaire.construit_en,
          facade: e.facade?.trim() || prev.description_sommaire.facade,
          cotes: e.cotes?.trim() || prev.description_sommaire.cotes,
          arriere: e.arriere?.trim() || prev.description_sommaire.arriere,
          toiture: e.toiture?.trim() || prev.description_sommaire.toiture,
          type_fondation: e.type_fondation?.trim() || prev.description_sommaire.type_fondation,
          type_structure: e.type_structure?.trim() || prev.description_sommaire.type_structure,
          chauffage: e.chauffage?.trim() || prev.description_sommaire.chauffage,
        };
        return {
          ...prev,
          description_sommaire,
          generated_description_text: formatDescriptionSommaireFr(description_sommaire),
          ia_hints: {
            ...prev.ia_hints,
            photos_description_imported: true,
          },
        };
      });
      setIaMessage(
        "Description sommaire remplie à partir des photos. Vérifie et complète les champs si besoin.",
      );
    } catch (err) {
      setIaMessage(
        err instanceof Error ? err.message : "Échec de l’analyse des photos.",
      );
    } finally {
      setDescriptionExtracting(false);
    }
  }, []);

  const runConditionFromReportPhotos = useCallback(async () => {
    if (!reportId || !viewerToken) return;
    setConditionSynthesizing(true);
    setIaMessage(null);
    try {
      const res = await fetch("/api/cover-condition-synthesize", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          report_id: reportId,
          access_token: viewerToken,
        }),
      });
      const j = (await res.json()) as {
        ok?: boolean;
        condition_generale?: string;
        error?: string;
        synth_source?: string;
        snapshot_photo_count?: number;
        persisted?: boolean;
        persist_error?: string;
      };
      if (!res.ok || !j.ok || !j.condition_generale) {
        throw new Error(j.error ?? `Erreur ${res.status}`);
      }
      setData((prev) => ({
        ...prev,
        condition_generale: j.condition_generale ?? prev.condition_generale,
        ia_hints: {
          ...prev.ia_hints,
          photos_condition_imported: true,
        },
      }));
      const src =
        j.synth_source === "vision_images"
          ? "lecture directe des images"
          : j.synth_source === "analysis_text"
            ? "analyses textuelles des photos"
            : j.synth_source === "analysis_text_fallback"
              ? "analyses textuelles (secours)"
              : "jeu mixte";
      const persist =
        j.persisted === false
          ? ` Enregistrement serveur impossible : ${j.persist_error ?? "voir logs"}. Le texte est appliqué localement.`
          : " Contenu aussi enregistré sur le rapport (version audit).";
      setIaMessage(
        `Condition générale (${src}) à partir de ${j.snapshot_photo_count ?? "?"} photo(s) figée(s).${persist}`,
      );
    } catch (e) {
      setIaMessage(e instanceof Error ? e.message : String(e));
    } finally {
      setConditionSynthesizing(false);
    }
  }, [reportId, viewerToken]);

  const submitTerrainNotes = useCallback(async () => {
    if (!reportId || !viewerToken) return;
    const photoInput = notesPhotoRef.current;
    const audioInput = notesAudioRef.current;
    const hasPhoto =
      photoInput?.files && photoInput.files.length > 0 && photoInput.files[0]!.size > 0;
    const hasAudio =
      audioInput?.files && audioInput.files.length > 0 && audioInput.files[0]!.size > 0;
    if (!terrainNoteText.trim() && !hasPhoto && !hasAudio) {
      setIaMessage("Ajoute du texte, une photo de notes manuscrites ou un mémo vocal.");
      return;
    }
    setNotesSubmitting(true);
    setIaMessage(null);
    try {
      const fd = new FormData();
      fd.set("report_id", reportId);
      fd.set("access_token", viewerToken);
      fd.set("language", "fr");
      if (terrainNoteText.trim()) {
        fd.set("note_text", terrainNoteText.trim());
      }
      if (hasPhoto && photoInput?.files?.[0]) {
        fd.set("note_photo", photoInput.files[0]);
      }
      if (hasAudio && audioInput?.files?.[0]) {
        fd.set("note_audio", audioInput.files[0]);
      }
      const res = await fetch("/api/process-notes", { method: "POST", body: fd });
      const j = (await res.json()) as {
        success?: boolean;
        notes_count?: number;
        error?: string;
      };
      if (!res.ok) {
        throw new Error(
          typeof j.error === "string" ? j.error : `Erreur ${res.status}`,
        );
      }
      setIaMessage(
        typeof j.notes_count === "number"
          ? `Notes traitées et ajoutées au rapport (${j.notes_count} lot(s)).`
          : "Notes traitées et ajoutées au rapport.",
      );
      setTerrainNoteText("");
      if (photoInput) photoInput.value = "";
      if (audioInput) audioInput.value = "";
    } catch (e) {
      setIaMessage(e instanceof Error ? e.message : String(e));
    } finally {
      setNotesSubmitting(false);
    }
  }, [reportId, viewerToken, terrainNoteText]);

  const runCoverAssistant = useCallback(async (label: string) => {
    setIaMessage(null);
    try {
      const res = await fetch("/api/inspection-assist", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ label, context: compactCoverContext(data) }),
      });
      const j = (await res.json()) as { ok?: boolean; message?: string };
      if (j.ok && j.message) {
        setIaMessage(j.message);
      } else {
        setIaMessage(j.message ?? "L’assistant n’a pas renvoyé de texte utilisable.");
      }
    } catch {
      setIaMessage("Erreur réseau. Vérifie la connexion et réessaie.");
    }
  }, [data]);

  const validate = useCallback(() => {
    const next: typeof errors = {};
    if (!data.requerants.trim()) next.requerants = "Champ obligatoire.";
    if (!data.propriete.adresse.trim()) next.adresse = "Champ obligatoire.";
    setErrors(next);
    return Object.keys(next).length === 0;
  }, [data.requerants, data.propriete.adresse]);

  const exportJson = useCallback(() => {
    if (!validate()) return;
    const blob = new Blob([JSON.stringify({ cover_v1: data }, null, 2)], {
      type: "application/json",
    });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `inspectflow-couverture-${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
  }, [data, validate]);

  const saveDraft = useCallback(() => {
    localStorage.setItem(DRAFT_KEY, JSON.stringify(data));
    setDraftSaveHint(
      `Brouillon enregistré manuellement — ${new Date().toLocaleTimeString("fr-CA")}`,
    );
    setIaMessage("Brouillon enregistré dans le navigateur.");
  }, [data]);

  const saveToReport = useCallback(async () => {
    if (!reportId || !viewerToken) return;
    if (!validate()) {
      setIaMessage("Corrigez les champs obligatoires avant d’enregistrer sur le rapport.");
      return;
    }
    setRemoteSaving(true);
    setIaMessage(null);
    try {
      const prof: InspectorProfileV1 = {
        nom: data.inspecteur_nom.trim(),
        numero_certification: data.inspecteur_numero_certification.trim(),
        compagnie: data.compagnie.trim(),
        logo_data_url: profile?.logo_data_url ?? null,
      };
      const res = await fetch("/api/report-cover", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          report_id: reportId,
          access_token: viewerToken,
          cover_v1: data,
          inspector_profile_v1: prof,
        }),
      });
      const j = (await res.json()) as {
        success?: boolean;
        error?: string;
        cover_saved_at?: string;
      };
      if (!res.ok || !j.success) {
        throw new Error(j.error ?? `Erreur ${res.status}`);
      }
      setIaMessage(
        `Couverture enregistrée sur le rapport${j.cover_saved_at ? ` (${new Date(j.cover_saved_at).toLocaleString("fr-CA")})` : ""}. Vous pouvez régénérer le PDF depuis la page rapport.`,
      );
    } catch (e) {
      setIaMessage(e instanceof Error ? e.message : String(e));
    } finally {
      setRemoteSaving(false);
    }
  }, [
    data,
    profile?.logo_data_url,
    reportId,
    viewerToken,
    validate,
  ]);

  const complianceNote = useMemo(
    () => defaultComplianceNote(data.conformite_juridiction),
    [data.conformite_juridiction],
  );

  const onJurisdictionSelect = useCallback((v: ComplianceJurisdiction) => {
    if (!COMPLIANCE_JURISDICTIONS.includes(v)) return;
    const defs = defaultComplianceNote(v);
    setData((prev) => ({
      ...prev,
      conformite_juridiction: v,
      notes_conformite: defs,
      compliance_block_v1: buildComplianceBlockV1(v, defs),
      compliance_profile_v1: {
        schema_version: 1 as const,
        mode: v === "ca_qc" ? "QC_2027" : "CA_STANDARD",
        clauses_pack_version: "QC_2027_v1",
      },
    }));
  }, []);

  const onComplianceNotesChange = useCallback((t: string) => {
    setData((prev) => {
      const defs = defaultComplianceNote(prev.conformite_juridiction);
      const block =
        prev.compliance_block_v1 ?? buildComplianceBlockV1(prev.conformite_juridiction, defs);
      return {
        ...prev,
        notes_conformite: t,
        compliance_block_v1: {
          ...block,
          user_note: t,
          is_user_modified: t.trim() !== block.default_note.trim(),
        },
      };
    });
  }, []);

  const improveDescriptionWithAi = useCallback(async () => {
    setAiImproveLoading("description");
    setIaMessage(null);
    try {
      const narrative = effectiveDescriptionNarrative(data);
      const res = await fetch("/api/inspection-assist", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          label:
            "Reformule et enrichis ce texte pour la section « description sommaire du bâtiment » d'un rapport d'inspection professionnel (français québécois). Réponds par un seul paragraphe fluide, sans titre ni liste à puces.",
          context: {
            description_actuelle: narrative,
            adresse: data.propriete.adresse.trim(),
          },
        }),
      });
      const j = (await res.json()) as { ok?: boolean; message?: string };
      if (j.ok && j.message?.trim()) {
        setData((prev) => ({
          ...prev,
          generated_description_text: j.message!.trim(),
        }));
        setIaMessage("Description reformulée — relisez le bloc.");
      } else {
        setIaMessage(j.message ?? "L’assistant n’a pas pu reformuler.");
      }
    } catch {
      setIaMessage("Erreur réseau.");
    } finally {
      setAiImproveLoading(null);
    }
  }, [data]);

  const improveConditionWithAi = useCallback(async () => {
    setAiImproveLoading("condition");
    setIaMessage(null);
    try {
      const res = await fetch("/api/inspection-assist", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          label:
            "Reformule et enrichis ce texte pour la section « condition générale du bâtiment » d'un rapport d'inspection. Un seul paragraphe professionnel en français, sans titre.",
          context: {
            condition_actuelle: data.condition_generale.trim() || "(vide)",
          },
        }),
      });
      const j = (await res.json()) as { ok?: boolean; message?: string };
      if (j.ok && j.message?.trim()) {
        setData((prev) => ({
          ...prev,
          condition_generale: j.message!.trim(),
        }));
        setIaMessage("Condition générale reformulée — relisez.");
      } else {
        setIaMessage(j.message ?? "L’assistant n’a pas pu reformuler.");
      }
    } catch {
      setIaMessage("Erreur réseau.");
    } finally {
      setAiImproveLoading(null);
    }
  }, [data.condition_generale]);

  return (
    <div className="space-y-10">
      {/*
        Toujours montés : en vue « Résumé », InspectionResumePanel déclenche .click() sur ces refs.
        Les entrées du panneau « Outils » réutilisent les mêmes id (labels htmlFor).
      */}
      <input
        id="cover-description-files"
        ref={descriptionFileInputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp,image/gif"
        multiple
        className="sr-only"
        tabIndex={-1}
        aria-label="Photos façades / toiture pour remplir la description sommaire"
      />
      <input
        id="cover-notes-photo"
        ref={notesPhotoRef}
        type="file"
        accept="image/*"
        className="sr-only"
        tabIndex={-1}
        aria-label="Photo de notes manuscrites pour le rapport"
      />
      <input
        id="cover-notes-audio"
        ref={notesAudioRef}
        type="file"
        accept="audio/*,.m4a,.mp3,.webm"
        className="sr-only"
        tabIndex={-1}
        aria-label="Mémo vocal pour le rapport"
      />
      <div
        className={`rounded-lg border px-4 py-3 text-sm ${
          linkedToReport
            ? "border-emerald-200 bg-emerald-50/90 text-emerald-950"
            : "border-amber-200 bg-amber-50/80 text-amber-950"
        }`}
      >
        <p className="font-medium">
          {linkedToReport
            ? `Rapport ${reportId?.slice(0, 8)}… — couverture`
            : "Couverture (brouillon local ou rapport)"}
        </p>
        <p className={`mt-1 ${linkedToReport ? "text-emerald-900/95" : "text-amber-900/90"}`}>
          {workspace === "resume"
            ? "Vue Résumé : corrigez le texte comme un document. Les actions rapides (photos, description, notes) fonctionnent ici ; le détail des champs reste sous « Outils & imports »."
            : linkedToReport
              ? "Outils et champs détaillés : extraction DV, météo, photos description / condition, notes terrain, historique des versions."
              : "Brouillon local ou liaison rapport ; extraction DV / photos nécessite OPENAI_API_KEY côté serveur."}
        </p>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <span className="text-xs font-medium text-slate-600">Affichage :</span>
          <button
            type="button"
            className={`rounded-md px-3 py-1.5 text-xs font-semibold ${
              workspace === "resume"
                ? "bg-emerald-800 text-white"
                : "border border-slate-300 bg-white text-slate-800 hover:bg-slate-50"
            }`}
            onClick={() => setWorkspace("resume")}
          >
            Résumé de l’inspection
          </button>
          <button
            type="button"
            className={`rounded-md px-3 py-1.5 text-xs font-semibold ${
              workspace === "outils"
                ? "bg-emerald-800 text-white"
                : "border border-slate-300 bg-white text-slate-800 hover:bg-slate-50"
            }`}
            onClick={() => setWorkspace("outils")}
          >
            Outils &amp; imports
          </button>
        </div>
        {linkedToReport ? (
          <p className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-2">
            <Link
              href={`/report/${encodeURIComponent(reportId!)}?token=${encodeURIComponent(viewerToken!)}`}
              className="inline-flex rounded-md bg-blue-800 px-3 py-1.5 text-sm font-semibold text-white shadow-sm hover:bg-blue-900"
            >
              Prévisualiser le rapport
            </Link>
            <span className="text-xs text-emerald-900/85">
              PDF et constats sur la page rapport.
            </span>
          </p>
        ) : null}
      </div>

      {iaMessage ? (
        <div
          className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-800"
          role="status"
        >
          {iaMessage}
        </div>
      ) : null}

      {workspace === "resume" ? (
        <InspectionResumePanel
          data={data}
          profile={profile}
          reportId={reportId}
          viewerToken={viewerToken}
          reportHasPdf={reportHasPdf}
          onChangeRequerants={(v) => update("requerants", v)}
          onChangeProprieteField={(key, v) => updatePropriete(key, v)}
          onChangeCondition={(v) => update("condition_generale", v)}
          onChangeGeneratedDescription={(v) => update("generated_description_text", v)}
          onComplianceNotesChange={onComplianceNotesChange}
          onJurisdictionSelect={onJurisdictionSelect}
          update={update}
          onOpenOutils={() => setWorkspace("outils")}
          onPickDescriptionPhotos={() => descriptionFileInputRef.current?.click()}
          onRunDescriptionFromPhotos={() => void runDescriptionFromPhotos()}
          onDvFile={(f) => void onDvPhoto(f)}
          onTriggerNotesPhoto={() => notesPhotoRef.current?.click()}
          onTriggerNotesAudio={() => notesAudioRef.current?.click()}
          terrainNoteText={terrainNoteText}
          onTerrainNoteText={setTerrainNoteText}
          onSubmitTerrainNotes={() => void submitTerrainNotes()}
          notesSubmitting={notesSubmitting}
          descriptionExtracting={descriptionExtracting}
          dvLoading={dvLoading}
          onImproveDescription={() => void improveDescriptionWithAi()}
          onImproveCondition={() => void improveConditionWithAi()}
          aiImproveLoading={aiImproveLoading}
          onAckReadiness={() => {
            const snapshot = { ...data, readiness_ack_v1: undefined };
            const r = evaluateCoverReadiness(snapshot);
            setData((prev) => ({
              ...prev,
              readiness_ack_v1: {
                schema_version: 1,
                acknowledged_at: new Date().toISOString(),
                score_at_ack: r.score,
                warning_codes_at_ack: [...r.warnings.map((w) => w.code)].sort(),
              },
              last_reviewed_fields: r.warnings.map((w) => w.code),
            }));
          }}
          onFocusReadinessIssue={(issue: ReadinessIssue) => {
            if (issue.focusId) {
              document.getElementById(issue.focusId)?.scrollIntoView({
                behavior: "smooth",
                block: "center",
              });
            }
          }}
          onChangeLimitationsFreeText={(v) => {
            update("limitations_free_text", v);
          }}
          onBlurLimitationsFreeText={() => {
            emitProductEvent("limitations_modified", { source: "free_text", edited: true });
          }}
          onToggleLimitationChecklist={(id: LimitationChecklistId) => {
            setData((prev) => ({
              ...prev,
              limitations_checklist: {
                ...prev.limitations_checklist,
                [id]: !prev.limitations_checklist?.[id],
              },
            }));
            emitProductEvent("limitations_modified", { source: "checklist", id, edited: true });
          }}
          onSuggestLimitations={() => {
            setData((prev) => {
              const s = suggestLimitationsFromCover(prev);
              const mergedText = [prev.limitations_free_text?.trim(), s.freeText]
                .filter(Boolean)
                .join("\n\n")
                .trim();
              const ticked = LIMITATION_CHECKLIST_DEFS.filter((d) => s.checklist[d.id]).length;
              const count = ticked + (s.freeText.trim() ? 1 : 0);
              if (count > 0) {
                emitProductEvent("limitations_auto_generated", { count });
              }
              return {
                ...prev,
                limitations_free_text: mergedText,
                limitations_checklist: { ...prev.limitations_checklist, ...s.checklist },
              };
            });
          }}
          onSaveInspectorProfile={persistProfile}
        />
      ) : (
        <>
      <TerrainSmartEntryHero
        dvLoading={dvLoading}
        onDvFile={(f) => void onDvPhoto(f)}
        onManual={scrollToManualFields}
        showDvSuccessHint={!!data.ia_hints?.dv_photo_imported}
      />

      <section className="space-y-4" id="resume-entete-inspection">
        <SectionTitle>Entête — requérant & inspection</SectionTitle>
        <div className="grid gap-4 md:grid-cols-2">
          <div className="md:col-span-2">
            <label className={labelClass}>
              REQUÉRANT(S) <span className="text-red-600">*</span>
            </label>
            <input
              className={terrainAutoFieldClass(!!data.ia_hints?.dv_photo_imported)}
              value={data.requerants}
              onChange={(e) => update("requerants", e.target.value)}
              placeholder="ex. 9354-3650 Québec Inc."
            />
            {errors.requerants ? (
              <p className="mt-1 text-xs text-red-600">{errors.requerants}</p>
            ) : null}
          </div>
          <div>
            <label className={labelClass}>CONDITIONS MÉTÉO</label>
            <input
              className={inputClass}
              value={data.conditions_meteo}
              onChange={(e) => {
                update("conditions_meteo", e.target.value);
                setWeatherFilledByGps(false);
              }}
              placeholder="ex. 19°C, soleil"
            />
            {weatherFilledByGps ? <TerrainWeatherGpsBadge /> : null}
            <button
              type="button"
              className="mt-2 rounded-md bg-slate-900 px-3 py-1.5 text-xs font-medium text-white disabled:opacity-50"
              onClick={() => void fillWeather()}
              disabled={weatherLoading}
            >
              {weatherLoading ? "Météo…" : "Remplir via position + Open-Meteo"}
            </button>
          </div>
          <div>
            <label className={labelClass}>DATE ET HEURE (inspection)</label>
            <input
              className={inputClass}
              value={data.date_heure_affichage}
              onChange={(e) => {
                update("date_heure_affichage", e.target.value);
                update("date_heure_iso", null);
              }}
            />
            <div className="mt-2 flex flex-wrap gap-2">
              <button
                type="button"
                className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-800"
                onClick={fillNow}
              >
                Maintenant (navigateur)
              </button>
            </div>
          </div>
          <div>
            <label className={labelClass}>DURÉE DE L&apos;INSPECTION</label>
            <input
              className={inputClass}
              value={data.duree_inspection}
              onChange={(e) => update("duree_inspection", e.target.value)}
              placeholder="ex. 3 heures"
            />
          </div>
        </div>
      </section>

      <section className="space-y-4">
        <SectionTitle>Inspecteur & intervenants</SectionTitle>
        <div className="grid gap-4 md:grid-cols-2">
          <div>
            <label className={labelClass}>INSPECTEUR (nom)</label>
            <input
              className={inputClass}
              value={data.inspecteur_nom}
              onChange={(e) => update("inspecteur_nom", e.target.value)}
            />
          </div>
          <div>
            <label className={labelClass}>No d&apos;inspecteur / certification</label>
            <input
              className={inputClass}
              value={data.inspecteur_numero_certification}
              onChange={(e) => update("inspecteur_numero_certification", e.target.value)}
            />
          </div>
          <div className="md:col-span-2">
            <label className={labelClass}>Compagnie (page couverture)</label>
            <input
              className={inputClass}
              value={data.compagnie}
              onChange={(e) => update("compagnie", e.target.value)}
            />
          </div>
          <div className="md:col-span-2">
            <label className={labelClass}>Logo (profil inspecteur + rapport)</label>
            <input
              type="file"
              accept="image/*"
              className="mt-1 block w-full text-sm"
              onChange={(e) => onLogo(e.target.files?.[0] ?? null)}
            />
            {profile?.logo_data_url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={profile.logo_data_url}
                alt="Logo"
                className="mt-2 h-16 w-auto object-contain"
              />
            ) : null}
            <button
              type="button"
              className="mt-2 rounded-md border border-slate-300 px-3 py-1.5 text-xs"
              onClick={persistProfile}
            >
              Enregistrer le profil inspecteur (navigateur)
            </button>
          </div>
          <div className="md:col-span-2">
            <label className={labelClass}>INTERVENANTS SUR PLACE</label>
            <input
              className={inputClass}
              value={data.intervenants_sur_place}
              onChange={(e) => update("intervenants_sur_place", e.target.value)}
              placeholder="ex. vendeurs, requérant, locataires"
            />
          </div>
        </div>
      </section>

      <section className="space-y-4" id="terrain-propriete-fields">
        <SectionTitle>
          Propriété inspectée <span className="text-red-600">*</span>
        </SectionTitle>
        <p className="text-sm text-slate-600">
          Saisie libre possible. Le scan DV remplit les champs ci-dessous ; tout reste éditable.
        </p>
        {data.ia_hints?.dv_photo_imported ? (
          <div className="rounded-lg border border-sky-100 bg-sky-50/50 px-3 py-2 text-sm text-sky-900">
            <span className="font-medium">✨ Champs assistés par la DV</span> — fond bleu léger = prérempli,
            modifiable.
          </div>
        ) : null}
        <div className="flex flex-wrap items-center gap-2">
          <label
            className={`inline-flex cursor-pointer items-center gap-2 rounded-md border border-dashed border-slate-300 px-3 py-2 text-sm ${dvLoading ? "pointer-events-none opacity-60" : ""}`}
          >
            <input
              type="file"
              accept="image/jpeg,image/png,image/webp,image/gif"
              className="hidden"
              disabled={dvLoading}
              onChange={(e) => {
                const f = e.target.files?.[0] ?? null;
                e.target.value = "";
                void onDvPhoto(f);
              }}
            />
            <span>{dvLoading ? "Analyse de l’image…" : "Ré-importer DV / scan"}</span>
          </label>
        </div>
        <div
          className={`grid gap-4 md:grid-cols-2 ${
            data.ia_hints?.dv_photo_imported
              ? "rounded-lg border border-sky-100 bg-sky-50/40 p-3"
              : ""
          }`}
        >
          <div className="md:col-span-2">
            <label className={labelClass}>
              ADRESSE <span className="text-red-600">*</span>
            </label>
            <input
              className={terrainAutoFieldClass(!!data.ia_hints?.dv_photo_imported)}
              value={data.propriete.adresse}
              onChange={(e) => updatePropriete("adresse", e.target.value)}
              placeholder="ex. 182 Lamarche, Gatineau, Québec"
            />
            {errors.adresse ? (
              <p className="mt-1 text-xs text-red-600">{errors.adresse}</p>
            ) : null}
          </div>
          <div>
            <label className={labelClass}>TYPE DE PROPRIÉTÉ</label>
            <input
              className={terrainAutoFieldClass(!!data.ia_hints?.dv_photo_imported)}
              value={data.propriete.type_propriete}
              onChange={(e) => updatePropriete("type_propriete", e.target.value)}
              placeholder="ex. 8 plex"
            />
          </div>
          <div>
            <label className={labelClass}>ANNÉE DE CONSTRUCTION</label>
            <input
              className={terrainAutoFieldClass(!!data.ia_hints?.dv_photo_imported)}
              value={data.propriete.annee_construction}
              onChange={(e) => updatePropriete("annee_construction", e.target.value)}
              placeholder="ex. 1986"
            />
          </div>
          <div>
            <label className={labelClass}>Nom du client (optionnel)</label>
            <input
              className={terrainAutoFieldClass(!!data.ia_hints?.dv_photo_imported)}
              value={data.propriete.client_nom}
              onChange={(e) => updatePropriete("client_nom", e.target.value)}
            />
          </div>
          <div>
            <label className={labelClass}>Téléphone (optionnel)</label>
            <input
              className={terrainAutoFieldClass(!!data.ia_hints?.dv_photo_imported)}
              value={data.propriete.client_telephone}
              onChange={(e) => updatePropriete("client_telephone", e.target.value)}
              inputMode="tel"
            />
          </div>
          <div className="md:col-span-2">
            <label className={labelClass}>Courriel (optionnel)</label>
            <input
              className={terrainAutoFieldClass(!!data.ia_hints?.dv_photo_imported)}
              type="email"
              value={data.propriete.client_courriel}
              onChange={(e) => updatePropriete("client_courriel", e.target.value)}
            />
          </div>
        </div>
      </section>

      <section className="space-y-4">
        <SectionTitle>Description sommaire du bâtiment</SectionTitle>
        <TerrainDescriptionModePills
          modeManuel={data.description_sommaire.mode === "manuel"}
          onManuel={() => updateDescription("mode", "manuel")}
          onAutoIa={() => updateDescription("mode", "photos_ia")}
        />
        <p className="text-xs text-slate-500">
          AUTO (IA) : analyse de photos façades / toiture. MANUEL : saisie directe des champs.
        </p>
        {data.description_sommaire.mode === "photos_ia" ? (
          <div className="flex flex-wrap items-end gap-3">
            <div>
              <label
                htmlFor="cover-description-files"
                className="inline-flex cursor-pointer rounded-md border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-800 shadow-sm hover:bg-slate-50"
              >
                Choisir des photos…
              </label>
              <p className="mt-1 text-xs text-slate-500">
                Façades, toiture, fondations visibles, etc. Puis lance l’analyse — tu peux corriger chaque champ
                après coup.
              </p>
            </div>
            <button
              type="button"
              disabled={descriptionExtracting}
              className="rounded-md bg-slate-900 px-3 py-2 text-xs font-medium text-white disabled:opacity-50"
              onClick={() => void runDescriptionFromPhotos()}
            >
              {descriptionExtracting ? "Analyse…" : "Analyser les photos sélectionnées"}
            </button>
          </div>
        ) : null}
        <div className="grid gap-4 md:grid-cols-2">
          {(
            [
              ["type_maison", "Type de maison / bâtiment"],
              ["construit_en", "Construit en"],
              ["facade", "Façade en"],
              ["cotes", "Côtés de maison"],
              ["arriere", "Arrière de maison"],
              ["toiture", "Toiture en"],
              ["type_fondation", "Type de fondation"],
              ["type_structure", "Type de structure"],
              ["chauffage", "Chauffage du bâtiment"],
            ] as const
          ).map(([key, lab]) => (
            <div key={key} className={key === "chauffage" ? "md:col-span-2" : ""}>
              <label className={labelClass}>{lab}</label>
              <input
                className={inputClass}
                value={data.description_sommaire[key]}
                onChange={(e) => updateDescription(key, e.target.value)}
              />
            </div>
          ))}
        </div>
      </section>

      <section className="space-y-4">
        <SectionTitle>Condition générale du bâtiment</SectionTitle>
        <textarea
          className={`${inputClass} min-h-28 font-sans`}
          value={data.condition_generale}
          onChange={(e) => update("condition_generale", e.target.value)}
          placeholder="Texte type : le bâtiment est généralement en bonne condition…"
        />
        <div className="flex flex-wrap gap-2">
          {linkedToReport ? (
            <button
              type="button"
              disabled={conditionSynthesizing}
              className="rounded-md bg-slate-900 px-3 py-1.5 text-xs font-medium text-white disabled:opacity-50"
              onClick={() => void runConditionFromReportPhotos()}
            >
              {conditionSynthesizing
                ? "Synthèse depuis les photos du rapport…"
                : "Synthétiser depuis les photos du rapport"}
            </button>
          ) : null}
          <button
            type="button"
            className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium"
            onClick={() => void runCoverAssistant("Synthèse condition générale depuis lot de photos")}
          >
            Suggestions rédigées (assistant texte)
          </button>
        </div>
        {linkedToReport ? (
          <p className="text-xs text-slate-500">
            La synthèse utilise les photos déjà liées à l’inspection de ce rapport (analyses existantes ou
            lecture des fichiers). Ajoute des photos depuis la page rapport si le résultat est vide.
          </p>
        ) : (
          <p className="text-xs text-slate-500">
            Lie ce formulaire à un rapport pour générer la condition générale à partir du lot de photos
            d’inspection.
          </p>
        )}
      </section>

      <section className="space-y-4">
        <SectionTitle>Orientation de la façade</SectionTitle>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            disabled={compassSampling}
            onClick={() => void tryCompassFacade()}
            className="rounded-md bg-blue-700 px-3 py-1.5 text-xs font-semibold text-white hover:bg-blue-800 disabled:opacity-50"
          >
            {compassSampling ? "Cap…" : "Estimer avec la boussole (appareil)"}
          </button>
        </div>
        <div className="flex flex-wrap gap-4 text-sm">
          {(["nord", "sud", "est", "ouest"] as const).map((dir) => (
            <label key={dir} className="inline-flex items-center gap-2 capitalize">
              <input
                type="radio"
                name="orientation"
                checked={data.orientation_facade === dir}
                onChange={() => update("orientation_facade", dir)}
              />
              {dir}
            </label>
          ))}
          <label className="inline-flex items-center gap-2">
            <input
              type="radio"
              name="orientation"
              checked={data.orientation_facade === ""}
              onChange={() => update("orientation_facade", "")}
            />
            Non déterminé
          </label>
        </div>
        <button
          type="button"
          className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium"
          onClick={() => void runCoverAssistant("Orientation façade (vision / plan)")}
        >
          Conseils pour l’orientation (pas de vision auto)
        </button>
      </section>

      <section className="space-y-4" id="resume-conformite">
        <SectionTitle>Conformité & juridiction</SectionTitle>
        <div className="grid gap-4 md:grid-cols-2">
          <div>
            <label className={labelClass}>Province / profil</label>
            <select
              className={inputClass}
              value={data.conformite_juridiction}
              onChange={(e) => {
                const v = e.target.value as ComplianceJurisdiction;
                if (!COMPLIANCE_JURISDICTIONS.includes(v)) return;
                const defs = defaultComplianceNote(v);
                setData((prev) => ({
                  ...prev,
                  conformite_juridiction: v,
                  notes_conformite: defs,
                  compliance_block_v1: buildComplianceBlockV1(v, defs),
                  compliance_profile_v1: {
                    schema_version: 1,
                    mode: v === "ca_qc" ? "QC_2027" : "CA_STANDARD",
                    clauses_pack_version: "QC_2027_v1",
                  },
                }));
              }}
            >
              {COMPLIANCE_JURISDICTIONS.map((code) => (
                <option key={code} value={code}>
                  {COMPLIANCE_LABELS[code]}
                </option>
              ))}
            </select>
          </div>
        </div>
        <textarea
          className={`${inputClass} min-h-24 font-sans`}
          value={data.notes_conformite}
          onChange={(e) => {
            const t = e.target.value;
            setData((prev) => {
              const defs = defaultComplianceNote(prev.conformite_juridiction);
              const block =
                prev.compliance_block_v1 ??
                buildComplianceBlockV1(prev.conformite_juridiction, defs);
              return {
                ...prev,
                notes_conformite: t,
                compliance_block_v1: {
                  ...block,
                  user_note: t,
                  is_user_modified: t.trim() !== block.default_note.trim(),
                },
              };
            });
          }}
        />
        <p className="text-xs text-slate-500">{complianceNote}</p>
        <p className="text-xs text-slate-500">
          Modèle conformité v{COMPLIANCE_TEMPLATE_VERSION}
          {data.compliance_block_v1?.is_user_modified
            ? " — texte adapté par rapport au modèle (traçable dans le payload)."
            : " — texte identique au modèle pour cette province."}
        </p>
      </section>

      <section className="space-y-4 rounded-xl border border-slate-200 bg-slate-50 p-4">
        <SectionTitle>Notes terrain</SectionTitle>
        {linkedToReport ? (
          <>
            <p className="text-sm text-slate-600">
              Texte libre, photo de feuille manuscrite (OCR) ou mémo vocal — les notes structurées sont ajoutées
              au payload du rapport via le service <code className="text-xs">process-notes</code>.
            </p>
            <textarea
              className={`${inputClass} min-h-20 font-sans`}
              value={terrainNoteText}
              onChange={(e) => setTerrainNoteText(e.target.value)}
              placeholder="Notes tapées, ou laisse vide et envoie seulement une photo / audio."
            />
            <div className="flex flex-wrap gap-4 text-sm">
              <div>
                <label className={labelClass} htmlFor="cover-notes-photo">
                  Photo de notes manuscrites
                </label>
                <label
                  htmlFor="cover-notes-photo"
                  className="mt-1 inline-flex cursor-pointer rounded-md border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-800 hover:bg-slate-50"
                >
                  Choisir une image…
                </label>
              </div>
              <div>
                <label className={labelClass} htmlFor="cover-notes-audio">
                  Mémo vocal
                </label>
                <label
                  htmlFor="cover-notes-audio"
                  className="mt-1 inline-flex cursor-pointer rounded-md border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-800 hover:bg-slate-50"
                >
                  Choisir un fichier audio…
                </label>
              </div>
            </div>
            <button
              type="button"
              disabled={notesSubmitting}
              className="rounded-md bg-emerald-800 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
              onClick={() => void submitTerrainNotes()}
            >
              {notesSubmitting ? "Envoi…" : "Envoyer au rapport"}
            </button>
          </>
        ) : (
          <p className="text-sm text-slate-600">
            Ouvre ce formulaire depuis un rapport (lien avec jeton) pour envoyer des notes terrain vers le service
            d’analyse — elles seront stockées dans le rapport avec classification suggérée.
          </p>
        )}
      </section>

      {linkedToReport && reportId && viewerToken ? (
        <ReportVersionTimeline reportId={reportId} viewerToken={viewerToken} />
      ) : null}

        </>
      )}

      <div className="flex flex-wrap items-center gap-3">
        {linkedToReport ? (
          <button
            type="button"
            disabled={remoteSaving}
            className="rounded-lg bg-emerald-700 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-emerald-800 disabled:opacity-60"
            onClick={() => void saveToReport()}
          >
            {remoteSaving ? "Enregistrement…" : "Enregistrer sur le rapport"}
          </button>
        ) : null}
        {linkedToReport ? (
          <Link
            href={`/report/${encodeURIComponent(reportId!)}?token=${encodeURIComponent(viewerToken!)}`}
            className="rounded-lg border border-emerald-700 bg-white px-4 py-2 text-sm font-semibold text-emerald-900 shadow-sm hover:bg-emerald-50"
          >
            Ouvrir le rapport — constats et PDF
          </Link>
        ) : null}
        <button
          type="button"
          className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white"
          onClick={exportJson}
        >
          Exporter JSON (cover_v1)
        </button>
        <button
          type="button"
          className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-800"
          onClick={saveDraft}
        >
          Sauver brouillon local
        </button>
      </div>
      {!linkedToReport && draftSaveHint ? (
        <p className="text-xs text-slate-500" role="status">
          {draftSaveHint}
        </p>
      ) : null}

      <p className="border-t border-slate-200 pt-6 text-center text-xs leading-relaxed text-slate-500">
        InspectFlow — couverture de rapport et mentions de conformité : contrôlez toujours le PDF final et les
        obligations professionnelles avant remise au client. Traçabilité des mises à jour : enregistrez la
        couverture sur le rapport après modification.
      </p>
    </div>
  );
}
