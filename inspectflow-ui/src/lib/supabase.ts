import { createClient } from "@supabase/supabase-js";

const url = import.meta.env.VITE_SUPABASE_URL;
const anon = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!url || !anon) {
  console.warn(
    "[inspectflow-ui] Définis VITE_SUPABASE_URL et VITE_SUPABASE_ANON_KEY dans .env",
  );
}

export const supabase = createClient(url ?? "", anon ?? "");
