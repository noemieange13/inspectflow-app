"use client";

import { useEffect, useState } from "react";

import { isDevInspectorDashboardMode } from "@/lib/devInspectorMode";

export default function OfflineDevBanner() {
  const devMode = isDevInspectorDashboardMode();
  const [offline, setOffline] = useState(false);

  useEffect(() => {
    if (!devMode) return;
    let cancelled = false;
    void fetch("/api/dev/supabase-health")
      .then((res) => res.json())
      .then((body: { offline_dev?: boolean }) => {
        if (!cancelled) setOffline(body.offline_dev === true);
      })
      .catch(() => {
        if (!cancelled) setOffline(true);
      });
    return () => {
      cancelled = true;
    };
  }, [devMode]);

  if (!devMode || !offline) return null;

  return (
    <div
      className="mb-4 rounded-lg border border-orange-300 bg-orange-50 px-4 py-2 text-center text-sm font-semibold text-orange-900"
      role="status"
    >
      🟠 OFFLINE DEVELOPMENT MODE
      <span className="mt-1 block text-xs font-normal text-orange-800">
        Supabase unavailable. Using local storage.
      </span>
    </div>
  );
}
