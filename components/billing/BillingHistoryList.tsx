import type { BillingEventRow } from "@/lib/billing/types";
import { formatBillingEventLabel } from "@/lib/billing/billingUx";

function formatDt(iso: string): string {
  try {
    return new Intl.DateTimeFormat("fr-FR", { dateStyle: "medium", timeStyle: "short" }).format(
      new Date(iso),
    );
  } catch {
    return iso;
  }
}

export default function BillingHistoryList({ events }: { events: BillingEventRow[] }) {
  if (events.length === 0) {
    return (
      <p className="text-sm text-slate-500">Aucun événement de facturation enregistré.</p>
    );
  }

  return (
    <ul className="divide-y divide-slate-100 rounded-lg border border-slate-200 bg-white">
      {events.map((event) => (
        <li key={event.id} className="flex flex-wrap items-start justify-between gap-2 px-4 py-3 text-sm">
          <div>
            <p className="font-medium text-slate-900">{formatBillingEventLabel(event)}</p>
            <p className="text-xs text-slate-500">{event.event_type}</p>
          </div>
          <time className="text-xs text-slate-500">{formatDt(event.created_at)}</time>
        </li>
      ))}
    </ul>
  );
}
