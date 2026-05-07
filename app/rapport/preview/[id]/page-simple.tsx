"use client";

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { useParams } from "next/navigation";
import { ArrowLeft } from 'lucide-react';

console.log("🔧 DEBUG: Composant ReportPreviewPage simplifié chargé");

export default function ReportPreviewPage() {
  console.log("🔧 DEBUG: Début du composant ReportPreviewPage simplifié");
  
  const params = useParams();
  console.log("🔧 DEBUG: useParams:", params);
  
  const [inspectionData, setInspectionData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  
  console.log("🔧 DEBUG: États initialisés");

  useEffect(() => {
    console.log("🔧 DEBUG: useEffect début");
    
    // Charger les données depuis localStorage
    const storedData = localStorage.getItem(`inspection_${params.id}`);
    console.log("=== DEBUG RAPPORT SIMPLIFIÉ ===");
    console.log("ID inspection:", params.id);
    console.log("Données brutes:", storedData ? "présentes" : "absentes");
    
    if (storedData) {
      try {
        const parsedData = JSON.parse(storedData);
        console.log("Données parsées:", !!parsedData);
        console.log("Nombre de sections:", parsedData.sections?.length || 0);
        setInspectionData(parsedData);
        setLoading(false);
      } catch (error) {
        console.error("Erreur parsing données:", error);
        setLoading(false);
      }
    } else {
      console.log("Aucune donnée trouvée");
      setLoading(false);
    }
    
    console.log("🔧 DEBUG: useEffect fin");
  }, [params.id]);

  if (loading) {
    console.log("🔧 DEBUG: Affichage loading");
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
    console.log("🔧 DEBUG: Affichage erreur - pas de données");
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

  console.log("🔧 DEBUG: Affichage rapport principal");
  
  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white shadow-sm border-b">
        <div className="max-w-6xl mx-auto px-4 py-4">
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
        </div>
      </div>

      {/* Contenu principal */}
      <div className="max-w-6xl mx-auto px-4 py-8">
        <div className="bg-white rounded-xl shadow-sm p-6">
          <h2 className="text-2xl font-bold text-gray-900 mb-6">Rapport d'Inspection Simplifié</h2>
          
          <div className="space-y-6">
            <div>
              <h3 className="text-lg font-semibold text-gray-900">Requérants</h3>
              <p className="text-gray-700">{inspectionData.requerants}</p>
            </div>
            
            <div>
              <h3 className="text-lg font-semibold text-gray-900">Adresse</h3>
              <p className="text-gray-700">{inspectionData.propriete_adresse}</p>
            </div>
            
            <div>
              <h3 className="text-lg font-semibold text-gray-900">Description</h3>
              <p className="text-gray-700">{inspectionData.description_sommaire}</p>
            </div>
            
            <div>
              <h3 className="text-lg font-semibold text-gray-900">Condition générale</h3>
              <p className="text-gray-700">{inspectionData.condition_generale}</p>
            </div>
            
            <div>
              <h3 className="text-lg font-semibold text-gray-900">Sections ({inspectionData.sections?.length || 0})</h3>
              <div className="mt-4 space-y-4">
                {inspectionData.sections?.map((section: any, index: number) => (
                  <div key={section.name} className="border rounded-lg p-4">
                    <h4 className="font-semibold text-gray-900">
                      {section.icon} {section.name} ({section.constats?.length || 0} constats)
                    </h4>
                    <div className="mt-2 space-y-2">
                      {section.constats?.map((constat: any, cIndex: number) => (
                        <div key={constat.id} className="border-l-4 border-blue-200 pl-3">
                          <p className="font-medium text-gray-800">{constat.title}</p>
                          <p className="text-sm text-gray-600">{constat.observation}</p>
                          <p className="text-sm text-gray-500">{constat.photos?.length || 0} photo(s)</p>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
