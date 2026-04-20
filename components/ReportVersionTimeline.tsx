"use client"

import { useReportVersions } from "@/lib/useReportVersions"

export default function ReportVersionTimeline({
  reportId,
  viewerToken
}: any) {
  const { rows, loading, error } = useReportVersions(reportId, viewerToken)

  // 🔒 guards globaux
  if (loading) return <div style={{ padding: 12 }}>Chargement...</div>

  if (error) {
    return (
      <div style={{ padding: 12, color: "red" }}>
        Erreur chargement : {error}
      </div>
    )
  }

  if (!Array.isArray(rows)) {
    console.error("rows invalide:", rows)
    return <div style={{ padding: 12 }}>Données invalides</div>
  }

  return (
    <div style={{ padding: 16 }}>
      <h3>Historique des versions</h3>

      {rows.length === 0 && (
        <div style={{ opacity: 0.7 }}>
          Aucune version disponible
        </div>
      )}

      {rows.map((v: any, index: number) => {
        try {
          const date = v?.created_at
            ? new Date(v.created_at).toLocaleString()
            : "—"

          return (
            <div
              key={v?.id ?? index}
              style={{
                border: "1px solid #ddd",
                borderRadius: 8,
                padding: 12,
                marginBottom: 10,
                background: "#fff"
              }}
            >
              <div><strong>Version:</strong> {v?.version_number ?? "?"}</div>
              <div><strong>Date:</strong> {date}</div>
              <div><strong>Label:</strong> {v?.label ?? "—"}</div>
            </div>
          )
        } catch (err) {
          console.error("Render crash row:", v, err)
          return (
            <div key={index} style={{ color: "red" }}>
              Erreur affichage version
            </div>
          )
        }
      })}
    </div>
  )
}