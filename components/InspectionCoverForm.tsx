"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import {
  defaultComplianceNote,
  defaultCoverPayloadV1,
  formatFrDateTime,
  loadInspectorProfile,
  saveInspectorProfile,
  type FacadeOrientation,
  type InspectionCoverPayloadV1,
  type InspectorProfileV1,
} from "@/lib/inspectionCoverPayload";
import { fetchWeatherOpenMeteo, geolocationPosition } from "@/lib/weatherOpenMeteo";

const DRAFT_KEY = "inspectflow:cover_form_draft_v1";

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

export default function InspectionCoverForm() {
  const [data, setData] = useState<InspectionCoverPayloadV1>(defaultCoverPayloadV1);
  const [profile, setProfile] = useState<InspectorProfileV1 | null>(null);
  const [iaMessage, setIaMessage] = useState<string | null>(null);
  const [weatherLoading, setWeatherLoading] = useState(false);
  const [errors, setErrors] = useState<{ requerants?: string; adresse?: string }>({});

  useEffect(() => {
    const p = loadInspectorProfile();
    setProfile(p);
    if (p) {
      setData((d) => ({
        ...d,
        inspecteur_nom: p.nom,
        inspecteur_numero_certification: p.numero_certification,
        compagnie: p.compagnie,
      }));
    }
    try {
      const raw = localStorage.getItem(DRAFT_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as InspectionCoverPayloadV1;
        if (parsed?.schema_version === 1) {
          setData({ ...defaultCoverPayloadV1(), ...parsed });
        }
      }
    } catch {
      /* ignore */
    }
  }, []);

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
    saveInspectorProfile(p);
    setProfile(p);
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
      setIaMessage("Logo enregistré localement (aperçu page couverture — export PDF à brancher).");
    };
    reader.readAsDataURL(file);
  }, [data.inspecteur_nom, data.inspecteur_numero_certification, data.compagnie]);

  const stubIa = useCallback((label: string) => {
    setIaMessage(
      `${label} — intégration IA / OCR prévue : brancher une Edge Function (vision) + pipeline photos. Les champs restent éditables manuellement.`,
    );
  }, []);

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
    setIaMessage("Brouillon enregistré dans le navigateur.");
  }, [data]);

  const complianceNote = useMemo(
    () => defaultComplianceNote(data.conformite_juridiction),
    [data.conformite_juridiction],
  );

  return (
    <div className="space-y-10">
      <div className="rounded-lg border border-amber-200 bg-amber-50/80 px-4 py-3 text-sm text-amber-950">
        <p className="font-medium">Prototype formulaire couverture</p>
        <p className="mt-1 text-amber-900/90">
          Tous les champs visibles sur tes captures Word sont présents ci-dessous. Les fonctions « IA » sont
          câblées en bouton explicite : la prochaine étape est de les relier à des Edge Functions (vision / OCR /
          audio) sans retirer la saisie manuelle.
        </p>
      </div>

      {iaMessage ? (
        <div
          className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-800"
          role="status"
        >
          {iaMessage}
        </div>
      ) : null}

      <section className="space-y-4">
        <SectionTitle>Entête — requérant & inspection</SectionTitle>
        <div className="grid gap-4 md:grid-cols-2">
          <div className="md:col-span-2">
            <label className={labelClass}>
              REQUÉRANT(S) <span className="text-red-600">*</span>
            </label>
            <input
              className={inputClass}
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
              onChange={(e) => update("conditions_meteo", e.target.value)}
              placeholder="ex. 19°C, soleil"
            />
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
            <label className={labelClass}>Logo (aperçu local)</label>
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

      <section className="space-y-4">
        <SectionTitle>
          Propriété inspectée <span className="text-red-600">*</span>
        </SectionTitle>
        <p className="text-sm text-slate-600">
          Tu peux remplir manuellement ou importer une photo de déclaration du vendeur — l&apos;OCR sera branché
          côté serveur.
        </p>
        <div className="flex flex-wrap gap-2">
          <label className="inline-flex cursor-pointer items-center gap-2 rounded-md border border-dashed border-slate-300 px-3 py-2 text-sm">
            <input
              type="file"
              accept="image/*"
              className="hidden"
              onChange={() => stubIa("Analyse photo DV")}
            />
            <span>Importer photo DV (OCR — à brancher)</span>
          </label>
        </div>
        <div className="grid gap-4 md:grid-cols-2">
          <div className="md:col-span-2">
            <label className={labelClass}>
              ADRESSE <span className="text-red-600">*</span>
            </label>
            <input
              className={inputClass}
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
              className={inputClass}
              value={data.propriete.type_propriete}
              onChange={(e) => updatePropriete("type_propriete", e.target.value)}
              placeholder="ex. 8 plex"
            />
          </div>
          <div>
            <label className={labelClass}>ANNÉE DE CONSTRUCTION</label>
            <input
              className={inputClass}
              value={data.propriete.annee_construction}
              onChange={(e) => updatePropriete("annee_construction", e.target.value)}
              placeholder="ex. 1986"
            />
          </div>
          <div>
            <label className={labelClass}>Nom du client (optionnel)</label>
            <input
              className={inputClass}
              value={data.propriete.client_nom}
              onChange={(e) => updatePropriete("client_nom", e.target.value)}
            />
          </div>
          <div>
            <label className={labelClass}>Téléphone (optionnel)</label>
            <input
              className={inputClass}
              value={data.propriete.client_telephone}
              onChange={(e) => updatePropriete("client_telephone", e.target.value)}
              inputMode="tel"
            />
          </div>
          <div className="md:col-span-2">
            <label className={labelClass}>Courriel (optionnel)</label>
            <input
              className={inputClass}
              type="email"
              value={data.propriete.client_courriel}
              onChange={(e) => updatePropriete("client_courriel", e.target.value)}
            />
          </div>
        </div>
      </section>

      <section className="space-y-4">
        <SectionTitle>Description sommaire du bâtiment</SectionTitle>
        <div className="flex flex-wrap gap-3 text-sm">
          <label className="inline-flex items-center gap-2">
            <input
              type="radio"
              checked={data.description_sommaire.mode === "manuel"}
              onChange={() => updateDescription("mode", "manuel")}
            />
            Saisie libre
          </label>
          <label className="inline-flex items-center gap-2">
            <input
              type="radio"
              checked={data.description_sommaire.mode === "photos_ia"}
              onChange={() => updateDescription("mode", "photos_ia")}
            />
            Photos → IA (à brancher)
          </label>
        </div>
        {data.description_sommaire.mode === "photos_ia" ? (
          <div>
            <input
              type="file"
              accept="image/*"
              multiple
              className="text-sm"
              onChange={() => stubIa("Analyse photos description sommaire")}
            />
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
        <button
          type="button"
          className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium"
          onClick={() => stubIa("Synthèse condition générale depuis lot de photos")}
        >
          Générer depuis les photos (IA — à brancher)
        </button>
      </section>

      <section className="space-y-4">
        <SectionTitle>Orientation de la façade</SectionTitle>
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
          onClick={() => stubIa("Orientation façade (vision / plan)")}
        >
          Estimer automatiquement (IA — à brancher)
        </button>
      </section>

      <section className="space-y-4">
        <SectionTitle>Conformité & juridiction</SectionTitle>
        <div className="grid gap-4 md:grid-cols-2">
          <div>
            <label className={labelClass}>Province / profil</label>
            <select
              className={inputClass}
              value={data.conformite_juridiction}
              onChange={(e) => {
                const v = e.target.value === "ca_qc" ? "ca_qc" : "ca_general";
                update("conformite_juridiction", v);
                update("notes_conformite", defaultComplianceNote(v));
              }}
            >
              <option value="ca_qc">Québec (incl. rappel norme de pratique)</option>
              <option value="ca_general">Canada (général)</option>
            </select>
          </div>
        </div>
        <textarea
          className={`${inputClass} min-h-24 font-sans`}
          value={data.notes_conformite}
          onChange={(e) => update("notes_conformite", e.target.value)}
        />
        <p className="text-xs text-slate-500">{complianceNote}</p>
      </section>

      <section className="space-y-3 rounded-xl border border-slate-200 bg-slate-50 p-4">
        <SectionTitle>Notes terrain (pistes produit)</SectionTitle>
        <ul className="list-inside list-disc space-y-1 text-sm text-slate-700">
          <li>Manuscrit : photo → OCR (Edge `process-notes` déjà présent dans le dépôt).</li>
          <li>Vocal : Web Speech API ou upload audio → transcription.</li>
          <li>Photos : import en lot + sélection IA des meilleures par constat.</li>
        </ul>
      </section>

      <div className="flex flex-wrap gap-3">
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
    </div>
  );
}
