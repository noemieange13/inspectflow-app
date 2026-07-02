import { isDevAuthBypass } from "@/lib/devInspectorMode";

import { formatApiErrorMessage, isSupabaseNetworkError } from "./errors";
import { shouldUseOfflineDevStore } from "./probe";

export type OfflineDevFallbackResult<T> =
  | { kind: "offline"; value: T }
  | { kind: "online"; value: T }
  | { kind: "error"; error: unknown };

/**
 * Dev-only: probe for offline store, run online work, or fall back on network failure.
 * Production always executes `runOnline` only.
 */
export async function withOfflineDevFallback<T>(options: {
  runOnline: () => Promise<T>;
  runOffline: () => Promise<T>;
  forceOffline?: () => Promise<boolean>;
}): Promise<OfflineDevFallbackResult<T>> {
  if (!isDevAuthBypass()) {
    try {
      return { kind: "online", value: await options.runOnline() };
    } catch (error) {
      return { kind: "error", error };
    }
  }

  const shouldOffline = options.forceOffline ?? shouldUseOfflineDevStore;
  if (await shouldOffline()) {
    try {
      return { kind: "offline", value: await options.runOffline() };
    } catch (error) {
      return { kind: "error", error: formatApiErrorMessage(error) };
    }
  }

  try {
    return { kind: "online", value: await options.runOnline() };
  } catch (error) {
    if (isSupabaseNetworkError(error) || (await shouldUseOfflineDevStore())) {
      try {
        return { kind: "offline", value: await options.runOffline() };
      } catch (offlineError) {
        return { kind: "error", error: formatApiErrorMessage(offlineError) };
      }
    }
    return { kind: "error", error: formatApiErrorMessage(error) };
  }
}
