-- Vues de rapports (tracking serveur, après validation du token dans l’app)

create table if not exists public.report_views (
  id uuid primary key default gen_random_uuid(),
  report_id uuid not null references public.reports (id) on delete cascade,
  viewed_at timestamptz not null default now(),
  ip text,
  user_agent text
);

create index if not exists report_views_report_id_idx on public.report_views (report_id);
create index if not exists report_views_viewed_at_idx on public.report_views (viewed_at desc);

comment on table public.report_views is 'Une ligne par ouverture autorisée du viewer PDF (côté serveur).';

alter table public.report_views enable row level security;

-- Insertion depuis le Server Component (clé anon) : à ajuster si tu passes par service role ou RPC.
drop policy if exists "report_views_insert_anon" on public.report_views;
create policy "report_views_insert_anon"
  on public.report_views
  for insert
  to anon
  with check (true);

-- Pas de policy SELECT pour anon : les stats restent côté dashboard / service role.
