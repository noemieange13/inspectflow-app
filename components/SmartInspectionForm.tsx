"use client";

import { useState, useCallback, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Camera, Upload, MapPin, Calendar, Clock, User, FileText, Mic, Sparkles, CheckCircle } from "lucide-react";

export default function SmartInspectionForm() {
  const router = useRouter();
  const [formData, setFormData] = useState({
    // Champs obligatoires
    requerants: "",
    propriete_adresse: "",
    
    // Champs client (optionnels)
    client_nom: "",
    client_telephone: "",
    client_courriel: "",
    
    // Champs inspection
    type_propriete: "residential",
    annee_construction: "",
    duree_inspection: "",
    
    // Champs automatiques
    date_heure: "",
    conditions_meteo: "",
    orientation_facade: "",
    
    // Description
    description_mode: "manuel" as "manuel" | "photos_ia",
    description_sommaire: "",
    condition_generale: "",
  });
  
  const [isProcessing, setIsProcessing] = useState(false);
  const [weatherLoading, setWeatherLoading] = useState(false);
  const [dvPhoto, setDvPhoto] = useState<File | null>(null);
  const [buildingPhotos, setBuildingPhotos] = useState<File[]>([]);
  const [isRecording, setIsRecording] = useState(false);

  // Auto-remplissage date/heure
  useEffect(() => {
    if (!formData.date_heure) {
      const now = new Date();
      setFormData(prev => ({
        ...prev,
        date_heure: now.toLocaleString('fr-CA', { 
          year: 'numeric', 
          month: '2-digit', 
          day: '2-digit', 
          hour: '2-digit', 
          minute: '2-digit' 
        })
      }));
    }
  }, []);

  // Auto-remplissage météo par géolocalisation
  const fetchWeather = useCallback(async () => {
    if (!formData.propriete_adresse) return;
    
    setWeatherLoading(true);
    try {
      // Simulation API météo (remplacer avec vraie API)
      await new Promise(resolve => setTimeout(resolve, 1000));
      setFormData(prev => ({
        ...prev,
        conditions_meteo: "Ensoleillé, 18°C, vent léger du sud-ouest"
      }));
    } catch (error) {
      console.error("Erreur météo:", error);
    } finally {
      setWeatherLoading(false);
    }
  }, [formData.propriete_adresse]);

  // Auto-détection orientation façade
  const detectOrientation = useCallback(async () => {
    if (buildingPhotos.length === 0) return;
    
    try {
      // Simulation IA orientation (remplacer avec vraie IA)
      await new Promise(resolve => setTimeout(resolve, 1500));
      setFormData(prev => ({
        ...prev,
        orientation_facade: "sud"
      }));
    } catch (error) {
      console.error("Erreur orientation:", error);
    }
  }, [buildingPhotos]);

  // Extraction DV photo/PDF
  const extractFromDV = useCallback(async () => {
    if (!dvPhoto) return;
    
    setIsProcessing(true);
    try {
      // Simulation OCR DV (remplacer avec vraie API)
      await new Promise(resolve => setTimeout(resolve, 2000));
      setFormData(prev => ({
        ...prev,
        requerants: "Jean Dupont et Marie Tremblay",
        client_nom: "Jean Dupont",
        client_telephone: "514-123-4567",
        client_courriel: "jean.dupont@email.com",
        propriete_adresse: "123 Rue Principale, Montréal, QC H3A 1A1",
        type_propriete: "residential",
        annee_construction: "1985"
      }));
    } catch (error) {
      console.error("Erreur extraction DV:", error);
    } finally {
      setIsProcessing(false);
    }
  }, [dvPhoto]);

  // Description IA depuis photos
  const generateDescription = useCallback(async () => {
    if (buildingPhotos.length === 0) return;
    
    setIsProcessing(true);
    try {
      // Simulation IA description (remplacer avec vraie IA)
      await new Promise(resolve => setTimeout(resolve, 2500));
      setFormData(prev => ({
        ...prev,
        description_sommaire: "Maison unifamiliale de 2 étages avec sous-sol aménagé. Façade en brique, toiture en bardeau d'asphalte. Fondation en béton. Système de chauffage électrique central. Terrain bien entretenu avec entrée de garage.",
        condition_generale: "Bâtiment en bon état général. Quelques signes d'usure normale pour l'âge. Toiture semble en fin de vie utile (15-20 ans). Fondation sans fissure visible. Système électrique fonctionnel."
      }));
    } catch (error) {
      console.error("Erreur description IA:", error);
    } finally {
      setIsProcessing(false);
    }
  }, [buildingPhotos]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!formData.requerants || !formData.propriete_adresse) {
      alert("Les champs 'Requérants' et 'Adresse de la propriété' sont obligatoires");
      return;
    }

    setIsProcessing(true);
    try {
      const response = await fetch("/api/create-inspection", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(formData),
      });
      
      if (response.ok) {
        const { reportId, access_token } = await response.json();
        const token = typeof access_token === "string" ? access_token.trim() : "";
        router.push(
          `/inspection/${encodeURIComponent(reportId)}/mobile${token ? `?token=${encodeURIComponent(token)}` : ""}`,
        );
      }
    } catch (error) {
      console.error("Erreur création inspection:", error);
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div className="max-w-4xl mx-auto bg-white rounded-xl shadow-lg p-8">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900 mb-2">🏠 Inspection Intelligente</h1>
        <p className="text-gray-600">Formulaire avec IA et reconnaissance automatique</p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-8">
        {/* Section 1: Information de base */}
        <div className="border rounded-xl p-6">
          <div className="flex items-center gap-2 mb-4">
            <User className="w-5 h-5 text-blue-600" />
            <h2 className="text-xl font-semibold">Information de base</h2>
          </div>

          {/* DV Upload */}
          <div className="mb-6 p-4 border-2 border-dashed border-gray-300 rounded-lg">
            <div className="text-center">
              <Upload className="w-12 h-12 text-gray-400 mx-auto mb-2" />
              <p className="text-sm text-gray-600 mb-2">
                Déclaration du vendeur (photo ou PDF)
              </p>
              <input
                type="file"
                accept="image/*,.pdf"
                onChange={(e) => setDvPhoto(e.target.files?.[0] || null)}
                className="hidden"
                id="dv-upload"
              />
              <label
                htmlFor="dv-upload"
                className="inline-flex items-center px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 cursor-pointer"
              >
                {dvPhoto ? "✅ " : ""}Choisir fichier
              </label>
              {dvPhoto && (
                <button
                  type="button"
                  onClick={extractFromDV}
                  disabled={isProcessing}
                  className="ml-2 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50"
                >
                  {isProcessing ? "⏳" : "🧠"} Extraire les infos
                </button>
              )}
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Requérants * <span className="text-red-500">(obligatoire)</span>
              </label>
              <input
                type="text"
                value={formData.requerants}
                onChange={(e) => setFormData(prev => ({ ...prev, requerants: e.target.value }))}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                placeholder="Ex: Jean Dupont et Marie Tremblay"
                required
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Adresse de la propriété * <span className="text-red-500">(obligatoire)</span>
              </label>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={formData.propriete_adresse}
                  onChange={(e) => setFormData(prev => ({ ...prev, propriete_adresse: e.target.value }))}
                  className="flex-1 px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                  placeholder="Ex: 123 Rue Principale, Montréal, QC"
                  required
                />
                <button
                  type="button"
                  onClick={fetchWeather}
                  disabled={weatherLoading || !formData.propriete_adresse}
                  className="px-3 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
                  title="Détecter la météo"
                >
                  {weatherLoading ? "⏳" : "🌤️"}
                </button>
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Nom du client
              </label>
              <input
                type="text"
                value={formData.client_nom}
                onChange={(e) => setFormData(prev => ({ ...prev, client_nom: e.target.value }))}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                placeholder="Ex: Jean Dupont"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Téléphone du client
              </label>
              <input
                type="tel"
                value={formData.client_telephone}
                onChange={(e) => setFormData(prev => ({ ...prev, client_telephone: e.target.value }))}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                placeholder="Ex: 514-123-4567"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Courriel du client
              </label>
              <input
                type="email"
                value={formData.client_courriel}
                onChange={(e) => setFormData(prev => ({ ...prev, client_courriel: e.target.value }))}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                placeholder="Ex: jean.dupont@email.com"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Type de propriété
              </label>
              <select
                value={formData.type_propriete}
                onChange={(e) => setFormData(prev => ({ ...prev, type_propriete: e.target.value }))}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
              >
                <option value="residential">Résidentiel</option>
                <option value="commercial">Commercial</option>
                <option value="multiplex">Multiplex</option>
                <option value="condo">Condominium</option>
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Année de construction
              </label>
              <input
                type="text"
                value={formData.annee_construction}
                onChange={(e) => setFormData(prev => ({ ...prev, annee_construction: e.target.value }))}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                placeholder="Ex: 1985"
              />
            </div>
          </div>
        </div>

        {/* Section 2: Conditions d'inspection */}
        <div className="border rounded-xl p-6">
          <div className="flex items-center gap-2 mb-4">
            <Calendar className="w-5 h-5 text-blue-600" />
            <h2 className="text-xl font-semibold">Conditions d'inspection</h2>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Date et heure de l'inspection
              </label>
              <input
                type="text"
                value={formData.date_heure}
                onChange={(e) => setFormData(prev => ({ ...prev, date_heure: e.target.value }))}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Conditions météo
              </label>
              <input
                type="text"
                value={formData.conditions_meteo}
                onChange={(e) => setFormData(prev => ({ ...prev, conditions_meteo: e.target.value }))}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                placeholder="Ex: Ensoleillé, 18°C"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Durée de l'inspection
              </label>
              <input
                type="text"
                value={formData.duree_inspection}
                onChange={(e) => setFormData(prev => ({ ...prev, duree_inspection: e.target.value }))}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                placeholder="Ex: 2h30"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Orientation de la façade
              </label>
              <select
                value={formData.orientation_facade}
                onChange={(e) => setFormData(prev => ({ ...prev, orientation_facade: e.target.value }))}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
              >
                <option value="">Sélectionner...</option>
                <option value="nord">Nord</option>
                <option value="sud">Sud</option>
                <option value="est">Est</option>
                <option value="ouest">Ouest</option>
              </select>
            </div>
          </div>
        </div>

        {/* Section 3: Photos du bâtiment */}
        <div className="border rounded-xl p-6">
          <div className="flex items-center gap-2 mb-4">
            <Camera className="w-5 h-5 text-blue-600" />
            <h2 className="text-xl font-semibold">Photos du bâtiment</h2>
          </div>

          <div className="mb-4 p-4 border-2 border-dashed border-gray-300 rounded-lg">
            <div className="text-center">
              <Camera className="w-12 h-12 text-gray-400 mx-auto mb-2" />
              <p className="text-sm text-gray-600 mb-2">
                Prenez des photos du bâtiment pour l'analyse IA
              </p>
              <input
                type="file"
                accept="image/*"
                multiple
                onChange={(e) => setBuildingPhotos(Array.from(e.target.files || []))}
                className="hidden"
                id="building-photos"
              />
              <label
                htmlFor="building-photos"
                className="inline-flex items-center px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 cursor-pointer"
              >
                {buildingPhotos.length > 0 ? `✅ ${buildingPhotos.length} photos` : "📷 Prendre des photos"}
              </label>
              {buildingPhotos.length > 0 && (
                <button
                  type="button"
                  onClick={() => {
                    generateDescription();
                    detectOrientation();
                  }}
                  disabled={isProcessing}
                  className="ml-2 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50"
                >
                  {isProcessing ? "⏳ Analyse..." : "🧠 Analyser les photos"}
                </button>
              )}
            </div>
          </div>

          {buildingPhotos.length > 0 && (
            <div className="grid grid-cols-4 gap-2">
              {buildingPhotos.map((photo, index) => (
                <div key={index} className="aspect-square bg-gray-100 rounded-lg flex items-center justify-center">
                  <Camera className="w-8 h-8 text-gray-400" />
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Section 4: Description du bâtiment */}
        <div className="border rounded-xl p-6">
          <div className="flex items-center gap-2 mb-4">
            <FileText className="w-5 h-5 text-blue-600" />
            <h2 className="text-xl font-semibold">Description du bâtiment</h2>
          </div>

          <div className="mb-4">
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Mode de description
            </label>
            <div className="flex gap-4">
              <label className="flex items-center">
                <input
                  type="radio"
                  value="manuel"
                  checked={formData.description_mode === "manuel"}
                  onChange={(e) => setFormData(prev => ({ ...prev, description_mode: e.target.value as any }))}
                  className="mr-2"
                />
                <span>Rédaction manuelle</span>
              </label>
              <label className="flex items-center">
                <input
                  type="radio"
                  value="photos_ia"
                  checked={formData.description_mode === "photos_ia"}
                  onChange={(e) => setFormData(prev => ({ ...prev, description_mode: e.target.value as any }))}
                  className="mr-2"
                />
                <span>Généré par IA (photos)</span>
              </label>
            </div>
          </div>

          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Description sommaire
              </label>
              <textarea
                value={formData.description_sommaire}
                onChange={(e) => setFormData(prev => ({ ...prev, description_sommaire: e.target.value }))}
                rows={4}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                placeholder="Décrivez le bâtiment (type, matériaux, caractéristiques principales)..."
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Condition générale du bâtiment
              </label>
              <textarea
                value={formData.condition_generale}
                onChange={(e) => setFormData(prev => ({ ...prev, condition_generale: e.target.value }))}
                rows={4}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                placeholder="État général du bâtiment, problèmes observés, recommandations..."
              />
            </div>
          </div>
        </div>

        {/* Bouton de soumission */}
        <div className="flex justify-center">
          <button
            type="submit"
            disabled={isProcessing || !formData.requerants || !formData.propriete_adresse}
            className="px-8 py-3 bg-green-600 text-white font-semibold rounded-lg hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
          >
            {isProcessing ? (
              <>
                <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                Traitement en cours...
              </>
            ) : (
              <>
                <CheckCircle className="w-5 h-5" />
                Créer l'inspection intelligente
              </>
            )}
          </button>
        </div>
      </form>
    </div>
  );
}
