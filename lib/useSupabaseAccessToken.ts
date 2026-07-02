"use client";

import { useEffect, useState } from "react";

import { createBrowserSupabaseClient } from "@/lib/supabaseBrowser";

/**
 * Jeton d’accès Supabase courant (si l’utilisateur est connecté côté client).
 * Complète le modèle « jeton rapport » pour les appels API (header Authorization).
 */
export function useSupabaseAccessToken(): string | null {
  const [token, setToken] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const supabase = createBrowserSupabaseClient();

    void supabase.auth.getSession().then(({ data }) => {
      if (!cancelled) {
        setToken(data.session?.access_token ?? null);
      }
    });

    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!cancelled) {
        setToken(session?.access_token ?? null);
      }
    });

    return () => {
      cancelled = true;
      sub.subscription.unsubscribe();
    };
  }, []);

  return token;
}
