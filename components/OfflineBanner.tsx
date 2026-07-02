"use client";

import { useEffect, useState } from "react";

interface OfflineBannerProps {
  isOnline: boolean;
  wasOffline: boolean;
  syncStatus: "idle" | "syncing" | "synced";
  pendingSyncCount: number;
}

/**
 * Thin status strip displayed at the very top of the inspection form.
 * - Offline  → amber strip
 * - Coming back online / syncing → blue strip
 * - Synced   → green strip (auto-hides after 4 s)
 */
export default function OfflineBanner({
  isOnline,
  wasOffline,
  syncStatus,
  pendingSyncCount,
}: OfflineBannerProps) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (!isOnline || wasOffline || syncStatus === "syncing") {
      setVisible(true);
    } else if (syncStatus === "synced") {
      setVisible(true);
      const t = setTimeout(() => setVisible(false), 4_000);
      return () => clearTimeout(t);
    } else {
      setVisible(false);
    }
  }, [isOnline, wasOffline, syncStatus]);

  if (!visible) return null;

  if (!isOnline) {
    return (
      <div
        role="status"
        aria-live="polite"
        className="mb-3 flex items-center gap-2 rounded-lg bg-amber-50 border border-amber-200 px-4 py-2.5 text-sm text-amber-800"
      >
        <span className="text-base">⚡</span>
        <span className="font-medium">Mode hors-ligne</span>
        <span className="text-amber-600">
          — vos données sont sauvegardées localement
          {pendingSyncCount > 0 && (
            <span className="ml-1 font-semibold">
              ({pendingSyncCount} élément
              {pendingSyncCount > 1 ? "s" : ""} en attente)
            </span>
          )}
        </span>
      </div>
    );
  }

  if (syncStatus === "syncing" || wasOffline) {
    return (
      <div
        role="status"
        aria-live="polite"
        className="mb-3 flex items-center gap-2 rounded-lg bg-blue-50 border border-blue-200 px-4 py-2.5 text-sm text-blue-800"
      >
        <span className="inline-block animate-spin text-base">↻</span>
        <span>
          Connexion rétablie —{" "}
          <span className="font-medium">synchronisation en cours…</span>
        </span>
      </div>
    );
  }

  if (syncStatus === "synced") {
    return (
      <div
        role="status"
        aria-live="polite"
        className="mb-3 flex items-center gap-2 rounded-lg bg-green-50 border border-green-200 px-4 py-2.5 text-sm text-green-800"
      >
        <span className="text-base">✓</span>
        <span>
          Synchronisation terminée —{" "}
          <span className="font-medium">
            données et photos classifiées.
          </span>
        </span>
      </div>
    );
  }

  return null;
}
