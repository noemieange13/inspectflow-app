-- Colonnes pour liens /report/[id]?token=...
-- Exécuter dans le SQL Editor Supabase ou via CLI si tu utilises les migrations.

alter table public.reports
  add column if not exists access_token text,
  add column if not exists token_expires_at timestamptz;

comment on column public.reports.access_token is 'Jeton opaque pour accès au viewer PDF (comparaison stricte côté serveur).';
comment on column public.reports.token_expires_at is 'Expiration du jeton ; après cette date, le lien est refusé.';
