"use client";

import { useEffect } from "react";

import { isSteveTestMode, logSteveTestEvent } from "@/lib/steveFieldMode";

type Props = {
  screen: string;
};

/** Dev-only overlay — records screen transitions (no PII). */
export default function SteveTestObserver({ screen }: Props) {
  useEffect(() => {
    if (!isSteveTestMode()) return;
    logSteveTestEvent(screen, "enter");
  }, [screen]);

  if (!isSteveTestMode()) return null;

  return (
    <div
      className="pointer-events-none fixed bottom-2 right-2 z-50 rounded-lg bg-slate-900/80 px-2 py-1 text-[10px] font-mono text-white"
      aria-hidden
    >
      steve:{screen}
    </div>
  );
}
