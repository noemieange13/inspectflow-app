"use client";

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { useParams } from "next/navigation";
import { ArrowLeft, Download, Edit2, CheckCircle, User, Camera, FileText, AlertCircle } from 'lucide-react';

console.log("🔧 DEBUG: Composant ReportPreviewPage chargé");

interface InspectionData {
  id: string;
  requerants: string;
  propriete_adresse: string;
  client_nom?: string;
  client_telephone?: string;
  client_courriel?: string;
  type_propriete: string;
  annee_construction?: string;
  date_heure: string;
  conditions_meteo?: string;
  duree_inspection?: string;
  description_sommaire?: string;
  condition_generale?: string;
  orientation_facade?: string;
  dv_photo?: string;
  building_photos?: string[];
  created_at: string;
  sections?: Array<{
    name: string;
    icon: string;
    constats: Array<{
      id: string;
      title: string;
      photos: Array<{
        name: string;
        photoNumber: number;
        sectionName: string;
        size: number;
        type: string;
        lastModified: number;
        quality: string;
        relevance: string;
        sectionType: string;
        defectType: string;
        url: string;
      }>;
      observation: string;
      recommendation: string;
      gravite: string;
      urgence: string;
      inspector_notes?: string; // Notes de l'inspecteur ajoutées
    }>;
  }>;
}

const mockInspectionData: InspectionData = {
  id: "INS-001",
  requerants: "Jean Dupont et Marie Tremblay",
  propriete_adresse: "123 Rue Principale, Montréal, QC H3A 1A1",
  client_nom: "Jean Dupont",
  client_telephone: "514-123-4567",
  client_courriel: "jean.dupont@email.com",
  type_propriete: "residential",
  annee_construction: "1985",
  date_heure: "23/04/2024, 10:30",
  conditions_meteo: "Ensoleillé, 18°C, vent léger du sud-ouest",
  duree_inspection: "2h30",
  description_sommaire: "Maison unifamiliale de 2 étages avec sous-sol aménagé. Façade en brique, toiture en bardeau d'asphalte. Fondation en béton. Système de chauffage électrique central. Terrain bien entretenu avec entrée de garage.",
  condition_generale: "Bâtiment en bon état général. Quelques signes d'usure normale pour l'âge. Toiture semble en fin de vie utile (15-20 ans). Fondation sans fissure visible. Système électrique fonctionnel.",
  orientation_facade: "sud",
  dv_photo: "declaration_vendeur.pdf",
  building_photos: ["facade_sud.jpg", "facade_nord.jpg", "interieur_salon.jpg", "cuisine.jpg", "sous_sol.jpg"],
  created_at: "2024-04-23T10:30:00Z",
};

