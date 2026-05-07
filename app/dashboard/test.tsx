export default function TestPage() {
  return (
    <div className="min-h-screen bg-gray-50 p-8">
      <div className="max-w-4xl mx-auto">
        <h1 className="text-3xl font-bold text-gray-900 mb-8">Page de Test</h1>
        
        <div className="bg-white rounded-lg shadow p-6 mb-6">
          <h2 className="text-xl font-semibold mb-4">Test Basique</h2>
          <p className="text-gray-600">Cette page ne contient aucun appel externe.</p>
          <p className="text-gray-600">Si cette page fonctionne, le problème vient du composant.</p>
        </div>

        <div className="bg-white rounded-lg shadow p-6">
          <h2 className="text-xl font-semibold mb-4">Navigation</h2>
          <a href="/" className="text-blue-600 hover:text-blue-800 underline">
            ← Retour à l'accueil
          </a>
        </div>
      </div>
    </div>
  );
}
