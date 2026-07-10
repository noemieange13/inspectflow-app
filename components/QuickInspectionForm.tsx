"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function QuickInspectionForm() {
  const router = useRouter();
  const [formData, setFormData] = useState({
    clientName: "",
    address: "",
    inspectionType: "residential",
    language: "fr",
  });
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    
    try {
      // Créer une nouvelle inspection avec les données de base
      const response = await fetch("/api/create-inspection", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(formData),
      });
      
      if (response.ok) {
        const { reportId, accessToken } = await response.json();
        const tokenQ =
          typeof accessToken === "string" && accessToken.trim()
            ? `?token=${encodeURIComponent(accessToken.trim())}`
            : "";
        router.push(`/report/${reportId}${tokenQ}`);
      }
    } catch (error) {
      console.error("Erreur création inspection:", error);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="max-w-2xl mx-auto bg-white rounded-xl shadow-lg p-8">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900 mb-2">Nouvelle inspection</h1>
        <p className="text-gray-600">Commencez une inspection en quelques secondes</p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Client */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Nom du client
          </label>
          <input
            type="text"
            value={formData.clientName}
            onChange={(e) => setFormData({ ...formData, clientName: e.target.value })}
            className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            placeholder="Ex: Jean Dupont"
            required
          />
        </div>

        {/* Adresse */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Adresse de l'inspection
          </label>
          <input
            type="text"
            value={formData.address}
            onChange={(e) => setFormData({ ...formData, address: e.target.value })}
            className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            placeholder="Ex: 123 Rue Principale, Montréal, QC"
            required
          />
        </div>

        {/* Type d'inspection */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Type d'inspection
          </label>
          <select
            value={formData.inspectionType}
            onChange={(e) => setFormData({ ...formData, inspectionType: e.target.value })}
            className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
          >
            <option value="residential">Résidentiel</option>
            <option value="commercial">Commercial</option>
            <option value="multiplex">Multiplex</option>
            <option value="condo">Condominium</option>
          </select>
        </div>

        {/* Langue */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Langue du rapport
          </label>
          <div className="flex gap-4">
            <label className="flex items-center">
              <input
                type="radio"
                value="fr"
                checked={formData.language === "fr"}
                onChange={(e) => setFormData({ ...formData, language: e.target.value })}
                className="mr-2"
              />
              <span>Français</span>
            </label>
            <label className="flex items-center">
              <input
                type="radio"
                value="en"
                checked={formData.language === "en"}
                onChange={(e) => setFormData({ ...formData, language: e.target.value })}
                className="mr-2"
              />
              <span>English</span>
            </label>
          </div>
        </div>

        {/* Bouton d'action */}
        <div className="pt-4">
          <button
            type="submit"
            disabled={isSubmitting}
            className="w-full bg-blue-600 hover:bg-blue-700 disabled:bg-blue-300 text-white font-medium py-3 px-4 rounded-lg transition-colors"
          >
            {isSubmitting ? "Création en cours..." : "Commencer l'inspection →"}
          </button>
        </div>
      </form>
    </div>
  );
}
