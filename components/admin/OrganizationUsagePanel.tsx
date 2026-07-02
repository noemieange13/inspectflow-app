import type { OrganizationBillingSnapshot } from "@/lib/billing";

import ManageSubscriptionPanel from "./ManageSubscriptionPanel";

function formatPct(value: number | null | undefined): string {
  if (value === null || value === undefined) return "∞";
  return `${value}%`;
}

function formatLimit(limit: number | null | undefined): string {
  if (limit === null || limit === undefined || limit < 0) return "∞";
  return String(limit);
}

const BILLING_STATUS_LABEL: Record<string, string> = {
  trial: "Essai",
  active: "Actif",
  past_due: "En retard",
  cancelled: "Annulé",
};

export default function OrganizationUsagePanel({
  snapshots,
  accessToken,
}: {
  snapshots: OrganizationBillingSnapshot[];
  accessToken?: string;
}) {
  if (snapshots.length === 0) {
    return (
      <p className="rounded-lg border border-slate-200 bg-white px-4 py-6 text-sm text-slate-600">
        Aucune organisation trouvée.
      </p>
    );
  }

  return (
    <div className="space-y-4">
      {snapshots.map((snap) => {
        const usage = snap.usage;
        return (
          <section
            key={snap.organization_id}
            className="rounded-lg border border-slate-200 bg-white p-4 text-sm"
          >
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="font-semibold text-slate-900">
                <span className="font-mono text-xs text-slate-500">{snap.organization_id}</span>
              </h2>
              <div className="flex flex-wrap gap-2">
                <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium uppercase text-slate-700">
                  Plan {snap.current_plan}
                </span>
                <span
                  className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                    snap.computed_billing_status === "past_due"
                      ? "bg-amber-100 text-amber-900"
                      : snap.computed_billing_status === "trial"
                        ? "bg-blue-100 text-blue-900"
                        : "bg-emerald-100 text-emerald-900"
                  }`}
                >
                  {BILLING_STATUS_LABEL[snap.computed_billing_status] ??
                    snap.computed_billing_status}
                </span>
                {snap.upgrade_recommended ? (
                  <span className="rounded-full bg-violet-100 px-2 py-0.5 text-xs font-medium text-violet-900">
                    Upgrade recommandé
                  </span>
                ) : null}
              </div>
            </div>

            <div className="mt-2 grid gap-2 text-xs text-slate-600 sm:grid-cols-3">
              <p>
                <span className="font-medium text-slate-800">Utilisation max : </span>
                {snap.usage_percentage != null ? `${snap.usage_percentage}%` : "—"}
              </p>
              <p>
                <span className="font-medium text-slate-800">Jours restants essai : </span>
                {snap.days_remaining_trial != null ? snap.days_remaining_trial : "—"}
              </p>
              <p>
                <span className="font-medium text-slate-800">Fin essai : </span>
                {snap.trial_ends_at ? snap.trial_ends_at.slice(0, 10) : "—"}
              </p>
            </div>

            <p className="mt-1 text-xs text-slate-500">
              Période {usage.period_start.slice(0, 10)} → {usage.period_end.slice(0, 10)}
              {snap.monitor_only ? " · monitor_only" : ""}
            </p>

            <ManageSubscriptionPanel
              organizationId={snap.organization_id}
              accessToken={accessToken}
              currentPlan={snap.current_plan}
            />

            <div className="mt-3 overflow-x-auto">
              <table className="w-full min-w-[480px] border-collapse text-left">
                <thead>
                  <tr className="border-b border-slate-200 text-xs text-slate-500">
                    <th className="py-1 pr-3 font-medium">Métrique</th>
                    <th className="py-1 pr-3 font-medium">Usage</th>
                    <th className="py-1 pr-3 font-medium">Limite</th>
                    <th className="py-1 font-medium">% limite</th>
                  </tr>
                </thead>
                <tbody className="text-slate-800">
                  <tr className="border-b border-slate-100">
                    <td className="py-1.5 pr-3">Inspections</td>
                    <td className="py-1.5 pr-3 tabular-nums">{usage.usage.inspections_created}</td>
                    <td className="py-1.5 pr-3 tabular-nums">
                      {formatLimit(usage.limits.inspections_per_month)}
                    </td>
                    <td className="py-1.5 tabular-nums">
                      {formatPct(usage.usage_percent.inspections_per_month)}
                    </td>
                  </tr>
                  <tr className="border-b border-slate-100">
                    <td className="py-1.5 pr-3">Photos IA</td>
                    <td className="py-1.5 pr-3 tabular-nums">{usage.usage.ai_photos_processed}</td>
                    <td className="py-1.5 pr-3 tabular-nums">
                      {formatLimit(usage.limits.ai_photos_per_month)}
                    </td>
                    <td className="py-1.5 tabular-nums">
                      {formatPct(usage.usage_percent.ai_photos_per_month)}
                    </td>
                  </tr>
                  <tr className="border-b border-slate-100">
                    <td className="py-1.5 pr-3">Photos uploadées</td>
                    <td className="py-1.5 pr-3 tabular-nums">{usage.usage.photos_uploaded}</td>
                    <td className="py-1.5 pr-3 tabular-nums">—</td>
                    <td className="py-1.5 tabular-nums">—</td>
                  </tr>
                  <tr className="border-b border-slate-100">
                    <td className="py-1.5 pr-3">PDF générés</td>
                    <td className="py-1.5 pr-3 tabular-nums">{usage.usage.pdf_generated}</td>
                    <td className="py-1.5 pr-3 tabular-nums">—</td>
                    <td className="py-1.5 tabular-nums">—</td>
                  </tr>
                  <tr>
                    <td className="py-1.5 pr-3">Stockage (Mo)</td>
                    <td className="py-1.5 pr-3 tabular-nums">
                      {usage.usage.storage_used_mb.toFixed(2)}
                    </td>
                    <td className="py-1.5 pr-3 tabular-nums">
                      {usage.limits.storage_gb === null || usage.limits.storage_gb < 0
                        ? "∞"
                        : `${(usage.limits.storage_gb * 1024).toFixed(0)} Mo`}
                    </td>
                    <td className="py-1.5 tabular-nums">
                      {formatPct(usage.usage_percent.storage_gb)}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </section>
        );
      })}
    </div>
  );
}
