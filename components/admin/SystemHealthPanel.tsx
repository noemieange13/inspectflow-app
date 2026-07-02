import type { SystemHealthStatus, SystemSignals } from "@/lib/system_monitoring";

const STATUS_LABEL = {
  healthy: { emoji: "🟢", label: "Healthy", className: "text-emerald-800 bg-emerald-50 border-emerald-200" },
  warning: { emoji: "🟡", label: "Warning", className: "text-amber-900 bg-amber-50 border-amber-200" },
  critical: { emoji: "🔴", label: "Critical", className: "text-rose-900 bg-rose-50 border-rose-200" },
} as const;

function formatDt(iso: string | null | undefined): string {
  if (!iso) return "—";
  try {
    return new Intl.DateTimeFormat("fr-FR", { dateStyle: "short", timeStyle: "short" }).format(
      new Date(iso),
    );
  } catch {
    return iso;
  }
}

export default function SystemHealthPanel({
  health,
  signals,
}: {
  health: SystemHealthStatus;
  signals: SystemSignals;
}) {
  const head = STATUS_LABEL[health.status];

  return (
    <div className="space-y-4">
      <div className={`rounded-xl border px-4 py-3 ${head.className}`}>
        <p className="text-lg font-semibold">
          {head.emoji} {head.label}
        </p>
        <p className="mt-1 text-xs opacity-80">
          Généré le {formatDt(health.generated_at)}
        </p>
      </div>

      {health.issues.length > 0 ? (
        <ul className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800">
          {health.issues.map((issue) => (
            <li key={issue.id} className="py-1">
              <span className="font-medium uppercase text-xs text-slate-500">{issue.severity}</span>
              {" — "}
              {issue.message}
            </li>
          ))}
        </ul>
      ) : null}

      <div className="grid gap-3 md:grid-cols-2">
        <section className="rounded-lg border border-slate-200 bg-white p-3 text-sm">
          <h3 className="font-semibold text-slate-900">Photos — analyse</h3>
          <ul className="mt-2 space-y-1 text-slate-700">
            <li>{signals.photo.completed_jobs_24h} complete (24 h)</li>
            <li>{signals.photo.pending_jobs} pending</li>
            <li>{signals.photo.failed_jobs_24h} failed (24 h)</li>
            <li>Plus ancien pending : {signals.photo.oldest_pending_job_age_minutes} min</li>
          </ul>
        </section>

        <section className="rounded-lg border border-slate-200 bg-white p-3 text-sm">
          <h3 className="font-semibold text-slate-900">IA</h3>
          <ul className="mt-2 space-y-1 text-slate-700">
            <li>Coût aujourd&apos;hui : ${signals.ai.total_cost_today.toFixed(4)}</li>
            <li>Appels vision : {signals.ai.vision_calls_today}</li>
            <li>Coût moyen / inspection : ${signals.ai.average_cost_per_inspection.toFixed(4)}</li>
            <li>Jobs IA échoués (24 h) : {signals.ai.failed_ai_jobs}</li>
          </ul>
        </section>

        <section className="rounded-lg border border-slate-200 bg-white p-3 text-sm">
          <h3 className="font-semibold text-slate-900">PDF</h3>
          <ul className="mt-2 space-y-1 text-slate-700">
            <li>Succès (24 h) : {signals.pdf.pdf_generated_24h}</li>
            <li>Échecs (24 h) : {signals.pdf.pdf_failed_24h}</li>
          </ul>
        </section>

        <section className="rounded-lg border border-slate-200 bg-white p-3 text-sm">
          <h3 className="font-semibold text-slate-900">Système — audit</h3>
          <ul className="mt-2 space-y-1 text-slate-700">
            <li>Dernier événement : {formatDt(signals.audit.last_event_at)}</li>
            <li>Volume 24 h : {signals.audit.events_24h}</li>
          </ul>
        </section>
      </div>
    </div>
  );
}
