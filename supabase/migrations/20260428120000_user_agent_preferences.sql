-- Préférences inspecteur (agent + mode lecture rapport), synchronisées par utilisateur authentifié.
-- Écriture applicative : routes Next (service role) après validation du jeton `reports.access_token`.
-- Lecture directe Supabase : réservée au propriétaire (RLS).

create table if not exists public.user_agent_preferences (
  user_id uuid primary key references auth.users (id) on delete cascade,
  prefers_short_reports boolean not null default false,
  strict_on_roof boolean not null default false,
  report_view_mode text not null default 'inspector'
    check (report_view_mode in ('inspector', 'buyer')),
  updated_at timestamptz not null default now()
);

comment on table public.user_agent_preferences is
  'Préférences agent InspectFlow (multi-appareil) — clé = auth.users.id, alignée sur reports.user_id.';

create index if not exists user_agent_preferences_updated_at_idx
  on public.user_agent_preferences (updated_at desc);

alter table public.user_agent_preferences enable row level security;

drop policy if exists "user_agent_preferences_select_own" on public.user_agent_preferences;
create policy "user_agent_preferences_select_own"
  on public.user_agent_preferences
  for select
  to authenticated
  using (auth.uid() = user_id);

drop policy if exists "user_agent_preferences_insert_own" on public.user_agent_preferences;
create policy "user_agent_preferences_insert_own"
  on public.user_agent_preferences
  for insert
  to authenticated
  with check (auth.uid() = user_id);

drop policy if exists "user_agent_preferences_update_own" on public.user_agent_preferences;
create policy "user_agent_preferences_update_own"
  on public.user_agent_preferences
  for update
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
