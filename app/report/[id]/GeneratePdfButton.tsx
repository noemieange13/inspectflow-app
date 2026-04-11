"use client"

import { useState } from "react"

function pickError(data: Record<string, unknown>): string | null {
  if (typeof data.error === "string" && data.error) return data.error
  const body = data.body
  if (body && typeof body === "object" && body !== null) {
    const e = (body as { error?: unknown }).error
    if (typeof e === "string" && e) return e
  }
  return null
}

export default function GeneratePdfButton({
  reportId,
}: {
  reportId: string
}) {
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState<string | null>(null)

  const handleClick = async () => {
    setLoading(true)
    setMessage(null)

    try {
      const res = await fetch("/api/trigger-inspection", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          report_id: reportId,
        }),
      })

      const data = (await res.json()) as Record<string, unknown>

      console.log("RESULT:", data)

      const signed =
        typeof data.signed_url === "string" ? data.signed_url : null
      if (res.ok && signed) {
        window.open(signed, "_blank")
        setMessage("PDF prêt — nouvel onglet ouvert.")
        return
      }

      if (res.ok && data.success === false) {
        setMessage(
          typeof data.error === "string"
            ? data.error
            : "La génération PDF a échoué.",
        )
        return
      }

      const err = pickError(data)
      setMessage(
        err ??
          (res.ok
            ? "Réponse inattendue du serveur."
            : `Erreur ${res.status}`),
      )
    } catch (err) {
      console.error("ERROR:", err)
      setMessage("Erreur réseau ou réponse invalide.")
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <button
        type="button"
        onClick={handleClick}
        disabled={loading}
        className="rounded border border-foreground/20 px-3 py-2 text-sm hover:bg-foreground/5 disabled:opacity-50"
      >
        {loading ? "Génération..." : "Générer PDF"}
      </button>
      {message ? (
        <p
          className={`text-sm ${message.includes("prêt") ? "text-green-700 dark:text-green-400" : "text-red-600 dark:text-red-400"}`}
        >
          {message}
        </p>
      ) : null}
    </div>
  )
}
