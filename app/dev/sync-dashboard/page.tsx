import { notFound } from "next/navigation";

import { SyncDashboardClient } from "./SyncDashboardClient";

/** Dev only — synchronization runtime dashboard (Phase 9J). */
export default function SyncDashboardDevPage() {
  if (process.env.NODE_ENV !== "development") {
    notFound();
  }

  return (
    <main className="mx-auto max-w-5xl p-8">
      <h1 className="mb-2 text-lg font-semibold">Dev — Sync Dashboard (9J)</h1>
      <p className="mb-6 text-sm text-foreground/70">
        Offline synchronization runtime: worker health, queue, metrics, conflicts, and
        structured logs. Development only — never available in production.
      </p>
      <SyncDashboardClient />
    </main>
  );
}
