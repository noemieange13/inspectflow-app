"use client";

import { useState, useEffect } from "react";
import Link from "next/link";

export default function InspectionCoverFormSimple() {
  const [formData, setFormData] = useState({
    requerants: "",
    propriete_adresse: "",
    client_nom: "",
    client_telephone: "",
    client_courriel: "",
    type_propriete: "residential",
    annee_construction: "",
    date_heure: "",
    conditions_meteo: "",
    duree_inspection: "",
    description_sommaire: "",
    condition_generale: "",
    orientation_facade: "",
  });

  useEffect(() => {
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
  }, []);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    alert("✅ Formulaire de couverture soumis avec succès!");
  };

  return (
    <div className="max-w-4xl mx-auto">
      <form onSubmit={handleSubmit} className="space-y-8">
        {/* Section Requérants */}
        <div className="border rounded-xl p-6">
          <h2 className="text-xl font-semibold mb-4">Requérants</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Requérants *
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
          </div>
        </div>

        {/* Section Propriété */}
        <div className="border rounded-xl p-6">
          <h2 className="text-xl font-semibold mb-4">Propriété inspectée</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Adresse *
              </label>
              <input
                type="text"
                value={formData.propriete_adresse}
                onChange={(e) => setFormData(prev => ({ ...prev, propriete_adresse: e.target.value }))}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                placeholder="Ex: 123 Rue Principale, Montréal, QC"
                required
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

        {/* Section Client */}
        <div className="border rounded-xl p-6">
          <h2 className="text-xl font-semibold mb-4">Informations client</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
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
                Téléphone
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
                Courriel
              </label>
              <input
                type="email"
                value={formData.client_courriel}
                onChange={(e) => setFormData(prev => ({ ...prev, client_courriel: e.target.value }))}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                placeholder="Ex: jean.dupont@email.com"
              />
            </div>
          </div>
        </div>

        {/* Section Conditions */}
        <div className="border rounded-xl p-6">
          <h2 className="text-xl font-semibold mb-4">Conditions d'inspection</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Date et heure
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

        {/* Section Description */}
        <div className="border rounded-xl p-6">
          <h2 className="text-xl font-semibold mb-4">Description du bâtiment</h2>
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

        {/* Actions */}
        <div className="flex justify-between items-center">
          <Link
            href="/"
            className="text-blue-600 hover:text-blue-800 underline"
          >
            ← Retour à l'accueil
          </Link>
          <button
            type="submit"
            className="px-8 py-3 bg-blue-600 text-white font-semibold rounded-lg hover:bg-blue-700"
          >
            Soumettre le formulaire
          </button>
        </div>
      </form>
    </div>
  );
}
