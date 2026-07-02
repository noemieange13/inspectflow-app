"use client";

import type { InspectionHealthStatus } from "@/lib/inspection_health_engine";

const STATUS_STYLES = {
  ready: {
    border: "border-emerald-200",
    bg: "bg-emerald-50",
    title: "text-emerald-950",
    badge: "bg-emerald-100 text-emerald-900",
    label: "Prêt pour livraison",
  },
  warning: {
    border: "border-amber-200",
    bg: "bg-amber-50",
    title: "text-amber-950",
    badge: "bg-amber-100 text-amber-900",
    label: "Rapport possible — vérifications recommandées",
  },
  blocked: {
    border: "border-rose-200",
    bg: "bg-rose-50",
    title: "text-rose-950",
    badge: "bg-rose-100 text-rose-900",
    label: "Livraison à risque — actions requises",
  },
} as const;

export default function InspectionHealthPanel({
  health,
  loading,
}: {
  health: InspectionHealthStatus | null;
  loading?: boolean;
}) {
  if (loading) {
    return (
      <div className="mb-3 h-20 animate-pulse rounded-lg border border-slate-200 bg-slate-50" />
    );
  }
  if (!health) return null;

  const styles = STATUS_STYLES[health.status];

  return (
    <div className={`mb-3 rounded-lg border px-3 py-2 ${styles.border} ${styles.bg}`}>
      <div className="flex flex-wrap items-center gap-2">
        <p className={`text-sm font-semibold ${styles.title}`}>Santé inspection</p>
        <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${styles.badge}`}>
          {styles.label}
        </span>
      </div>

      <ul className="mt-2 grid gap-1 text-xs text-slate-700 sm:grid-cols-2">
        <li>{health.checks.photos_uploaded ? "✔" : "○"} Photos téléversées</li>
        <li>{health.checks.photo_analysis_complete ? "✔" : "○"} Analyse photo terminée</li>
        <li>{health.checks.failed_analysis_jobs ? "⚠" : "✔"} Jobs analyse (échecs)</li>
        <li>{health.checks.ai_review_complete ? "✔" : "○"} Constats IA révisés</li>
        <li>{health.checks.compliance_validated ? "✔" : "○"} Conformité validée</li>
        <li>{health.checks.pdf_ready ? "✔" : "○"} PDF prêt</li>
      </ul>

      {health.actions_required.length > 0 ? (
        <ul className="mt-2 space-y-1 text-xs text-slate-800">
          {health.actions_required.map((action) => (
            <li key={action.id}>→ {action.label_fr}</li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