export default function ReportPreviewPage() {
  console.log("🔧 DEBUG: Début du composant ReportPreviewPage");
  
  const params = useParams();
  console.log("🔧 DEBUG: useParams:", params);
  
  const [inspectionData, setInspectionData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [inspectorInfo, setInspectorInfo] = useState({
    nom: "",
    compagnie: "",
    adresse: "",
    telephone: "",
    courriel: "",
    numero_aibq: "",
    logo: ""
  });
  const [isEditing, setIsEditing] = useState<Record<string, boolean>>({});
  
  console.log("🔧 DEBUG: États initialisés");

  // Fonction pour mettre à jour un constat
  const updateConstat = (sectionName: string, constatId: string, field: 'observation' | 'recommendation', value: string) => {
    if (!inspectionData) return;
    
    const updatedData = { ...inspectionData };
    const section = updatedData.sections?.find((s: any) => s.name === sectionName);
    const constat = section?.constats.find((c: any) => c.id === constatId);
    
    if (constat) {
      (constat as any)[field] = value;
      setInspectionData(updatedData);
      
      // Sauvegarder dans localStorage
      localStorage.setItem(`inspection_${params.id}`, JSON.stringify(updatedData));
    }
  };

  // Basculer l'édition pour un champ spécifique
  const toggleEdit = (key: string) => {
    setIsEditing(prev => ({ ...prev, [key]: !prev[key] }));
  };

  // Charger les informations de l'inspecteur depuis localStorage
  useEffect(() => {
    const savedInspectorInfo = localStorage.getItem('inspectorInfo');
    if (savedInspectorInfo) {
      setInspectorInfo(JSON.parse(savedInspectorInfo));
    }
  }, []);

  // Sauvegarder les informations de l'inspecteur
  const updateInspectorInfo = (field: keyof typeof inspectorInfo, value: string) => {
    const updatedInfo = { ...inspectorInfo, [field]: value };
    setInspectorInfo(updatedInfo);
    localStorage.setItem('inspectorInfo', JSON.stringify(updatedInfo));
  };

  // Sauvegarder toutes les modifications du rapport
  const saveReport = () => {
    if (inspectionData) {
      localStorage.setItem(`inspection_${params.id}`, JSON.stringify(inspectionData));
      alert("✅ Rapport sauvegardé avec succès!");
    }
  };

  useEffect(() => {
    // Charger les données réelles depuis localStorage
    const storedData = localStorage.getItem(`inspection_${params.id}`);
    
    console.log("=== DEBUG RAPPORT ===");
    console.log("ID inspection:", params.id);
    console.log("Données brutes:", storedData);
    
    if (storedData) {
      try {
        const parsedData = JSON.parse(storedData);
        console.log("Données parsées:", parsedData);
        console.log("Photos:", parsedData.building_photos);
        console.log("Description:", parsedData.description_sommaire);
        console.log("Condition:", parsedData.condition_generale);
        console.log("Sections dans parsedData:", parsedData.sections?.length || 0);
        
        // Récupérer les sections depuis localStorage/sessionStorage si elles ne sont pas dans les données
        if (!parsedData.sections || parsedData.sections.length === 0) {
          console.log("🔄 Récupération des sections depuis localStorage séparément");
          let sectionsData = localStorage.getItem('inspectionSections');
          if (sectionsData) {
            parsedData.sections = JSON.parse(sectionsData);
            console.log("✅ Sections récupérées depuis localStorage:", parsedData.sections.length);
          } else {
            // Fallback: essayer sessionStorage
            console.log("🔄 Récupération des sections depuis sessionStorage");
            sectionsData = sessionStorage.getItem('inspectionSections');
            if (sectionsData) {
              parsedData.sections = JSON.parse(sectionsData);
              console.log("✅ Sections récupérées depuis sessionStorage:", parsedData.sections.length);
            } else {
              console.warn("⚠️ Aucune section trouvée dans localStorage ou sessionStorage");
            }
          }
        }
        
        // Restore photo url/base64 from window.inspectionSections (full data, never stripped).
        // We use a FLAT map keyed by photoNumber (globally unique counter) rather than the
        // fragile triple-key (sectionName→constatId→photoName), because:
        //   - photoNumber is set by a global counter so it's unique across all photos
        //   - sectionName/constatId/photoName can diverge if generateDescription ran twice
        //     (second run creates new constat IDs stored in window but old ones in localStorage)
        if (parsedData.sections) {
          type PhotoData = { url?: string; base64?: string };
          const byNumber: Record<number, PhotoData> = {};
          const byName: Record<string, PhotoData> = {};   // secondary: deduplicated by name

          const memSections: any[] | undefined =
            typeof window !== "undefined"
              ? (window as any).inspectionSections
              : undefined;

          if (Array.isArray(memSections)) {
            // Diagnostic: log keys to help debug future mismatches
            console.log("🔍 [preview] window.inspectionSections sections:",
              memSections.map((s: any) => ({
                name: s.name,
                constats: s.constats?.map((c: any) => ({
                  id: c.id,
                  photos: c.photos?.map((p: any) => ({ name: p.name, photoNumber: p.photoNumber, hasUrl: !!p.url }))
                }))
              }))
            );

            for (const sec of memSections) {
              for (const con of sec?.constats ?? []) {
                for (const p of con?.photos ?? []) {
                  const data: PhotoData = {
                    url: typeof p.url === "string" && p.url.length > 0 ? p.url : undefined,
                    base64: typeof p.base64 === "string" && p.base64.length > 0 ? p.base64 : undefined,
                  };
                  if (typeof p.photoNumber === "number") byNumber[p.photoNumber] = data;
                  // Also index by name (last writer wins — acceptable, names often unique)
                  if (typeof p.name === "string" && p.name) byName[p.name] = data;
                  if (typeof p.originalFileName === "string" && p.originalFileName) byName[p.originalFileName] = data;
                }
              }
            }
            console.log(`🔍 [preview] byNumber keys: ${Object.keys(byNumber).join(",")} | byName keys: ${Object.keys(byName).slice(0,10).join(",")}`);
          } else {
            console.warn("⚠️ [preview] window.inspectionSections is not available — photos will show as placeholders");
          }

          let restored = 0;
          let placeholders = 0;
          parsedData.sections.forEach((section: any) => {
            // Diagnostic: log what's in localStorage sections
            console.log(`🔍 [preview] localStorage section "${section.name}": constats=${section.constats?.length}, photos=`,
              section.constats?.flatMap((c: any) => c.photos?.map((p: any) => ({ name: p.name, photoNumber: p.photoNumber, hasUrl: !!p.url })) ?? [])
            );
            section.constats?.forEach((constat: any) => {
              constat.photos?.forEach((photo: any) => {
                if (photo.url || photo.base64) return; // already has data
                // Try photoNumber first (most reliable)
                const byNum = typeof photo.photoNumber === "number" ? byNumber[photo.photoNumber] : undefined;
                // Try name fallback
                const byNm = byName[photo.name] ?? byName[photo.originalFileName];
                const match = byNum ?? byNm;
                if (match?.url || match?.base64) {
                  if (match.url) photo.url = match.url;
                  if (match.base64) photo.base64 = match.base64;
                  restored++;
                } else {
                  // No image data in memory — show named placeholder
                  photo.url = `data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNDAwIiBoZWlnaHQ9IjMwMCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48cmVjdCB3aWR0aD0iNDAwIiBoZWlnaHQ9IjMwMCIgZmlsbD0iI2Y3ZjdmNyIvPjx0ZXh0IHg9IjUwJSIgeT0iNTAlIiBmb250LWZhbWlseT0iQXJpYWwiIGZvbnQtc2l6ZT0iMTgiIGZpbGw9IiM2NjYiIHRleHQtYW5jaG9yPSJtaWRkbGUiIGRvbWluYW50LWJhc2VsaW5lPSJtaWRkbGUiPvCfk7Y8L3RleHQ+PC9zdmc+`;
                  placeholders++;
                }
              });
            });
          });
          console.log(`✅ [preview] Photos restaurées: ${restored} depuis mémoire, ${placeholders} placeholders`);
        }
        
        setInspectionData(parsedData);
        setLoading(false);
      } catch (error) {
        console.error("Erreur parsing données:", error);
        // Do NOT fall back to mockInspectionData — it contains hardcoded weather/addresses
        // that mask real data problems. Show the "not found" state instead.
        setInspectionData(null);
        setLoading(false);
      }
    } else {
      console.log("Aucune donnée trouvée pour l'inspection:", params.id);
      // No mock fallback — show the explicit "not found" UI so the user knows data is missing.
      setInspectionData(null);
      setLoading(false);
    }
  }, [params.id]);

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-gray-600">Chargement du rapport...</p>
        </div>
      </div>
    );
  }

  if (!inspectionData) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <p className="text-red-600 text-lg font-semibold">Rapport introuvable</p>
          <Link href="/dashboard/simple" className="mt-4 text-blue-600 hover:text-blue-800 underline">
            Retour au tableau de bord
          </Link>
        </div>
      </div>
    );
  }

  // Debug logs pour diagnostiquer
  console.log("=== DEBUG AFFICHAGE RAPPORT ===");
  console.log("inspectionData existe:", !!inspectionData);
  console.log("inspectionData.sections:", inspectionData.sections);
  console.log("Nombre de sections:", inspectionData.sections?.length || 0);
  console.log("loading:", loading);

  const photoSrc = (photo: { url?: unknown; base64?: unknown; name?: string }) => {
    const b = photo?.base64;
    if (typeof b === "string" && b.length > 0 && b.startsWith("data:")) return b;
    const u = photo?.url;
    /** Ancien bug : Promise assignée à url → JSON donnait "url":{} */
    if (typeof u === "string" && (u.startsWith("data:") || u.startsWith("http")))
      return u;
    return null;
  };

  try {
    return (
      <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white shadow-sm border-b">
        <div className="max-w-6xl mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <Link
                href="/dashboard/simple"
                className="flex items-center gap-2 text-gray-600 hover:text-gray-900"
              >
                <ArrowLeft className="w-4 h-4" />
                Retour
              </Link>
              <div>
                <h1 className="text-xl font-bold text-gray-900">Rapport d'Inspection</h1>
                <p className="text-sm text-gray-600">ID: {inspectionData.id}</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <button 
                onClick={saveReport}
                className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700"
              >
                <CheckCircle className="w-4 h-4" />
                Enregistrer
              </button>
              <button className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700">
                <Download className="w-4 h-4" />
                Exporter PDF
              </button>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-6xl mx-auto px-4 py-8">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Colonne principale */}
          <div className="lg:col-span-2 space-y-8">
            {/* Synthèse — bien, client, météo, textes (données formulaire) */}
            <div className="bg-white rounded-xl shadow-sm p-6">
              <h2 className="text-xl font-semibold text-gray-900 mb-4 flex items-center gap-2">
                <FileText className="w-5 h-5 text-indigo-600" />
                Synthèse de l&apos;inspection
              </h2>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
                <div>
                  <h3 className="font-medium text-gray-500">Requérants</h3>
                  <p className="text-gray-900">
                    {inspectionData.requerants || "—"}
                  </p>
                </div>
                <div>
                  <h3 className="font-medium text-gray-500">Adresse du bien</h3>
                  <p className="text-gray-900">
                    {inspectionData.propriete_adresse || "—"}
                  </p>
                </div>
                <div>
                  <h3 className="font-medium text-gray-500">Date / heure</h3>
                  <p className="text-gray-900">
                    {inspectionData.date_heure || "—"}
                  </p>
                </div>
                <div>
                  <h3 className="font-medium text-gray-500">Météo / durée</h3>
                  <p className="text-gray-900">
                    {inspectionData.conditions_meteo || "—"}
                    {inspectionData.duree_inspection
                      ? ` · Durée: ${inspectionData.duree_inspection}`
                      : ""}
                  </p>
                </div>
                <div className="md:col-span-2">
                  <h3 className="font-medium text-gray-500">Description sommaire</h3>
                  <p className="text-gray-800 whitespace-pre-wrap">
                    {inspectionData.description_sommaire || "—"}
                  </p>
                </div>
                <div className="md:col-span-2">
                  <h3 className="font-medium text-gray-500">Condition générale</h3>
                  <p className="text-gray-800 whitespace-pre-wrap">
                    {inspectionData.condition_generale || "—"}
                  </p>
                </div>
                {inspectionData.orientation_facade ? (
                  <div>
                    <h3 className="font-medium text-gray-500">Orientation façade</h3>
                    <p className="text-gray-900">{inspectionData.orientation_facade}</p>
                  </div>
                ) : null}
                {Array.isArray(inspectionData.building_photos) &&
                inspectionData.building_photos.length > 0 ? (
                  <div className="md:col-span-2">
                    <h3 className="font-medium text-gray-500 mb-2">
                      Fichiers photos (lot inspection)
                    </h3>
                    <ul className="list-disc list-inside text-gray-700 max-h-32 overflow-y-auto text-xs">
                      {inspectionData.building_photos.map((n: string, i: number) => (
                        <li key={i}>{n}</li>
                      ))}
                    </ul>
                  </div>
                ) : null}
              </div>
            </div>

            {/* Constats, observations et images par section */}
            {Array.isArray(inspectionData.sections) && inspectionData.sections.length > 0 ? (
              <div className="bg-white rounded-xl shadow-sm p-6">
                <h2 className="text-xl font-semibold text-gray-900 mb-4 flex items-center gap-2">
                  <Camera className="w-5 h-5 text-amber-600" />
                  Constats par section ({inspectionData.sections.length})
                </h2>
                <div className="space-y-8">
                  {inspectionData.sections.map((section: any) => (
                    <div key={section.name} className="border border-gray-200 rounded-lg p-4">
                      <h3 className="text-lg font-semibold text-gray-900">
                        {section.icon ? `${section.icon} ` : ""}
                        {section.name}
                      </h3>
                      <div className="mt-4 space-y-6">
                        {section.constats?.map((constat: any) => (
                          <div
                            key={constat.id}
                            className="border-l-4 border-blue-500 pl-4 space-y-2"
                          >
                            <p className="font-medium text-gray-900">{constat.title}</p>
                            <p className="text-sm text-gray-700">
                              <span className="font-medium">Observation: </span>
                              {constat.observation}
                            </p>
                            <p className="text-sm text-gray-700">
                              <span className="font-medium">Recommandation: </span>
                              {constat.recommendation}
                            </p>
                            <p className="text-xs text-gray-500">
                              Gravité: {constat.gravite || "—"} · Urgence:{" "}
                              {constat.urgence || "—"}
                            </p>
                            {constat.inspector_notes ? (
                              <p className="text-sm text-amber-800 bg-amber-50 p-2 rounded">
                                {constat.inspector_notes}
                              </p>
                            ) : null}
                            <div className="flex flex-wrap gap-2 pt-2">
                              {constat.photos?.map((photo: any, pIdx: number) => {
                                const src = photoSrc(photo);
                                if (src) {
                                  return (
                                    <img
                                      key={pIdx}
                                      src={src}
                                      alt={photo.name || `Photo ${pIdx + 1}`}
                                      className="h-32 w-40 object-cover rounded border"
                                      loading="lazy"
                                      decoding="async"
                                    />
                                  );
                                }
                                const brokenPromise =
                                  photo?.url &&
                                  typeof photo.url === "object" &&
                                  !Array.isArray(photo.url);
                                return (
                                  <div
                                    key={pIdx}
                                    className="h-32 w-40 flex flex-col items-center justify-center rounded border border-dashed text-xs text-gray-500 p-1 text-center gap-1"
                                  >
                                    <span>{photo?.name || `Photo ${pIdx + 1}`}</span>
                                    {brokenPromise ? (
                                      <span className="text-amber-700 text-[10px] leading-tight">
                                        Données enregistrées avant correctif. Regénère la
                                        description puis enregistre à nouveau.
                                      </span>
                                    ) : null}
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 text-sm text-amber-900">
                Aucune section de constat enregistrée pour ce rapport. Génère d&apos;abord la
                description avec le bouton prévu dans le formulaire d&apos;inspection, puis
                enregistre à nouveau.
              </div>
            )}

            {/* Informations de l'inspecteur */}
            <div className="bg-white rounded-xl shadow-sm p-6">
              <h2 className="text-xl font-semibold text-gray-900 mb-6 flex items-center gap-2">
                <User className="w-5 h-5 text-purple-600" />
                Informations de l'inspecteur
              </h2>
              
              <div className="space-y-6">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <h3 className="text-sm font-medium text-gray-700">Nom de l'inspecteur</h3>
                      <button
                        onClick={() => toggleEdit('inspector-nom')}
                        className="text-blue-600 hover:text-blue-800 text-sm"
                      >
                        {isEditing['inspector-nom'] ? 'Sauvegarder' : 'Modifier'}
                      </button>
                    </div>
                    {isEditing['inspector-nom'] ? (
                      <input
                        type="text"
                        value={inspectorInfo.nom}
                        onChange={(e) => updateInspectorInfo('nom', e.target.value)}
                        className="w-full p-2 border rounded"
                        onBlur={() => toggleEdit('inspector-nom')}
                      />
                    ) : (
                      <div className="text-left">
                        <p className="text-gray-700 font-medium">{inspectorInfo.nom || 'Inspecteur IA Certifié'}</p>
                        <p className="text-gray-600">{inspectorInfo.compagnie || 'InspectFlow'}</p>
                        <p className="text-gray-600">{inspectorInfo.adresse || 'Adresse'}</p>
                        <p className="text-gray-600">{inspectorInfo.telephone || '(514) 123-4567'}</p>
                        <p className="text-gray-600">{inspectorInfo.courriel || 'inspecteur@inspectflow.com'}</p>
                      </div>
                    )}
                  </div>
                      
                      {/* Signature */}
                      <div className="mt-6">
                        <div className="border-b-2 border-gray-400 pb-2 mb-2">
                          <p className="text-gray-400">_______________________________________</p>
                        </div>
                        <p className="text-gray-700 font-medium">{inspectorInfo.nom || 'Inspecteur IA Certifié'}</p>
                        <p className="text-gray-600">Inspecteur Professionnel</p>
                        <p className="text-blue-600">www.inspectflow.com</p>
                        <p className="text-gray-600 font-medium">MEMBRE {inspectorInfo.numero_aibq || 'QC-2024-INS-001'}</p>
                      </div>
                      
                      {/* Tampon AIBQ */}
                      <div className="mt-6 inline-block">
                        <div className="border-4 border-red-600 rounded-lg p-4 transform rotate-3">
                          <p className="text-red-600 font-bold text-lg">CERTIFIÉ AIBQ</p>
                          <p className="text-red-600 font-medium">{inspectorInfo.numero_aibq || 'QC-2024-INS-001'}</p>
                          <p className="text-red-600 text-sm">Inspecteur Bâtiment</p>
                          <p className="text-red-600 text-xs">Valide jusqu'au 31/12/2025</p>
                        </div>
                      </div>
                      
                      <p className="text-gray-700 mt-4">
                        Si vous désirez des informations complémentaires, n'hésitez pas à me contacter merci : {inspectorInfo.telephone || '(514) 123-4567'}
                      </p>
                  </div>
                  
                  <div className="mt-8 text-center border-t-2 border-b-2 border-gray-400 py-2">
                    <p className="text-gray-700 font-bold">RAPPORT D'INSPECTION PRÉ-ACHAT INSPECTFLOW</p>
                    <p className="text-gray-600 text-sm mt-1">_____________________________________________________________________________________________________________________</p>
                    <p className="text-gray-600 text-sm mt-1">Rapport exclusif à usage confidentiel pour: Dossier #: {inspectionData.id} Page 44</p>
                  </div>
                </div>
              </div>
              
              {/* Section Avis au lecteur - Format exact */}
              <div className="mt-8 border-t pt-8">
                <div className="text-center font-bold text-lg mb-6">AVIS AU LECTEUR</div>
                
                <div className="space-y-4 text-gray-700">
                  <p>
                    Cette inspection est faite selon des normes nationales reconnues et a pour but de détecter et de divulguer les défauts 
                    majeurs apparents tels que constatés au moment de l'inspection et qui pourraient influencer votre décision d'acheter 
                    (selon le cas). Même si des défauts mineurs peuvent être mentionnés, ce rapport ne les identifiera pas 
                    nécessairement tous. Il est donc important que vous sachiez ce que votre inspecteur professionnel peut faire pour 
                    vous et quelles sont ses limites du point de vue inspection et analyse. L'inspection couvre les endroits qui sont 
                    facilement accessibles dans le bâtiment et se limite à ce qui peut être observé visuellement. L'inspecteur ne doit pas 
                    déplacer de meubles, soulever des moquettes, enlever des panneaux ou démonter des morceaux ou pièces 
                    d'équipement.
                  </p>
                  
                  <p>
                    Le but d'une inspection est d'aider à évaluer la condition générale d'un bâtiment. Le rapport est basé sur 
                    l'observation de la condition visible et apparente du bâtiment et de ses composantes visitées au moment de 
                    l'inspection. Les résultats de cette inspection ne doivent pas être utilisés pour commenter les défauts cachés ou non 
                    apparents qui peuvent exister et aucune garantie n'est exprimée ou supposée. S'entend de défauts cachés ou non 
                    apparents tout défaut qu'un examen visuel non approfondi des principales composantes d'un immeuble sans 
                    déplacement de meubles, d'objets ou tout autre obstacle ne permet pas de détecter ou de soupçonner. À titre 
                    d'exemple, un défaut qui ne saurait être découvert qu'à la suite de l'exécution de tests de nature destructive, ou 
                    requérant l'exploration, le prélèvement ou le calcul des composantes de l'immeuble est un défaut non apparent.
                  </p>
                  
                  <p>
                    Également tout défaut découvert à la suite d'un dégât ultérieur à l'inspection ou suite au déplacement, à 
                    l'enlèvement de meubles, d'objets, de neige ou tout autre obstacle est aussi un défaut non apparent. Certains indices 
                    ne révèlent pas toujours l'étendue et la gravité des lacunes ou des déficiences non visibles.
                  </p>
                  
                  <p>
                    Tous les bâtiments auront des défauts qui ne sont pas identifiés dans le rapport d'inspection. Si un tel défaut survient 
                    et vous croyez que votre inspecteur ne vous a pas suffisamment prévenu ou renseigné, appelez-le. Un appel 
                    téléphonique peut vous aider à décider quelles mesures prendre pour corriger ce défaut et votre inspecteur pourra 
                    vous conseiller dans l'évaluation des corrections ou moyens proposés par les entrepreneurs.
                  </p>
                  
                  <p>
                    Le rapport d'inspection ne constitue pas une garantie ou une police d'assurance de quelque nature que ce soit. Le 
                    rapport d'inspection reflète une observation de certains items énumérés de la propriété à la date et l'heure de 
                    l'inspection et n'est pas une énumération exhaustive des réparations à faire. Le rapport d'inspection n'a pas pour 
                    objectif de fournir un guide à la renégociation du prix de la propriété et ne doit pas être interprété comme une 
                    opinion de la valeur marchande de celle-ci. Le propriétaire peut vouloir ou ne pas vouloir procéder aux correctifs des 
                    déficiences notées dans ce rapport. L'inspecteur n'a pas vérifié ni contre vérifié les informations données et 
                    indiquées, par toute personne, lors de l'inspection. L'inspecteur présume de la véracité de ces informations et ne met 
                    pas en doute leur authenticité.
                  </p>
                </div>
              </div>
            </div>
          </div>

          {/* Colonne latérale */}
          <div className="space-y-8">
            {/* Résumé des constats */}
            <div className="bg-white rounded-xl shadow-sm p-6">
              <h2 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
                <CheckCircle className="w-4 h-4 text-green-600" />
                Résumé des constats
              </h2>
              
              <div className="space-y-4">
                <div className="grid grid-cols-3 gap-4">
                  <div className="text-center p-3 bg-red-50 rounded-lg">
                    <div className="text-2xl font-bold text-red-600">
                      {inspectionData.sections?.flatMap((s: any) => s.constats).filter((c: any) => c.gravite === "Majeur").length || 0}
                    </div>
                    <div className="text-sm text-red-800">Constats majeurs</div>
                  </div>
                  <div className="text-center p-3 bg-yellow-50 rounded-lg">
                    <div className="text-2xl font-bold text-yellow-600">
                      {inspectionData.sections?.flatMap((s: any) => s.constats).filter((c: any) => c.gravite === "Modéré").length || 0}
                    </div>
                    <div className="text-sm text-yellow-800">Constats modérés</div>
                  </div>
                  <div className="text-center p-3 bg-green-50 rounded-lg">
                    <div className="text-2xl font-bold text-green-600">
                      {inspectionData.sections?.flatMap((s: any) => s.constats).filter((c: any) => c.gravite === "Mineur").length || 0}
                    </div>
                    <div className="text-sm text-green-800">Constats mineurs</div>
                  </div>
                </div>
                
                <div className="grid grid-cols-3 gap-4">
                  <div className="text-center p-3 bg-red-50 rounded-lg">
                    <div className="text-2xl font-bold text-red-600">
                      {inspectionData.sections?.flatMap((s: any) => s.constats).filter((c: any) => c.urgence === "Urgent").length || 0}
                    </div>
                    <div className="text-sm text-red-800">Interventions urgentes</div>
                  </div>
                  <div className="text-center p-3 bg-yellow-50 rounded-lg">
                    <div className="text-2xl font-bold text-yellow-600">
                      {inspectionData.sections?.flatMap((s: any) => s.constats).filter((c: any) => c.urgence === "À court terme").length || 0}
                    </div>
                    <div className="text-sm text-yellow-800">À court terme</div>
                  </div>
                  <div className="text-center p-3 bg-green-50 rounded-lg">
                    <div className="text-2xl font-bold text-green-600">
                      {inspectionData.sections?.flatMap((s: any) => s.constats).filter((c: any) => c.urgence === "Non urgent").length || 0}
                    </div>
                    <div className="text-sm text-green-800">Non urgent</div>
                  </div>
                </div>
              </div>
            </div>

            {/* Informations client */}
            <div className="bg-white rounded-xl shadow-sm p-6">
              <h2 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
                <User className="w-4 h-4 text-blue-600" />
                Client
              </h2>
              
              <div className="space-y-3">
                <div>
                  <h3 className="text-sm font-medium text-gray-700">Nom</h3>
                  <p className="text-gray-900">{inspectionData.client_nom}</p>
                </div>
                <div>
                  <h3 className="text-sm font-medium text-gray-700">Téléphone</h3>
                  <p className="text-gray-900">{inspectionData.client_telephone}</p>
                </div>
                <div>
                  <h3 className="text-sm font-medium text-gray-700">Courriel</h3>
                  <p className="text-gray-900">{inspectionData.client_courriel}</p>
                </div>
              </div>
            </div>

            {/* Conformité */}
            <div className="bg-white rounded-xl shadow-sm p-6">
              <h2 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
                <CheckCircle className="w-4 h-4 text-green-600" />
                Conformité
              </h2>
              
              <div className="space-y-3">
                <div className="flex items-center gap-2">
                  <CheckCircle className="w-4 h-4 text-green-600" />
                  <span className="text-sm text-gray-900">Normes QC 2027</span>
                </div>
                <div className="flex items-center gap-2">
                  <CheckCircle className="w-4 h-4 text-green-600" />
                  <span className="text-sm text-gray-900">Réglementation provinciale</span>
                </div>
                <div className="flex items-center gap-2">
                  <CheckCircle className="w-4 h-4 text-green-600" />
                  <span className="text-sm text-gray-900">Audit-ready</span>
                </div>
              </div>
            </div>

            {/* Actions */}
            <div className="bg-white rounded-xl shadow-sm p-6">
              <h2 className="text-lg font-semibold text-gray-900 mb-4">Actions</h2>
              
              <div className="space-y-3">
                <button className="w-full px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700">
                  Modifier l'inspection
                </button>
                <button className="w-full px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700">
                  Générer le PDF final
                </button>
                <button className="w-full px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700">
                  Partager le rapport
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  } catch (error) {
    console.error("❌ ERREUR DANS L'AFFICHAGE DU RAPPORT:", error);
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <p className="text-red-600 text-lg font-semibold">Erreur d'affichage du rapport</p>
          <p className="text-gray-600 mt-2">{error instanceof Error ? error.message : 'Erreur inconnue'}</p>
          <Link href="/dashboard/simple" className="mt-4 text-blue-600 hover:text-blue-800 underline">
            Retour au tableau de bord
          </Link>
        </div>
      </div>
    );
  }
}
