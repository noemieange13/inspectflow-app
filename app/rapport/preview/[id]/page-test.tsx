export default function TestPage() {
  console.log("🔧 DEBUG: Test page loaded");
  
  return (
    <div className="min-h-screen bg-blue-50 p-8">
      <h1 className="text-4xl font-bold text-blue-900">TEST PAGE</h1>
      <p className="text-lg text-blue-700 mt-4">
        Si vous voyez cette page, le routage fonctionne !
      </p>
      <p className="text-sm text-gray-600 mt-2">
        ID: {typeof window !== 'undefined' ? window.location.pathname : 'Loading...'}
      </p>
    </div>
  );
}
