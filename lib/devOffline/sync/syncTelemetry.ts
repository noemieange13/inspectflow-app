export type SyncTelemetry = {
  runs: number;
  items_processed: number;
  items_synced: number;
  items_skipped: number;
  items_retried: number;
  items_failed: number;
  items_conflict: number;
  last_run_at: string | null;
  last_error: string | null;
};

function emptyTelemetry(): SyncTelemetry {
  return {
    runs: 0,
    items_processed: 0,
    items_synced: 0,
    items_skipped: 0,
    items_retried: 0,
    items_failed: 0,
    items_conflict: 0,
    last_run_at: null,
    last_error: null,
  };
}

let telemetry: SyncTelemetry = emptyTelemetry();

export function getSyncTelemetry(): SyncTelemetry {
  return { ...telemetry };
}

export function resetSyncTelemetry(): void {
  telemetry = emptyTelemetry();
}

export function recordSyncRun(summary: {
  processed: number;
  synced: number;
  skipped: number;
  retried: number;
  failed: number;
  conflicts: number;
  error?: string | null;
}): void {
  telemetry.runs += 1;
  telemetry.items_processed += summary.processed;
  telemetry.items_synced += summary.synced;
  telemetry.items_skipped += summary.skipped;
  telemetry.items_retried += summary.retried;
  telemetry.items_failed += summary.failed;
  telemetry.items_conflict += summary.conflicts;
  telemetry.last_run_at = new Date().toISOString();
  if (summary.error) {
    telemetry.last_error = summary.error;
  }
}
