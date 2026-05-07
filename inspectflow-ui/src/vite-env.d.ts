/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_SUPABASE_URL: string;
  readonly VITE_SUPABASE_ANON_KEY: string;
  /** Base URL du viewer Next/Vercel, sans slash final — ex. https://ton-app.vercel.app */
  readonly VITE_REPORT_VIEWER_BASE_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
