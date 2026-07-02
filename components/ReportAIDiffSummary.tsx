"use client";

import type { DiffAnalysisResult } from "@/lib/aiDiff";

export default function ReportAIDiffSummary({ result }: { result: DiffAnalysisResult }) {
  return (
    <div className="mt-4 p-4 rounded-lg border bg-gradient-to-r from-blue-50 to-white">
      
      <h4 className="font-semibold mb-2">
        Analyse intelligente
      </h4>

      <div className="text-sm space-y-2">

        <div>
          {result.summary}
        </div>

        <div className="flex gap-4 text-xs text-gray-600">
          <span>➕ {result.addedCount}</span>
          <span>➖ {result.removedCount}</span>
        </div>

        {result.criticalIssues.length > 0 && (
          <div className="mt-2 text-red-600 text-xs">
            ⚠️ {result.criticalIssues.length} élément(s) critique(s)
          </div>
        )}

      </div>
    </div>
  )
}