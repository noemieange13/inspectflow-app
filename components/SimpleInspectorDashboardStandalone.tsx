"use client";

import Link from "next/link";
import { useState } from "react";
import { Camera, FileText, CheckCircle, Clock, MapPin, Users, TrendingUp } from "lucide-react";

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
  {
    id: "3",
    address: "789 Boulevard Saint-Laurent, Montréal",
    client: "Robert Johnson",
    status: "completed",
    lastUpdate: "2024-01-13T09:15:00Z",
    photoCount: 45,
  },
];

export default function SimpleInspectorDashboardStandalone() {
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

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleString('fr-CA', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white shadow-sm border-b">
        <div className="max-w-6xl mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold text-gray-900">InspectFlow</h1>
              <p className="text-sm text-gray-600">Tableau de bord des inspections</p>
            </div>
            <Link
              href="/smart-inspection"
              className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg font-medium transition-colors"
            >
              + Nouvelle inspection
            </Link>
          </div>
        </div>
      </div>

      {/* Quick Actions */}
      <div className="max-w-6xl mx-auto px-4 py-6">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
          <div className="bg-white p-6 rounded-xl shadow-sm border">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-600">Inspections actives</p>
                <p className="text-2xl font-bold text-gray-900">3</p>
              </div>
              <div className="bg-blue-100 p-3 rounded-lg">
                <FileText className="w-6 h-6 text-blue-600" />
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
                <Camera className="w-6 h-6 text-green-600" />
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
                <CheckCircle className="w-6 h-6 text-purple-600" />
              </div>
            </div>
          </div>

          <div className="bg-white p-6 rounded-xl shadow-sm border">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-600">Taux de completion</p>
                <p className="text-2xl font-bold text-gray-900">87%</p>
              </div>
              <div className="bg-orange-100 p-3 rounded-lg">
                <TrendingUp className="w-6 h-6 text-orange-600" />
              </div>
            </div>
          </div>
        </div>

        {/* Quick Actions */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
          <Link
            href="/smart-inspection"
            className="bg-gradient-to-r from-blue-600 to-blue-700 text-white p-6 rounded-xl shadow-lg hover:shadow-xl transition-all"
          >
            <div className="flex items-center gap-4">
              <div className="bg-white/20 p-3 rounded-lg">
                <Camera className="w-6 h-6" />
              </div>
              <div>
                <h3 className="font-semibold text-lg">Nouvelle inspection IA</h3>
                <p className="text-blue-100 text-sm">Commencez avec l'intelligence artificielle</p>
              </div>
            </div>
          </Link>

          <Link
            href="/inspection/new"
            className="bg-gradient-to-r from-green-600 to-green-700 text-white p-6 rounded-xl shadow-lg hover:shadow-xl transition-all"
          >
            <div className="flex items-center gap-4">
              <div className="bg-white/20 p-3 rounded-lg">
                <FileText className="w-6 h-6" />
              </div>
              <div>
                <h3 className="font-semibold text-lg">Inspection rapide</h3>
                <p className="text-green-100 text-sm">Formulaire simplifié</p>
              </div>
            </div>
          </Link>

          <Link
            href="/rapport/couverture"
            className="bg-gradient-to-r from-purple-600 to-purple-700 text-white p-6 rounded-xl shadow-lg hover:shadow-xl transition-all"
          >
            <div className="flex items-center gap-4">
              <div className="bg-white/20 p-3 rounded-lg">
                <Users className="w-6 h-6" />
              </div>
              <div>
                <h3 className="font-semibold text-lg">Formulaire complet</h3>
                <p className="text-purple-100 text-sm">Toutes les options</p>
              </div>
            </div>
          </Link>
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
                      <span className="flex items-center gap-1">
                        <Clock className="w-3 h-3" />
                        {formatDate(inspection.lastUpdate)}
                      </span>
                      <span className="flex items-center gap-1">
                        <Camera className="w-3 h-3" />
                        {inspection.photoCount} photos
                      </span>
                    </div>
                  </div>
                  
                  <div className="flex items-center gap-2">
                    <Link
                      href={`/smart-inspection`}
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
