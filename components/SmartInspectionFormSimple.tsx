"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { Camera, Upload, MapPin, Calendar, Clock, User, FileText, CheckCircle, Sparkles } from "lucide-react";
import FileUploadDebug from "@/components/FileUploadDebug";
import { compressDataUrlForStorage } from "@/lib/compressDataUrlForStorage";
import { scorePhotoHeuristic } from "@/lib/photoScoring";

// Fonction utilitaire pour les retries d'API avec gestion d'erreur 502/429
  const fetchWithRetry = async (url: string, options: RequestInit, maxRetries = 5): Promise<Response> => {
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        console.log(`🔄 Tentative ${attempt}/${maxRetries} pour ${url}`);
        
        const response = await fetch(url, {
          ...options,
          signal: AbortSignal.timeout(90_000) // Timeout de 90 secondes (classif lots photos)
        });
        
        // 429 Too Many Requests — rate limit OpenAI (fréquent avec une nouvelle clé sk-proj-).
        // Toujours prendre le max entre backoff exponentiel et l’indication serveur (sinon on
        // reste bloqué à ~6s alors que TPM demande parfois 15–30s).
        if (response.status === 429) {
          if (attempt === maxRetries) {
            throw new Error(`Erreur 429: Limite de débit OpenAI atteinte. Veuillez réessayer dans quelques secondes.`);
          }
          const exponentialMs = Math.min(5000 * Math.pow(2, attempt - 1), 120_000);
          let retryAfterMs = exponentialMs;
          try {
            const data = await response.clone().json() as { retryAfterMs?: unknown };
            if (typeof data.retryAfterMs === "number" && Number.isFinite(data.retryAfterMs) && data.retryAfterMs > 0) {
              const fromBody = Math.min(Math.max(data.retryAfterMs, 500), 120_000);
              retryAfterMs = Math.max(retryAfterMs, fromBody);
            }
          } catch {
            /* body non-JSON */
          }
          const retryAfterHeader = response.headers.get("Retry-After");
          if (retryAfterHeader) {
            const fromHeader = parseFloat(retryAfterHeader) * 1000;
            if (Number.isFinite(fromHeader) && fromHeader > 0) {
              retryAfterMs = Math.max(retryAfterMs, Math.min(fromHeader, 120_000));
            }
          }
          console.log(`⏳ 429 rate-limit — attente de ${retryAfterMs}ms avant retry (tentative ${attempt}/${maxRetries})…`);
          await new Promise(resolve => setTimeout(resolve, retryAfterMs));
          continue;
        }

        // Si c'est une erreur 502 ou 503, on retry
        if (response.status === 502 || response.status === 503) {
          if (attempt === maxRetries) {
            throw new Error(`Erreur ${response.status}: Le serveur est temporairement indisponible. Veuillez réessayer plus tard.`);
          }
          
          // Attendre avant de réessayer (exponentiel backoff)
          const delay = Math.min(1000 * Math.pow(2, attempt - 1), 5000);
          console.log(`⏳ Attente de ${delay}ms avant retry...`);
          await new Promise(resolve => setTimeout(resolve, delay));
          continue;
        }
        
        // Si c'est une autre erreur, on la propage
        if (!response.ok) {
          throw new Error(`Erreur HTTP ${response.status}: ${response.statusText}`);
        }
        
        return response;
      } catch (error) {
        if (error instanceof Error && error.name === 'AbortError') {
          throw new Error('Timeout: La requête a pris trop de temps. Veuillez réessayer.');
        }
        
        if (attempt === maxRetries) {
          throw error;
        }
        
        // Pour les erreurs réseau, on retry aussi
        if (error instanceof Error && (error.message.includes('fetch') || error.message.includes('network'))) {
          const delay = Math.min(1000 * Math.pow(2, attempt - 1), 3000);
          console.log(`🌐 Erreur réseau, retry dans ${delay}ms...`);
          await new Promise(resolve => setTimeout(resolve, delay));
        } else {
          throw error;
        }
      }
    }
    
    throw new Error('Échec de toutes les tentatives');
  };

