"use client"

export default function BestVersionExplanation({
  reasons
}: {
  reasons: string[]
}) {
  return (
    <div className="mt-4 p-4 rounded-lg border bg-green-50">
      <h4 className="font-semibold mb-2 text-green-700">
        Pourquoi cette version est recommandée
      </h4>

      <ul className="text-sm text-green-800 space-y-1">
        {reasons.map((r, i) => (
          <li key={i}>✔ {r}</li>
        ))}
      </ul>
    </div>
  )
}