"use client";

import Link from "next/link";
import { useState } from "react";
import { format } from "date-fns";
import { fr } from "date-fns/locale";

type InspectionQuick = {
  id: string;
  address: string;
  client: string;
  status: "draft" | "in_progress" | "completed";
  lastUpdate: string;
  photoCount: number;
};

const mockInspections: InspectionQuick[] = [
  {
    id: "1",
    address: "123 Rue Principale, Montréal",
    client: "Jean Dupont",
    status: "in_progress",
    lastUpdate: "2024-01-15T10:30:00Z",
    photoCount: 24,
  },
  {
    id: "2", 
    address: "456 Avenue Maple, Québec",
    client: "Marie Tremblay",
    status: "draft",
    lastUpdate: "2024-01-14T15:45:00Z",
    photoCount: 0,
  },
];

export default function SimpleInspectorDashboard() {
  const [selectedInspection, setSelectedInspection] = useState<string | null>(null);

  const getStatusColor = (status: InspectionQuick["status"]) => {
    switch (status) {
      case "completed": return "bg-green-100 text-green-800";
      case "in_progress": return "bg-blue-100 text-blue-800";
      case "draft": return "bg-gray-100 text-gray-800";
    }
  };

  const getStatusText = (status: InspectionQuick["status"]) => {
    switch (status) {
      case "completed": return "Terminé";
      case "in_progress": return "En cours";
      case "draft": return "Brouillon";
    }
  };

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white shadow-sm border-b">
        <div className="max-w-6xl mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold text-gray-900">InspectFlow</h1>
              <p className="text-sm text-gray-600">Inspections du jour</p>
            </div>
            <Link
              href="/rapport/couverture"
              className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg font-medium transition-colors"
            >
              + Nouvelle inspection
            </Link>
          </div>
        </div>
      </div>

      {/* Quick Actions */}
      <div className="max-w-6xl mx-auto px-4 py-6">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
          <div className="bg-white p-6 rounded-xl shadow-sm border">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-600">Inspections aujourd'hui</p>
                <p className="text-2xl font-bold text-gray-900">3</p>
              </div>
              <div className="bg-blue-100 p-3 rounded-lg">
                <svg className="w-6 h-6 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                </svg>
              </div>
            </div>
          </div>

          <div className="bg-white p-6 rounded-xl shadow-sm border">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-600">Photos cette semaine</p>
                <p className="text-2xl font-bold text-gray-900">147</p>
              </div>
              <div className="bg-green-100 p-3 rounded-lg">
                <svg className="w-6 h-6 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                </svg>
              </div>
            </div>
          </div>

          <div className="bg-white p-6 rounded-xl shadow-sm border">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-600">Rapports générés</p>
                <p className="text-2xl font-bold text-gray-900">12</p>
              </div>
              <div className="bg-purple-100 p-3 rounded-lg">
                <svg className="w-6 h-6 text-purple-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
              </div>
            </div>
          </div>
        </div>

        {/* Inspections List */}
        <div className="bg-white rounded-xl shadow-sm border">
          <div className="px-6 py-4 border-b">
            <h2 className="text-lg font-semibold text-gray-900">Inspections récentes</h2>
          </div>
          
          <div className="divide-y">
            {mockInspections.map((inspection) => (
              <div
                key={inspection.id}
                className={`p-6 hover:bg-gray-50 cursor-pointer transition-colors ${
                  selectedInspection === inspection.id ? "bg-blue-50" : ""
                }`}
                onClick={() => setSelectedInspection(inspection.id)}
              >
                <div className="flex items-center justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-3 mb-2">
                      <h3 className="font-medium text-gray-900">{inspection.address}</h3>
                      <span className={`px-2 py-1 rounded-full text-xs font-medium ${getStatusColor(inspection.status)}`}>
                        {getStatusText(inspection.status)}
                      </span>
                    </div>
                    <p className="text-sm text-gray-600 mb-2">Client: {inspection.client}</p>
                    <div className="flex items-center gap-4 text-xs text-gray-500">
                      <span>Dernière mise à jour: {format(new Date(inspection.lastUpdate), "PPp", { locale: fr })}</span>
                      <span>{inspection.photoCount} photos</span>
                    </div>
                  </div>
                  
                  <div className="flex items-center gap-2">
                    <Link
                      href={`/report/${inspection.id}`}
                      className="text-blue-600 hover:text-blue-800 font-medium text-sm"
                    >
                      Continuer →
                    </Link>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
