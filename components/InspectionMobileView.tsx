"use client";

import { useState } from "react";
import { Camera, Mic, Image, FileText, MapPin, Clock, CheckCircle } from "lucide-react";

type InspectionTab = "photos" | "notes" | "report" | "summary";

export default function InspectionMobileView() {
  const [activeTab, setActiveTab] = useState<InspectionTab>("photos");
  const [isRecording, setIsRecording] = useState(false);
  const [photoCount, setPhotoCount] = useState(24);
  const [notesCount, setNotesCount] = useState(8);
  const [reportProgress, setReportProgress] = useState(65);

  const tabs = [
    { id: "photos" as InspectionTab, label: "Photos", icon: Camera, count: photoCount },
    { id: "notes" as InspectionTab, label: "Notes", icon: Mic, count: notesCount },
    { id: "report" as InspectionTab, label: "Rapport", icon: FileText, count: null },
    { id: "summary" as InspectionTab, label: "Résumé", icon: CheckCircle, count: null },
  ];

  const renderTabContent = () => {
    switch (activeTab) {
      case "photos":
        return (
          <div className="space-y-4">
            {/* Quick actions */}
            <div className="grid grid-cols-2 gap-4">
              <button className="bg-blue-600 text-white p-4 rounded-xl flex flex-col items-center gap-2 hover:bg-blue-700 transition-colors">
                <Camera className="w-6 h-6" />
                <span className="text-sm font-medium">Prendre photo</span>
              </button>
              <button className="bg-gray-100 text-gray-700 p-4 rounded-xl flex flex-col items-center gap-2 hover:bg-gray-200 transition-colors">
                <Image className="w-6 h-6" />
                <span className="text-sm font-medium">Importer</span>
              </button>
            </div>

            {/* Photo categories */}
            <div className="bg-white rounded-xl border p-4">
              <h3 className="font-medium text-gray-900 mb-3">Catégories de photos</h3>
              <div className="grid grid-cols-2 gap-3">
                {[
                  { name: "Extérieur", count: 8, color: "bg-blue-100 text-blue-800" },
                  { name: "Intérieur", count: 12, color: "bg-green-100 text-green-800" },
                  { name: "Toiture", count: 3, color: "bg-yellow-100 text-yellow-800" },
                  { name: "Fondations", count: 1, color: "bg-red-100 text-red-800" },
                ].map((category) => (
                  <div key={category.name} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                    <span className="text-sm font-medium text-gray-700">{category.name}</span>
                    <span className={`px-2 py-1 rounded-full text-xs font-medium ${category.color}`}>
                      {category.count}
                    </span>
                  </div>
                ))}
              </div>
            </div>

            {/* Recent photos */}
            <div className="bg-white rounded-xl border p-4">
              <h3 className="font-medium text-gray-900 mb-3">Photos récentes</h3>
              <div className="grid grid-cols-3 gap-2">
                {[1, 2, 3, 4, 5, 6].map((i) => (
                  <div key={i} className="aspect-square bg-gray-200 rounded-lg flex items-center justify-center">
                    <Image className="w-8 h-8 text-gray-400" />
                  </div>
                ))}
              </div>
            </div>
          </div>
        );

      case "notes":
        return (
          <div className="space-y-4">
            {/* Voice recording */}
            <div className="bg-white rounded-xl border p-4">
              <h3 className="font-medium text-gray-900 mb-3">Notes vocales</h3>
              <button
                onClick={() => setIsRecording(!isRecording)}
                className={`w-full p-4 rounded-xl flex flex-col items-center gap-2 transition-colors ${
                  isRecording 
                    ? "bg-red-600 text-white hover:bg-red-700" 
                    : "bg-blue-600 text-white hover:bg-blue-700"
                }`}
              >
                <Mic className={`w-6 h-6 ${isRecording ? "animate-pulse" : ""}`} />
                <span className="text-sm font-medium">
                  {isRecording ? "Arrêter l'enregistrement" : "Commencer note vocale"}
                </span>
              </button>
            </div>

            {/* Text notes */}
            <div className="bg-white rounded-xl border p-4">
              <h3 className="font-medium text-gray-900 mb-3">Notes textuelles</h3>
              <textarea
                className="w-full p-3 border border-gray-300 rounded-lg resize-none"
                rows={4}
                placeholder="Ajoutez vos notes d'inspection ici..."
              />
              <button className="mt-2 bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-blue-700 transition-colors">
                Ajouter la note
              </button>
            </div>

            {/* Recent notes */}
            <div className="bg-white rounded-xl border p-4">
              <h3 className="font-medium text-gray-900 mb-3">Notes récentes</h3>
              <div className="space-y-3">
                {[
                  { time: "10:30", text: "Fissure visible dans la fondation nord-est", type: "voice" },
                  { time: "10:45", text: "Toiture en bon état général", type: "text" },
                  { time: "11:15", text: "Humidité détectée sous l'évier de cuisine", type: "voice" },
                ].map((note, i) => (
                  <div key={i} className="flex items-start gap-3 p-3 bg-gray-50 rounded-lg">
                    <div className="w-8 h-8 bg-blue-100 rounded-full flex items-center justify-center flex-shrink-0">
                      {note.type === "voice" ? (
                        <Mic className="w-4 h-4 text-blue-600" />
                      ) : (
                        <FileText className="w-4 h-4 text-blue-600" />
                      )}
                    </div>
                    <div className="flex-1">
                      <p className="text-sm text-gray-900">{note.text}</p>
                      <p className="text-xs text-gray-500 mt-1">{note.time}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        );

      case "report":
        return (
          <div className="space-y-4">
            {/* Progress */}
            <div className="bg-white rounded-xl border p-4">
              <div className="flex items-center justify-between mb-2">
                <h3 className="font-medium text-gray-900">Progression du rapport</h3>
                <span className="text-sm font-medium text-blue-600">{reportProgress}%</span>
              </div>
              <div className="w-full bg-gray-200 rounded-full h-2">
                <div 
                  className="bg-blue-600 h-2 rounded-full transition-all duration-300"
                  style={{ width: `${reportProgress}%` }}
                />
              </div>
            </div>

            {/* Report sections */}
            <div className="bg-white rounded-xl border p-4">
              <h3 className="font-medium text-gray-900 mb-3">Sections du rapport</h3>
              <div className="space-y-3">
                {[
                  { name: "Informations générales", status: "completed", icon: CheckCircle },
                  { name: "Extérieur", status: "completed", icon: CheckCircle },
                  { name: "Intérieur", status: "in_progress", icon: Clock },
                  { name: "Toiture", status: "pending", icon: Clock },
                  { name: "Fondations", status: "pending", icon: Clock },
                  { name: "Électricité", status: "pending", icon: Clock },
                  { name: "Plomberie", status: "pending", icon: Clock },
                ].map((section) => (
                  <div key={section.name} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                    <div className="flex items-center gap-3">
                      <section.icon 
                        className={`w-5 h-5 ${
                          section.status === "completed" 
                            ? "text-green-600" 
                            : section.status === "in_progress" 
                            ? "text-blue-600" 
                            : "text-gray-400"
                        }`}
                      />
                      <span className="text-sm font-medium text-gray-700">{section.name}</span>
                    </div>
                    <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                      section.status === "completed" 
                        ? "bg-green-100 text-green-800" 
                        : section.status === "in_progress" 
                        ? "bg-blue-100 text-blue-800" 
                        : "bg-gray-100 text-gray-600"
                    }`}>
                      {section.status === "completed" ? "Terminé" : section.status === "in_progress" ? "En cours" : "À faire"}
                    </span>
                  </div>
                ))}
              </div>
            </div>

            {/* Generate preview */}
            <button className="w-full bg-green-600 text-white p-4 rounded-xl font-medium hover:bg-green-700 transition-colors">
              Générer l'aperçu PDF
            </button>
          </div>
        );

      case "summary":
        return (
          <div className="space-y-4">
            {/* Inspection info */}
            <div className="bg-white rounded-xl border p-4">
              <h3 className="font-medium text-gray-900 mb-3">Informations de l'inspection</h3>
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <MapPin className="w-4 h-4 text-gray-500" />
                  <span className="text-sm text-gray-700">123 Rue Principale, Montréal</span>
                </div>
                <div className="flex items-center gap-2">
                  <Clock className="w-4 h-4 text-gray-500" />
                  <span className="text-sm text-gray-700">Commencé il y a 2h30</span>
                </div>
              </div>
            </div>

            {/* Quick stats */}
            <div className="grid grid-cols-2 gap-4">
              <div className="bg-white rounded-xl border p-4 text-center">
                <p className="text-2xl font-bold text-blue-600">{photoCount}</p>
                <p className="text-sm text-gray-600">Photos</p>
              </div>
              <div className="bg-white rounded-xl border p-4 text-center">
                <p className="text-2xl font-bold text-green-600">{notesCount}</p>
                <p className="text-sm text-gray-600">Notes</p>
              </div>
            </div>

            {/* Next steps */}
            <div className="bg-white rounded-xl border p-4">
              <h3 className="font-medium text-gray-900 mb-3">Prochaines étapes</h3>
              <div className="space-y-2">
                <label className="flex items-center gap-3">
                  <input type="checkbox" className="w-4 h-4 text-blue-600" />
                  <span className="text-sm text-gray-700">Finaliser la section toiture</span>
                </label>
                <label className="flex items-center gap-3">
                  <input type="checkbox" className="w-4 h-4 text-blue-600" />
                  <span className="text-sm text-gray-700">Vérifier l'électricité</span>
                </label>
                <label className="flex items-center gap-3">
                  <input type="checkbox" className="w-4 h-4 text-blue-600" />
                  <span className="text-sm text-gray-700">Générer le rapport final</span>
                </label>
              </div>
            </div>

            {/* Complete inspection */}
            <button className="w-full bg-green-600 text-white p-4 rounded-xl font-medium hover:bg-green-700 transition-colors">
              Terminer l'inspection
            </button>
          </div>
        );

      default:
        return null;
    }
  };

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white shadow-sm border-b">
        <div className="px-4 py-3">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-lg font-bold text-gray-900">Inspection en cours</h1>
              <p className="text-sm text-gray-600">123 Rue Principale</p>
            </div>
            <div className="bg-blue-100 px-3 py-1 rounded-full">
              <span className="text-xs font-medium text-blue-800">En cours</span>
            </div>
          </div>
        </div>
      </div>

      {/* Tab navigation */}
      <div className="bg-white border-b">
        <div className="grid grid-cols-4 gap-1">
          {tabs.map((tab) => {
            const Icon = tab.icon;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex flex-col items-center gap-1 py-3 px-2 relative transition-colors ${
                  activeTab === tab.id
                    ? "text-blue-600 bg-blue-50"
                    : "text-gray-600 hover:text-gray-900"
                }`}
              >
                <Icon className="w-5 h-5" />
                <span className="text-xs font-medium">{tab.label}</span>
                {tab.count !== null && (
                  <span className="absolute top-2 right-2 bg-gray-900 text-white text-xs w-5 h-5 rounded-full flex items-center justify-center">
                    {tab.count}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* Content */}
      <div className="p-4">
        {renderTabContent()}
      </div>
    </div>
  );
}
