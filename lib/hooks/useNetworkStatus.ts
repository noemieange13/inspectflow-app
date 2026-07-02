"use client";

import { useState, useEffect } from "react";

export interface NetworkStatus {
  /** Current online state (reflects navigator.onLine + events). */
  isOnline: boolean;
  /**
   * True for ~5 seconds after the transition offline → online.
   * Use this to trigger a one-shot sync without a permanent effect dependency.
   */
  wasOffline: boolean;
}

/**
 * Tracks navigator.onLine and emits live updates via the browser
 * 'online' / 'offline' events.
 */
export function useNetworkStatus(): NetworkStatus {
  const [isOnline, setIsOnline] = useState(true);
  const [wasOffline, setWasOffline] = useState(false);

  useEffect(() => {
    // Hydrate with the real value (navigator is undefined during SSR)
    setIsOnline(navigator.onLine);

    const handleOnline = () => {
      setIsOnline(true);
      setWasOffline(true);
      // Reset the transient flag after 5 s so consumers don't re-trigger
      setTimeout(() => setWasOffline(false), 5_000);
    };

    const handleOffline = () => {
      setIsOnline(false);
      setWasOffline(false);
    };

    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);

    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, []);

  return { isOnline, wasOffline };
}
