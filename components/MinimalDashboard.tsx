"use client";

import Link from "next/link";

export default function MinimalDashboard() {
  return (
    <div className="min-h-screen bg-gray-50 p-8">
      <div className="max-w-4xl mx-auto">
        <h1 className="text-3xl font-bold text-gray-900 mb-8">InspectFlow Dashboard</h1>
        
        <div className="bg-white rounded-lg shadow p-6 mb-6">
          <h2 className="text-xl font-semibold mb-4">Actions rapides</h2>
          <div className="space-y-4">
            <Link
              href="/smart-inspection"
              className="block w-full bg-blue-600 text-white text-center py-3 px-4 rounded-lg hover:bg-blue-700"
            >
              🧠 Nouvelle inspection IA
            </Link>
            
            <Link
              href="/inspection/new"
              className="block w-full bg-green-600 text-white text-center py-3 px-4 rounded-lg hover:bg-green-700"
            >
              ⚡ Inspection rapide
            </Link>
            
            <Link
              href="/rapport/couverture"
              className="block w-full bg-purple-600 text-white text-center py-3 px-4 rounded-lg hover:bg-purple-700"
            >
              📝 Formulaire complet
            </Link>
          </div>
        </div>

        <div className="bg-white rounded-lg shadow p-6">
          <h2 className="text-xl font-semibold mb-4">Inspections récentes</h2>
          <div className="space-y-3">
            <div className="border-l-4 border-blue-500 pl-4 py-2">
              <h3 className="font-medium">123 Rue Principale, Montréal</h3>
              <p className="text-sm text-gray-600">Jean Dupont • En cours • 24 photos</p>
            </div>
            <div className="border-l-4 border-gray-400 pl-4 py-2">
              <h3 className="font-medium">456 Avenue Maple, Québec</h3>
              <p className="text-sm text-gray-600">Marie Tremblay • Brouillon • 0 photos</p>
            </div>
          </div>
        </div>

        <div className="mt-8 text-center">
          <Link
            href="/"
            className="text-blue-600 hover:text-blue-800 underline"
          >
            ← Retour à l'accueil
          </Link>
        </div>
      </div>
    </div>
  );
}