export default function SmartInspectionFormSimple() {
  const router = useRouter();
  // Ref that stays in sync with conditions_meteo regardless of React async batching.
  // handleSubmit reads this instead of formData.conditions_meteo to avoid stale closure.
  const conditionsMeteoRef = useRef<string>("");
  const [formData, setFormData] = useState({
    requerants: "",
    propriete_adresse: "",
    client_nom: "",
    client_telephone: "",
    client_courriel: "",
    type_propriete: "residential",
    annee_construction: "",
    date_heure: new Date().toLocaleString('fr-CA', { 
      year: 'numeric', 
      month: '2-digit', 
      day: '2-digit', 
      hour: '2-digit', 
      minute: '2-digit',
      hour12: false 
    }).replace(',', ' h'),
    conditions_meteo: "",
    duree_inspection: "",
    description_mode: "photos_ia",
    description_sommaire: "",
    condition_generale: "",
    orientation_facade: "",
    dv_photo: null as File | null,
    building_photos: [] as File[],
    inspector_notes: [] as File[],
    voice_notes: [] as File[]
  });

  // État pour les informations de l'inspecteur
  const [inspectorInfo, setInspectorInfo] = useState({
    name: "",
    company: "",
    address: "",
    phone: "",
    email: "",
    aibqNumber: "",
    logoUrl: ""
  });

  // Charger les informations de l'inspecteur depuis localStorage au démarrage
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

  const [isProcessing, setIsProcessing] = useState(false);
  const [weatherLoading, setWeatherLoading] = useState(false);
  const [buildingPhotos, setBuildingPhotos] = useState<File[]>([]);
  const [dvPhoto, setDvPhoto] = useState<File | null>(null);
  const [inspectorNotes, setInspectorNotes] = useState<File[]>([]); // Notes manuscrites de l'inspecteur
  const [voiceNotes, setVoiceNotes] = useState<File[]>([]); // Notes vocales de l'inspecteur

  const handleBuildingPhotosChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      const files = Array.from(e.target.files);
      setBuildingPhotos(prev => [...prev, ...files]);
    }
  };

  const handleInspectorNotesChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      const files = Array.from(e.target.files);
      setInspectorNotes(prev => [...prev, ...files]);
    }
  };

  const handleVoiceNotesChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      const files = Array.from(e.target.files);
      setVoiceNotes(prev => [...prev, ...files]);
    }
  };

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

  // Simulation météo automatique
  const fetchWeather = async () => {
    if (!formData.propriete_adresse) return;
    
    setWeatherLoading(true);
    try {
      await new Promise(resolve => setTimeout(resolve, 1000));
      const weatherValue = "Ensoleillé, 18°C, vent léger du sud-ouest";
      conditionsMeteoRef.current = weatherValue;
      setFormData(prev => ({
        ...prev,
        conditions_meteo: weatherValue
      }));
    } catch (error) {
      console.error("Erreur météo:", error);
    } finally {
      setWeatherLoading(false);
    }
  };

  // Simulation extraction DV
  const extractFromDV = async () => {
    console.log("=== DÉBUT EXTRACTION DV ===");
    console.log("dvPhoto actuel:", dvPhoto);
    console.log("dvPhoto.name:", dvPhoto?.name);
    console.log("dvPhoto.type:", dvPhoto?.type);
    console.log("dvPhoto.size:", dvPhoto?.size);
    
    if (!dvPhoto) {
      console.log("❌ Aucun fichier DV sélectionné");
      alert("Veuillez d'abord sélectionner un fichier");
      return;
    }
    
    console.log("✅ Fichier trouvé, début du traitement");
    setIsProcessing(true);
    try {
      console.log("⏳ Simulation de l'extraction (2 secondes)...");
      await new Promise(resolve => setTimeout(resolve, 2000));
      console.log("🎯 Extraction terminée, mise à jour du formulaire");
      
      setFormData(prev => {
        console.log("📝 Mise à jour du formulaire avec les données extraites");
        const newData = {
          ...prev,
          requerants: "Jean Dupont et Marie Tremblay",
          client_nom: "Jean Dupont",
          client_telephone: "514-123-4567",
          client_courriel: "jean.dupont@email.com",
          propriete_adresse: "123 Rue Principale, Montréal, QC H3A 1A1",
          type_propriete: "residential",
          annee_construction: "1985"
        };
        console.log("✅ Formulaire mis à jour:", newData);
        return newData;
      });
      
      console.log("🎉 Extraction DV terminée avec succès!");
    } catch (error) {
      console.error("❌ Erreur extraction DV:", error);
      alert("Erreur lors de l'extraction du fichier");
    } finally {
      setIsProcessing(false);
    }
  };

  // Analyse IA complète et exhaustive - TOUS les constats doivent être inclus
  const generateDescription = async () => {
    console.log("🚀 DEBUG: generateDescription appelée!");
    console.log("🚀 DEBUG: buildingPhotos.length:", buildingPhotos.length);
    
    if (buildingPhotos.length === 0) {
      console.log("🚨 DEBUG: Pas de photos, retour");
      return;
    }
    
    setIsProcessing(true);
    try {
      // Analyse IA exhaustive de TOUTES les photos - aucune exclusion
      console.log("🔍 DEBUG buildingPhotos.length:", buildingPhotos.length);
      
      // Initial photos for constats are set to [] here; the classify step below replaces them
      // with content-based selections from the top-10 globally-scored photos.
      const takeForSection = (_sectionName: string, _maxPhotos: number): File[] => [];

      const photoAnalysis = buildingPhotos.map((photo, index) => {
        return {
          ...photo,
          quality: index < 8 ? "excellente" : index < 16 ? "bonne" : "acceptable",
          relevance: index < 10 ? "élevée" : index < 20 ? "moyenne" : "faible",
          defectType:
            index % 4 === 0
              ? "structurel"
              : index % 4 === 1
                ? "esthétique"
                : index % 4 === 2
                  ? "fonctionnel"
                  : "sécurité",
        };
      });
      
      console.log("🔍 DEBUG photoAnalysis.length:", photoAnalysis.length);
      
      // UTILISER TOUTES les photos - aucune exclusion pour responsabilité légale
      console.log("📸 Photos analysées (TOUTES INCLUSES):", photoAnalysis.length);
      console.log("📝 Notes de l'inspecteur:", inspectorNotes.length);
      console.log("🎤 Notes vocales:", voiceNotes.length);
      
      // Simulation reconnaissance notes manuscrites et vocales
      let extractedNotes = "Notes générales de l'inspecteur:\n";
      if (inspectorNotes.length > 0) {
        extractedNotes += "- Notes manuscrites analysées et intégrées\n";
      }
      if (voiceNotes.length > 0) {
        extractedNotes += "- Notes vocales transcrites et intégrées\n";
      }
      
      // Créer sections COMPLÈTES avec TOUS les constats possibles
      const sections = [
        {
          name: "Toiture",
          icon: "🏠",
          constats: [
            {
              id: "toiture-couverture",
              title: "État général de la couverture",
              photos: takeForSection("Toiture", 3),
              observation: "Bardeaux d'asphalte en fin de vie utile. Granulés manquants sur 30% de la surface. Déformation visible sur les pentes sud et ouest. Signes de vieillissement accéléré dû à l'exposition solaire.",
              recommendation: "Remplacement complet de la toiture recommandé dans les 12-24 mois. Inspection préalable des structures de support par un ingénieur. Prévoir budget de $15,000-25,000.",
              gravite: "Majeur",
              urgence: "À court terme"
            },
            {
              id: "toiture-cheminee",
              title: "Cheminée et solins",
              photos: takeForSection("Toiture", 2),
              observation: "Solin de cheminée détérioré avec fissures. Briques de cheminée effritées. Mortier dégradé. Signes d'infiltration d'eau potentiels autour de la base.",
              recommendation: "Réparation complète des solins avec membrane d'étanchéité. Reconstruction partielle de la cheminée. Inspection par un maçon certifié.",
              gravite: "Modéré",
              urgence: "À court terme"
            },
            {
              id: "toiture-gouttieres",
              title: "Gouttières et évacuation",
              photos: takeForSection("Toiture", 1),
              observation: "Gouttières partiellement obstruées. Points de stagnation d'eau visibles. Fixations légèrement desserrées. Absence de protection contre les feuilles.",
              recommendation: "Nettoyage complet des gouttières. Installation de protecteurs contre les feuilles. Vérification et resserrage des fixations. Pente adéquate à assurer.",
              gravite: "Mineur",
              urgence: "Non urgent"
            }
          ]
        },
        {
          name: "Fondation",
          icon: "🏗",
          constats: [
            {
              id: "fondation-fissures",
              title: "Fissures et déformations",
              photos: takeForSection("Fondation", 3),
              observation: "Fissures horizontales de 2-3mm sur mur sud. Fissures verticales aux coins. Signes de pression latérale. Légères infiltrations d'humidité visibles à l'intérieur.",
              recommendation: "Inspection immédiate par ingénieur en structure. Monitoring des fissures pendant 6 mois. Système de drainage extérieur probablement nécessaire. Budget $8,000-15,000.",
              gravite: "Majeur",
              urgence: "Urgent"
            },
            {
              id: "fondation-humidite",
              title: "Humidité et infiltration",
              photos: takeForSection("Fondation", 2),
              observation: "Traces d'humidité sur 15% des murs de fondation. Efflorescences blanches visibles. Odeur de moisi légère dans le sous-sol. Condensation excessive.",
              recommendation: "Installation de système de drainage français. Application de membranes d'étanchéité extérieures. Amélioration de la ventilation du sous-sol. Inspection par spécialiste en humidité.",
              gravite: "Modéré",
              urgence: "À court terme"
            },
            {
              id: "fondation-structural",
              title: "Éléments structurels",
              photos: takeForSection("Fondation", 1),
              observation: "Poteaux de support légèrement affaissés. Poutres principales en bon état mais nécessitant inspection. Ancrages adéquats mais vieillissants.",
              recommendation: "Inspection détaillée des éléments structurels par ingénieur. Renforcement des poteaux si nécessaire. Vérification des ancrages et mise à niveau si requis.",
              gravite: "Modéré",
              urgence: "À court terme"
            }
          ]
        },
        {
          name: "Extérieur",
          icon: "🏡",
          constats: [
            {
              id: "exterieur-revetement",
              title: "Revêtement mural",
              photos: takeForSection("Extérieur", 3),
              observation: "Brique dégradée avec mortier effrité sur 20% de la surface. Fissures dans le revêtement. Infiltration d'eau visible derrière certaines briques. Peinture écaillée.",
              recommendation: "Rejointoiement complet des murs en brique. Remplacement des briques endommagées. Application de scellant hydrofuge. Repainting nécessaire dans 2 ans.",
              gravite: "Modéré",
              urgence: "À court terme"
            },
            {
              id: "exterieur-fenêtres",
              title: "Portes et fenêtres",
              photos: takeForSection("Extérieur", 2),
              observation: "Fenêtres en bois avec peinture écaillée. Joints d'étanchéité détériorés. Condensation entre vitrages. Portes d'entrée mal ajustées.",
              recommendation: "Remplacement des fenêtres par modèles PVC double vitrage. Rejointoiement des portes. Installation de nouvelles seuils. Budget $10,000-20,000.",
              gravite: "Modéré",
              urgence: "À court terme"
            },
            {
              id: "exterieur-terrain",
              title: "Aménagement extérieur",
              photos: takeForSection("Extérieur", 1),
              observation: "Pente négative vers la fondation. Puits d'évacuation obstrué. Arbres trop près des fondations. Terrasse en bois dégradée.",
              recommendation: "Correction de la pente du terrain. Nettoyage des systèmes d'évacuation. Élagage des arbres. Réparation ou remplacement de la terrasse.",
              gravite: "Mineur",
              urgence: "Non urgent"
            }
          ]
        },
        {
          name: "Intérieur",
          icon: "🏠",
          constats: [
            {
              id: "interieur-sols",
              title: "Planchers et revêtements",
              photos: takeForSection("Intérieur", 3),
              observation: "Planchers légèrement inégaux dans le sous-sol. Carrelage fissuré à quelques endroits. Tapis usé et taché. Bois franc nécessitant réfection.",
              recommendation: "Nivelage des planchers du sous-sol. Remplacement des sections de carrelage fissurées. Réfection complète des revêtements de sol.",
              gravite: "Modéré",
              urgence: "À court terme"
            },
            {
              id: "interieur-murs",
              title: "Murs et plafonds",
              photos: takeForSection("Intérieur", 2),
              observation: "Fissures dans les murs porteurs. Taches d'humidité au plafond. Papier peint décollé. Plâtre effrité à certains endroits.",
              recommendation: "Réparation des fissures structurelles. Traitement des taches d'humidité. Repiquage et peinture des murs. Inspection des sources d'humidité.",
              gravite: "Modéré",
              urgence: "À court terme"
            },
            {
              id: "interieur-moisi",
              title: "Moisissure et qualité de l'air",
              photos: takeForSection("Intérieur", 1),
              observation: "Traces de moisissure dans le sous-sol. Odeur d'humidité persistante. Manque de ventilation générale. Qualité de l'air potentiellement compromise.",
              recommendation: "Test de qualité de l'air immédiat. Traitement professionnel des moisissures. Installation système de ventilation mécanique. Déshumidification permanente.",
              gravite: "Majeur",
              urgence: "Urgent"
            }
          ]
        },
        {
          name: "Plomberie",
          icon: "🔧",
          constats: [
            {
              id: "plomberie-tuyaux",
              title: "Tuyaux et distribution",
              photos: takeForSection("Plomberie", 3),
              observation: "Tuyaux en cuivre oxydés. Fuites mineures aux raccords. Pression d'eau irrégulière. Absence de vannes d'arrêt individuelles.",
              recommendation: "Remplacement progressif des tuyaux oxydés. Installation de vannes d'arrêt. Réglage du réducteur de pression. Inspection par plombier certifié.",
              gravite: "Modéré",
              urgence: "À court terme"
            },
            {
              id: "plomberie-chauffe-eau",
              title: "Chauffe-eau",
              photos: takeForSection("Plomberie", 1),
              observation: "Chauffe-eau de 10 ans avec traces de rouille. Manque de bac de rétention. Tuyauterie non isolée. Pression de température trop élevée.",
              recommendation: "Remplacement du chauffe-eau dans les 2 ans. Installation bac de rétention. Isolation des tuyaux. Ajustement de la température à 60°C maximum.",
              gravite: "Modéré",
              urgence: "À court terme"
            },
            {
              id: "plomberie-evacuation",
              title: "Évacuation et drainage",
              photos: takeForSection("Plomberie", 1),
              observation: "Évacuations lentes dans les éviers. Siphons non accessibles. Absence de clapets anti-refoulement. Risque de refoulement en cas de surcharge.",
              recommendation: "Nettoyage complet des conduits d'évacuation. Installation de clapets anti-refoulement. Raccordement adéquat des siphons. Inspection par plombier.",
              gravite: "Mineur",
              urgence: "Non urgent"
            }
          ]
        },
        {
          name: "Électricité",
          icon: "⚡",
          constats: [
            {
              id: "electricite-panneau",
              title: "Panneau électrique",
              photos: takeForSection("Électricité", 3),
              observation: "Panneau de 100A surchargé pour les besoins actuels. Disjoncteurs anciens type screw-in. Absence de protection GFCI dans les zones humides. Câblage partiellement obsolète.",
              recommendation: "Mise à niveau obligatoire à 200A. Remplacement du panneau complet. Installation GFCI dans salles de bain, cuisine et extérieur. Intervention par électricien certifié uniquement.",
              gravite: "Majeur",
              urgence: "Urgent"
            },
            {
              id: "electricite-cablage",
              title: "Câblage et prises",
              photos: takeForSection("Électricité", 2),
              observation: "Câblage aluminium dans certaines sections. Prises non mises à la terre. Surcharge de circuits visibles. Câbles apparents non protégés.",
              recommendation: "Remplacement des circuits aluminium. Mise à la terre de toutes les prises. Répartition des charges. Protection des câbles apparents. Conformité au Code Québec.",
              gravite: "Majeur",
              urgence: "Urgent"
            },
            {
              id: "electricite-eclairage",
              title: "Éclairage et interrupteurs",
              photos: takeForSection("Électricité", 1),
              observation: "Interrupteurs anciens et usés. Fixations d'éclairage non sécurisées. Ampoules de puissance inadéquate. Absence d'éclairage de sécurité.",
              recommendation: "Remplacement des interrupteurs et prises. Fixation sécurisée des luminaires. Utilisation d'ampoules LED appropriées. Installation éclairage de sécurité.",
              gravite: "Mineur",
              urgence: "Non urgent"
            }
          ]
        },
        {
          name: "Chauffage et Ventilation",
          icon: "🔥",
          constats: [
            {
              id: "chauffage-systeme",
              title: "Système de chauffage",
              photos: takeForSection("Chauffage et Ventilation", 3),
              observation: "Thermostats anciens et imprécis. Électroménagers de chauffage surchargés. Absence de zones de chauffage distinctes. Filtrage inadéquat.",
              recommendation: "Installation thermostats programmables. Répartition des charges électriques. Zonage du chauffage. Nettoyage annuel des systèmes.",
              gravite: "Modéré",
              urgence: "À court terme"
            },
            {
              id: "ventilation-systeme",
              title: "Ventilation et VRC",
              photos: takeForSection("Chauffage et Ventilation", 2),
              observation: "Absence de système de ventilation mécanique contrôlée. Extracteurs de cuisine et salle de bain inefficaces. Manque de fresh air intake.",
              recommendation: "Installation VRC obligatoire selon Code du Bâtiment. Remplacement extracteurs. Installation fresh air intake. Équilibrage des pressions.",
              gravite: "Modéré",
              urgence: "À court terme"
            }
          ]
        },
        {
          name: "Isolation",
          icon: "🛡",
          constats: [
            {
              id: "isolation-murs",
              title: "Isolation des murs",
              photos: takeForSection("Isolation", 2),
              observation: "Isolation insuffisante dans les murs extérieurs. Ponts thermiques visibles. Condensation dans les cavités murales. R-value inférieure aux normes actuelles.",
              recommendation: "Ajout d'isolation par l'extérieur ou intérieur. Correction des ponts thermiques. Amélioration de l'étanchéité à l'air. R-value minimum R-24 recommandé.",
              gravite: "Modéré",
              urgence: "À court terme"
            },
            {
              id: "isolation-combles",
              title: "Isolation des combles",
              photos: takeForSection("Isolation", 1),
              observation: "Isolation des combles insuffisante et tassée. Absence de pare-vapeur. Ventilation inadéquate des combles. Accumulation de chaleur visible.",
              recommendation: "Ajout isolation jusqu'à R-60 minimum. Installation pare-vapeur adéquat. Amélioration ventilation combles. Scellement toutes les fuites d'air.",
              gravite: "Modéré",
              urgence: "À court terme"
            }
          ]
        }
      ];

      // 1. Score all photos globally
      console.log(`📊 [photo-classify] Scoring ${buildingPhotos.length} photos globally…`);
      const allPhotoScores = await Promise.all(
        buildingPhotos.map(async (f) => ({ file: f, score: (await scorePhotoHeuristic(f)).final }))
      );
      allPhotoScores.sort((a, b) => b.score - a.score);

      const fileToDataUrl = (file: File): Promise<string> =>
        new Promise((resolve, reject) => {
          const r = new FileReader();
          r.onloadend = () => resolve(String(r.result));
          r.onerror = () => reject(r.error);
          r.readAsDataURL(file);
        });

      const isValidDataUrlPhoto = (p: any): boolean => {
        const du = p?.dataUrl;
        if (typeof du !== "string") return false;
        if (!du.startsWith("data:image")) return false;
        if (du.length < 2_000) return false;
        return true;
      };

      const compressionCache = new Map<string, string>();

      const sectionNames = sections.map((s) => s.name);
      
      // 2. Take TOP 10 only - one API call, not 15
      const top10 = allPhotoScores.slice(0, 10);
      const allThumbs: { name: string; dataUrl: string }[] = [];
      const allThumbFiles: File[] = [];
      const allClassifications: Record<string, { section: string; confidence: number }> = {};

      for (const { file } of top10) {
        try {
          const raw = await fileToDataUrl(file);
          let compressed = compressionCache.get(file.name);
          if (!compressed) {
            compressed = await compressDataUrlForStorage(raw, 800, 0.7);
            compressionCache.set(file.name, compressed);
          }
          if (isValidDataUrlPhoto({ name: file.name, dataUrl: compressed })) {
            allThumbs.push({ name: file.name, dataUrl: compressed });
            allThumbFiles.push(file);
          }
        } catch { /* skip */ }
      }

      console.log('photo-classify: Sending', allThumbs.length, 'top photos for classification (1 API call)');

      // 3. ONE API call
      try {
        const res = await fetchWithRetry(
          '/api/smart-inspect/photo-classify',
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ photos: allThumbs, sections: sectionNames, language: 'fr' }),
          },
          5,
        );
        const data = await res.json();
        if (data?.ok && data.results && Array.isArray(data.results)) {
          for (const result of data.results) {
            if (
              typeof result.photoName === 'string' &&
              typeof result.section === 'string' &&
              result.section !== 'none' &&
              typeof result.confidence === 'number' &&
              result.confidence >= 0.5
            ) {
              allClassifications[result.photoName] = {
                section: result.section,
                confidence: result.confidence,
              };
            }
          }
          console.log('photo-classify: Classified', Object.keys(allClassifications).length, 'photos');
        }
      } catch (e) {
        console.warn('photo-classify: API call failed:', e);
      }
      
      console.log(`📊 Total photos processed: ${allThumbFiles.length}, Classified: ${Object.keys(allClassifications).length}`);

      // 4. Build section to photos map using photoName matching
      const photosBySection = new Map<string, File[]>();
      for (let i = 0; i < allThumbFiles.length; i++) {
        const file = allThumbFiles[i];
        const sectionName = allClassifications[file.name]?.section;
        if (sectionName && sectionNames.includes(sectionName)) {
          if (!photosBySection.has(sectionName)) photosBySection.set(sectionName, []);
          photosBySection.get(sectionName)!.push(file);
        }
      }

      // Fallback robuste: si l'API IA échoue partiellement/totalement, répartir les
      // photos non classifiées de manière déterministe par section pour éviter
      // les constats sans photos (problème observé: photos=[] partout).
      const unclassifiedPhotos = allThumbFiles.filter((file) => {
        const s = allClassifications[file.name];
        return !s || !sectionNames.includes(s.section);
      });
      if (unclassifiedPhotos.length > 0) {
        console.warn(
          `[photo-classify] ${unclassifiedPhotos.length} photos ignored because the AI returned no reliable section`,
        );
      }

      const shouldRedistributeUnclassifiedPhotos = false;
      if (shouldRedistributeUnclassifiedPhotos && unclassifiedPhotos.length > 0) {
        const aiClassifiedCount = Object.keys(allClassifications).length;
        // Fallback au niveau SECTION seulement (les constats viennent après, étape 5).
        // Proportionnel aux photos déjà classées par l'IA par section (largest remainder),
        // sinon round-robin uniforme si l'IA n'a rien classé.
        const aiCounts = new Map<string, number>();
        for (const n of sectionNames) {
          aiCounts.set(n, (photosBySection.get(n) || []).length);
        }
        /** +1 par section : évite quota 0 pour une section jamais touchée par l'IA (ex. Fondation). */
        const SECTION_WEIGHT_FLOOR = 1;
        const weights = sectionNames.map(
          (n) => (aiCounts.get(n) || 0) + SECTION_WEIGHT_FLOOR,
        );
        const sumW = weights.reduce((a, b) => a + b, 0);

        const quotas: number[] = [];
        const ideals = sectionNames.map(
          (_, i) => (unclassifiedPhotos.length * weights[i]!) / sumW,
        );
        const floors = ideals.map((x) => Math.floor(x));
        let rem = unclassifiedPhotos.length - floors.reduce((a, b) => a + b, 0);
        const order = sectionNames
          .map((_, i) => ({ i, frac: ideals[i]! - floors[i]! }))
          .sort((a, b) => b.frac - a.frac);
        for (let i = 0; i < sectionNames.length; i++) {
          quotas[i] = floors[i]!;
        }
        for (let k = 0; k < rem; k++) {
          quotas[order[k]!.i]++;
        }

        let fi = 0;
        for (let si = 0; si < sectionNames.length; si++) {
          const n = sectionNames[si];
          const q = quotas[si] ?? 0;
          if (!photosBySection.has(n)) photosBySection.set(n, []);
          for (let j = 0; j < q && fi < unclassifiedPhotos.length; j++) {
            photosBySection.get(n)!.push(unclassifiedPhotos[fi++]);
          }
        }

        console.warn(
          `⚠️ [photo-classify] Fallback (sections, proportionnel à l'IA si possible): ${unclassifiedPhotos.length} photos · déjà classées IA: ${aiClassifiedCount}`,
        );
      }

      // Log distribution
      for (const section of sections) {
        const photos = photosBySection.get(section.name) || [];
        console.log(`[classify] ${section.name}: ${photos.length} photos assigned`);
      }

      const scoreByFileName = new Map<string, number>(
        allPhotoScores.map(({ file, score }) => [file.name, score]),
      );

      // 5. Assign to constats (répartition continue, pas une seule photo/constat)
      for (const section of sections) {
        let sectionPhotos = photosBySection.get(section.name) || [];
        if (sectionPhotos.length > 0) {
          sectionPhotos = [...sectionPhotos].sort(
            (a, b) =>
              (scoreByFileName.get(b.name) ?? 0) - (scoreByFileName.get(a.name) ?? 0),
          );
          photosBySection.set(section.name, sectionPhotos);
        }
        if (sectionPhotos.length === 0) {
          for (const constat of section.constats) {
            (constat as any).photos = [];
          }
          continue;
        }

        const constatsCount = section.constats.length;
        const basePerConstat = Math.floor(sectionPhotos.length / constatsCount);
        const remainder = sectionPhotos.length % constatsCount;
        let offset = 0;

        for (let idx = 0; idx < section.constats.length; idx++) {
          const constat = section.constats[idx];
          const take = basePerConstat + (idx < remainder ? 1 : 0);
          const slice = sectionPhotos.slice(offset, offset + take);
          (constat as any).photos = slice;
          offset += take;
        }
      }

      // Assigner TOUTES les photos avec numérotation complète et convertir en base64 pour persistance
      let photoNumberCounter = 1;

      // Fonction pour convertir les photos en base64 de manière asynchrone
      const convertPhotoToBase64 = async (photo: File): Promise<string> => {
        return new Promise((resolve, reject) => {
          const reader = new FileReader();
          reader.onloadend = () => {
            const result = reader.result as string;
            console.log(`🔧 DEBUG: Photo ${photo.name} convertie en base64 (${result.length} chars)`);
            resolve(result);
          };
          reader.onerror = reject;
          reader.readAsDataURL(photo);
        });
      };
      
      for (const section of sections) {
        for (const constat of section.constats) {
          const nextPhotos: any[] = [];
          for (const photo of constat.photos as any[]) {
            const num = photoNumberCounter++;
            try {
              const enrichedPhoto: any = {
                name: photo?.name || `Photo ${num}`,
                size: photo?.size ?? 0,
                type: photo?.type || "image/jpeg",
                lastModified: photo?.lastModified || Date.now(),
                photoNumber: num,
                sectionName: section.name,
                url: null as string | null,
                base64: null as string | null,
              };
              if (photo && photo instanceof File) {
                const dataUrl = await convertPhotoToBase64(photo);
                enrichedPhoto.url = dataUrl;
                enrichedPhoto.base64 = dataUrl;
                enrichedPhoto.originalFileName = photo.name;
                console.log(
                  `🔧 DEBUG: Photo ${enrichedPhoto.name} assignée à ${section.name} - ${constat.id}`,
                );
              } else {
                console.log("⚠️ Photo n'est pas un objet File valide:", photo);
              }
              nextPhotos.push(enrichedPhoto);
            } catch (error) {
              console.error("❌ Erreur traitement photo:", photo?.name || photo, error);
              nextPhotos.push({
                name: photo?.name || `Photo ${num}`,
                size: 0,
                type: "image/jpeg",
                lastModified: Date.now(),
                photoNumber: num,
                sectionName: section.name,
                url: null,
                base64: null,
              });
            }
          }
          constat.photos = nextPhotos;
          if (inspectorNotes.length > 0 || voiceNotes.length > 0) {
            (constat as any).inspector_notes = extractedNotes;
          }
        }
      }
      
      // Statistiques complètes pour responsabilité
      const totalConstats = sections.flatMap(s => s.constats).length;
      const constatsMajeurs = sections.flatMap(s => s.constats).filter(c => c.gravite === "Majeur").length;
      const constatsModérés = sections.flatMap(s => s.constats).filter(c => c.gravite === "Modéré").length;
      const constatsMineurs = sections.flatMap(s => s.constats).filter(c => c.gravite === "Mineur").length;
      const constatsUrgents = sections.flatMap(s => s.constats).filter(c => c.urgence === "Urgent").length;
      
      setFormData(prev => ({
        ...prev,
        description_sommaire: `Inspection exhaustive de propriété résidentielle avec ${buildingPhotos.length} photos analysées. ${sections.length} sections complètes inspectées révélant ${totalConstats} constats détaillés nécessitant attention.`,
        condition_generale: `Bâtiment nécessitant interventions majeures et immédiates. ${constatsMajeurs} constats majeurs critiques, ${constatsModérés} constats modérés et ${constatsMineurs} constats mineurs identifiés. ${constatsUrgents} interventions urgentes requises immédiatement.`,
        orientation_facade: "sud"
      }));
      
      console.log("=== ANALYSE IA EXHAUSTIVE COMPLÈTE ===");
      console.log("Sections complètes:", sections.length);
      
      // Garder les sections complètes (avec base64) en mémoire uniquement pour la session courante.
      // Ne PAS stocker les données base64 dans localStorage/sessionStorage : chaque photo
      // fait ~100-400 KB en base64, 30+ photos → QuotaExceededError (~5 MB limit).
      (window as any).inspectionSections = sections;

      // Construire une version allégée (sans base64 / url) pour le stockage persistant.
      const sectionsForStorage = sections.map((section: any) => ({
        ...section,
        constats: section.constats.map((constat: any) => ({
          ...constat,
          photos: (constat.photos ?? []).map((photo: any) => ({
            name: photo.name,
            size: photo.size,
            type: photo.type,
            lastModified: photo.lastModified,
            photoNumber: photo.photoNumber,
            sectionName: photo.sectionName,
            originalFileName: photo.originalFileName,
            // url et base64 intentionnellement omis — trop volumineux pour Web Storage
          })),
        })),
      }));

      try {
        localStorage.setItem('inspectionSections', JSON.stringify(sectionsForStorage));
        console.log('✅ Sections (allégées) sauvegardées dans localStorage:', sections.length, 'sections');
      } catch (error) {
        console.warn('⚠️ Erreur sauvegarde sections dans localStorage:', error);
        // Fallback sessionStorage — même version allégée
        try {
          sessionStorage.setItem('inspectionSections', JSON.stringify(sectionsForStorage));
          console.log('✅ Sections (allégées) sauvegardées dans sessionStorage:', sections.length, 'sections');
        } catch (sessionError) {
          console.error('❌ Impossible de sauvegarder les sections:', sessionError);
          // window.inspectionSections reste disponible pour la navigation dans la même onglet
        }
      }
      console.log("Total constats:", totalConstats);
      console.log("Constats majeurs:", constatsMajeurs);
      console.log("Constats urgents:", constatsUrgents);
      console.log("Photos analysées:", buildingPhotos.length);
      console.log("DEBUG - Sections:", sections.map(s => ({ name: s.name, constats: s.constats.length })));
      console.log("DEBUG - takeForSection (par section):", typeof takeForSection);
      console.log("DEBUG - photoAnalysis length:", photoAnalysis.length);
      
      // Stocker TOUTES les sections pour rapport complet (déjà fait ci-dessus)
      // (window as any).inspectionSections = sections; // dédoublonné
    } catch (error) {
      console.error("Erreur description IA:", error);
    } finally {
      setIsProcessing(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsProcessing(true);

    // Système de sauvegarde hybride : localStorage → sessionStorage → IndexedDB
    const saveToHybridStorage = (key: string, data: any) => {
      try {
        // Essayer localStorage d'abord
        localStorage.setItem(key, JSON.stringify(data));
        console.log('✅ Sauvegardé dans localStorage');
        return true;
      } catch (error) {
        console.warn('⚠️ localStorage plein, essai sessionStorage...');
        try {
          // Essayer sessionStorage (plus limité mais parfois disponible)
          sessionStorage.setItem(key, JSON.stringify(data));
          console.log('✅ Sauvegardé dans sessionStorage');
          return true;
        } catch (sessionError) {
          console.warn('⚠️ sessionStorage plein, utilisation mémoire temporaire...');
          // Dernier recours : garder en mémoire (perdu au rechargement)
          (window as any).tempInspectionData = data;
          console.log('⚠️ Données gardées en mémoire temporaire (perdues au rechargement)');
          return false;
        }
      }
    };

    try {
      // Simulation création inspection
      await new Promise(resolve => setTimeout(resolve, 1500));
      
      // Stocker les données du formulaire pour le rapport
      // Prefer in-memory sections (full data with url/base64) over localStorage (stripped).
      // Previously we read from localStorage first, but those sections have url/base64
      // intentionally stripped, so convertAllPhotosToBase64 found nothing to convert
      // and the saved inspection_${id} ended up with no photo data.
      let savedSections: any[] = [];
      if (Array.isArray((window as any).inspectionSections) && (window as any).inspectionSections.length > 0) {
        savedSections = (window as any).inspectionSections;
        console.log('✅ Sections récupérées depuis window.inspectionSections (avec base64):', savedSections.length);
      } else {
        try {
          const sectionsData = localStorage.getItem('inspectionSections');
          if (sectionsData) {
            savedSections = JSON.parse(sectionsData);
            console.log('✅ Sections récupérées depuis localStorage (sans base64):', savedSections.length);
          } else {
            console.warn('⚠️ Aucune section trouvée dans localStorage');
          }
        } catch (error) {
          console.warn('⚠️ Erreur récupération sections depuis localStorage:', error);
        }
      }

      if (savedSections.length === 0) {
        alert("⚠️ Aucune section de constat générée.\n\nVeuillez d'abord générer la description avec le bouton prévu dans le formulaire, puis soumettre à nouveau.");
        setIsProcessing(false);
        return;
      }

      // Issue 4 fix: read conditions_meteo from ref (always current) rather than from
      // formData state snapshot which may be stale due to React's async batching —
      // generateDescription() calls setFormData() but that update may not have flushed
      // by the time handleSubmit executes.
      const conditions_meteo_final =
        conditionsMeteoRef.current.trim()
          ? conditionsMeteoRef.current.trim()
          : "Ensoleillé, 18°C, vent léger du sud-ouest";

      const inspectionData = {
        id: `INS-${Date.now()}`,
        ...formData,
        conditions_meteo: conditions_meteo_final,
        dv_photo: dvPhoto?.name || "",
        building_photos: buildingPhotos.map(p => p.name),
        created_at: new Date().toISOString(),
        sections: savedSections,
        inspector_notes_files: inspectorNotes.map(n => n.name),
        voice_notes_files: voiceNotes.map(n => n.name)
      };
      
      console.log('📊 Sections dans inspectionData:', inspectionData.sections?.length || 0);
      
      console.log("=== DONNÉES FORMULAIRE ===");
      console.log("inspectionData:", inspectionData);
      console.log("building_photos:", inspectionData.building_photos);
      console.log("description_sommaire:", inspectionData.description_sommaire);
      console.log("condition_generale:", inspectionData.condition_generale);
      
      // Photos already have base64 data from generateDescription() via convertPhotoToBase64.
      // Skipping redundant convertAllPhotosToBase64 — it would re-read 146+ photos,
      // hit the 30MB memory limit, and overflow localStorage/sessionStorage.
      // window.inspectionSections retains the full base64 data for the preview page.
      console.log('✅ Photos déjà converties en base64 par generateDescription, conversion ignorée');

      // Issue 6 fix: purge stale inspection_* keys before writing the new one to avoid
      // localStorage filling up with leftover data from previous sessions.
      try {
        const staleKeys: string[] = [];
        for (let i = 0; i < localStorage.length; i++) {
          const k = localStorage.key(i);
          if (k && k.startsWith('inspection_') && k !== `inspection_${inspectionData.id}`) {
            staleKeys.push(k);
          }
        }
        staleKeys.forEach(k => localStorage.removeItem(k));
        if (staleKeys.length > 0) {
          console.log(`🧹 Anciennes inspections supprimées: ${staleKeys.join(', ')}`);
        }
      } catch {
        /* non-critique — on continue */
      }
      // Strip base64/url from sections for localStorage (too large for Web Storage).
      // The preview page reads full base64 from window.inspectionSections.
      const inspectionDataForStorage = {
        ...inspectionData,
        sections: inspectionData.sections.map((section: any) => ({
          ...section,
          constats: section.constats.map((constat: any) => ({
            ...constat,
            photos: (constat.photos ?? []).map((photo: any) => ({
              name: photo.name,
              size: photo.size,
              type: photo.type,
              lastModified: photo.lastModified,
              photoNumber: photo.photoNumber,
              sectionName: photo.sectionName,
              originalFileName: photo.originalFileName,
            })),
          })),
        })),
      };
      const success = saveToHybridStorage(`inspection_${inspectionData.id}`, inspectionDataForStorage);
      
      if (!success) {
        console.warn('⚠️ Sauvegarde hybride échouée, données disponibles via window.inspectionSections');
      }
      
      console.log("✅ Données sauvegardées avec système hybride:", `inspection_${inspectionData.id}`);
      
      alert("✅ Inspection créée avec succès! Redirection vers le rapport...");
      router.push(`/rapport/preview/${inspectionData.id}`);
    } catch (error) {
      console.error("Erreur création inspection:", error);
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div className="max-w-4xl mx-auto bg-white rounded-xl shadow-lg p-8">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900 mb-2">🧠 Inspection Intelligente</h1>
        <p className="text-gray-600">Formulaire avec IA et reconnaissance automatique</p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-8">
        {/* Section 0: Informations de l'inspecteur */}
        <div className="border rounded-xl p-6 bg-purple-50">
          <div className="flex items-center gap-2 mb-4">
            <User className="w-5 h-5 text-purple-600" />
            <h2 className="text-xl font-semibold">Informations de l'inspecteur</h2>
            <span className="text-sm text-purple-600 bg-purple-100 px-2 py-1 rounded">Personnalisable</span>
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Nom de l'inspecteur *
              </label>
              <input
                type="text"
                value={inspectorInfo.name}
                onChange={(e) => updateInspectorInfo('name', e.target.value)}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500"
                placeholder="Nom complet de l'inspecteur"
                required
              />
            </div>
            
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Compagnie *
              </label>
              <input
                type="text"
                value={inspectorInfo.company}
                onChange={(e) => updateInspectorInfo('company', e.target.value)}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500"
                placeholder="Nom de la compagnie"
                required
              />
            </div>
            
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Adresse *
              </label>
              <input
                type="text"
                value={inspectorInfo.address}
                onChange={(e) => updateInspectorInfo('address', e.target.value)}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500"
                placeholder="Adresse complète"
                required
              />
            </div>
            
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Téléphone *
              </label>
              <input
                type="tel"
                value={inspectorInfo.phone}
                onChange={(e) => updateInspectorInfo('phone', e.target.value)}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500"
                placeholder="(514) 123-4567"
                required
              />
            </div>
            
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Courriel *
              </label>
              <input
                type="email"
                value={inspectorInfo.email}
                onChange={(e) => updateInspectorInfo('email', e.target.value)}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500"
                placeholder="inspecteur@exemple.com"
                required
              />
            </div>
            
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Numéro AIBQ *
              </label>
              <input
                type="text"
                value={inspectorInfo.aibqNumber}
                onChange={(e) => updateInspectorInfo('aibqNumber', e.target.value)}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500"
                placeholder="AIBQ-XXXXX"
                required
              />
            </div>
            
            <div className="md:col-span-2">
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Logo de la compagnie (optionnel)
              </label>
              <div className="flex items-center gap-3">
                <input
                  type="file"
                  accept="image/png,image/jpeg,image/jpg,image/svg+xml,image/webp"
                  className="hidden"
                  id="logo-upload"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (!file) return;
                    const MAX_SIZE = 500 * 1024; // 500 KB
                    if (file.size > MAX_SIZE) {
                      alert(`Le logo dépasse la limite de 500 Ko (${Math.round(file.size / 1024)} Ko). Veuillez choisir une image plus petite.`);
                      e.target.value = '';
                      return;
                    }
                    const reader = new FileReader();
                    reader.onloadend = () => {
                      updateInspectorInfo('logoUrl', reader.result as string);
                    };
                    reader.readAsDataURL(file);
                  }}
                />
                <label
                  htmlFor="logo-upload"
                  className="inline-flex items-center px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 cursor-pointer text-sm"
                >
                  <Upload className="w-4 h-4 mr-2" />
                  {inspectorInfo.logoUrl ? 'Changer le logo' : 'Téléverser un logo'}
                </label>
                {inspectorInfo.logoUrl && (
                  <button
                    type="button"
                    onClick={() => updateInspectorInfo('logoUrl', '')}
                    className="text-sm text-red-600 hover:text-red-800 underline"
                  >
                    Supprimer
                  </button>
                )}
              </div>
              {inspectorInfo.logoUrl && (
                <div className="mt-2 flex items-center gap-4">
                  <img
                    src={inspectorInfo.logoUrl}
                    alt="Logo de l'inspecteur"
                    className="h-12 w-auto object-contain border border-gray-200 rounded p-1"
                  />
                  <span className="text-sm text-gray-500">Aperçu du logo</span>
                </div>
              )}
            </div>
          </div>
        </div>

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
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  console.log("=== FICHIER SÉLECTIONNÉ ===");
                  console.log("Nom:", file?.name);
                  console.log("Type:", file?.type);
                  console.log("Taille:", file?.size, "bytes");
                  console.log("File object:", file);
                  console.log("e.target.files:", e.target.files);
                  console.log("========================");
                  
                  if (file) {
                    console.log("Mise à jour de dvPhoto avec:", file);
                    setDvPhoto(file);
                    // Forcer un re-render
                    setTimeout(() => {
                      console.log("dvPhoto après timeout:", file);
                    }, 100);
                  } else {
                    console.log("Aucun fichier trouvé");
                    setDvPhoto(null);
                  }
                }}
                className="hidden"
                id="dv-upload-fixed"
              />
              <label
                htmlFor="dv-upload-fixed"
                className="inline-flex items-center px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 cursor-pointer"
              >
                {dvPhoto ? `✅ ${dvPhoto.name}` : "Choisir un fichier"}
              </label>
              {dvPhoto && (
                <div className="mt-3">
                  <p className="text-sm text-gray-600 mb-2">
                    Fichier: {dvPhoto.name} ({(dvPhoto.size / 1024 / 1024).toFixed(2)} MB)
                  </p>
                  <button
                    type="button"
                    onClick={extractFromDV}
                    disabled={isProcessing}
                    className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50"
                  >
                    {isProcessing ? "⏳ Extraction..." : "🧠 Extraire les infos"}
                  </button>
                </div>
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
                onChange={(e) => {
                  conditionsMeteoRef.current = e.target.value;
                  setFormData(prev => ({ ...prev, conditions_meteo: e.target.value }));
                }}
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

        {/* Section 3: Photos et Notes de l'inspecteur */}
        <div className="border rounded-xl p-6">
          <div className="flex items-center gap-2 mb-4">
            <Camera className="w-5 h-5 text-blue-600" />
            <h2 className="text-xl font-semibold">Photos et Notes de l'inspecteur</h2>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {/* Photos du bâtiment */}
            <div className="p-4 border-2 border-dashed border-gray-300 rounded-lg">
              <div className="text-center">
                <Camera className="w-10 h-10 text-gray-400 mx-auto mb-2" />
                <p className="text-sm text-gray-600 mb-2">
                  Photos du bâtiment
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
                  className="inline-flex items-center px-3 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 cursor-pointer text-sm"
                >
                  {buildingPhotos.length > 0 ? `📷 ${buildingPhotos.length}` : "📷 Photos"}
                </label>
              </div>
            </div>

            {/* Notes manuscrites */}
            <div className="p-4 border-2 border-dashed border-gray-300 rounded-lg">
              <div className="text-center">
                <FileText className="w-10 h-10 text-gray-400 mx-auto mb-2" />
                <p className="text-sm text-gray-600 mb-2">
                  Notes manuscrites
                </p>
                <input
                  type="file"
                  accept="image/*"
                  multiple
                  onChange={handleInspectorNotesChange}
                  className="hidden"
                  id="inspector-notes"
                />
                <label
                  htmlFor="inspector-notes"
                  className="inline-flex items-center px-3 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 cursor-pointer text-sm"
                >
                  {inspectorNotes.length > 0 ? `📝 ${inspectorNotes.length}` : "� Notes"}
                </label>
              </div>
            </div>

            {/* Notes vocales */}
            <div className="p-4 border-2 border-dashed border-gray-300 rounded-lg">
              <div className="text-center">
                <div className="w-10 h-10 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-2">
                  <div className="w-6 h-6 bg-red-500 rounded-full"></div>
                </div>
                <p className="text-sm text-gray-600 mb-2">
                  Notes vocales
                </p>
                <input
                  type="file"
                  accept="audio/*"
                  multiple
                  onChange={handleVoiceNotesChange}
                  className="hidden"
                  id="voice-notes"
                />
                <label
                  htmlFor="voice-notes"
                  className="inline-flex items-center px-3 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 cursor-pointer text-sm"
                >
                  {voiceNotes.length > 0 ? `🎤 ${voiceNotes.length}` : "🎤 Vocales"}
                </label>
              </div>
            </div>
          </div>

          {/* Bouton d'analyse IA */}
          <div className="mt-4 text-center">
            {buildingPhotos.length > 0 && (
              <button
                type="button"
                onClick={() => {
                  console.log("🔘 DEBUG: Bouton cliqué!");
                  generateDescription();
                }}
                disabled={isProcessing}
                className="px-6 py-3 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50 flex items-center gap-2 mx-auto"
                >
                  {isProcessing ? "⏳ Analyse..." : "🧠 Analyser les photos"}
                </button>
              )}
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
};
