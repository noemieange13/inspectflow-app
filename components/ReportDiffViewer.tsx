"use client"

type DiffItem = {
  type: "added" | "removed" | "unchanged"
  value: string
}

export default function ReportDiffViewer({
  diff
}: {
  diff: DiffItem[]
}) {
  return (
    <div className="mt-4 p-3 border rounded bg-white text-sm">
      <h4 className="font-semibold mb-2">Comparaison</h4>

      <div className="space-y-1 font-mono text-xs">
        {diff.map((line, i) => (
          <div
            key={i}
            className={`
              px-2 py-1 rounded
              ${line.type === "added" && "bg-green-100 text-green-800"}
              ${line.type === "removed" && "bg-red-100 text-red-800"}
              ${line.type === "unchanged" && "text-gray-500"}
            `}
          >
            {line.type === "added" && "+"}
            {line.type === "removed" && "-"}
            {line.value}
          </div>
        ))}
      </div>
    </div>
  )
}