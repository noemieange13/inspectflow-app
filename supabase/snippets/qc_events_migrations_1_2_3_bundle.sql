-- BUNDLE : migrations qc_events 1 + 2 + 3 (ordre strict).
-- Migration 1 : declare applied_sid text (requis PL/pgSQL pour FOR ... IN SELECT une colonne).
-- Exécuter dans Supabase SQL Editor : coller TOUT le fichier, pas seulement le nom.
--
-- Pipeline QC + Copilot IA : événements persistés, stats par suggestion (clé stable), vues KPI.
-- Insertion côté app via route Next + service role (validation jeton rapport).

create table if not exists public.qc_events (
  id uuid primary key default gen_random_uuid(),
  report_id uuid not null references public.reports (id) on delete cascade,
  event_name text not null,
  ruleset_id text,
  suggestion_id text,
  payload jsonb not null default '{}'::jsonb,
  before_state jsonb,
  after_state jsonb,
  created_at timestamptz not null default now()
);

create index if not exists qc_events_report_created_idx
  on public.qc_events (report_id, created_at desc);

create index if not exists qc_events_event_name_created_idx
  on public.qc_events (event_name, created_at desc);

comment on table public.qc_events is
  'Événements QC et Copilot (qc_certification_checked, qc_ai_*). suggestion_id = clé stats stable (code|system|…).';

create table if not exists public.qc_ai_suggestion_stats (
  suggestion_id text primary key,
  code text,
  system text,
  shown_count int not null default 0,
  applied_count int not null default 0,
  rejected_count int not null default 0,
  success_after_apply int not null default 0,
  disabled boolean not null default false,
  last_updated timestamptz not null default now()
);

comment on table public.qc_ai_suggestion_stats is
  'Agrégats par clé de suggestion (stable). Mis à jour par trigger sur qc_events.';

create or replace function public.qc_events_recompute_disabled(p_suggestion_id text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  s record;
  rej float;
begin
  select * into s from public.qc_ai_suggestion_stats where suggestion_id = p_suggestion_id;
  if not found then
    return;
  end if;
  if s.shown_count < 8 then
    update public.qc_ai_suggestion_stats set disabled = false, last_updated = now()
    where suggestion_id = p_suggestion_id;
    return;
  end if;
  rej := s.rejected_count::float / greatest(s.shown_count, 1);
  update public.qc_ai_suggestion_stats
  set disabled = (rej > 0.6), last_updated = now()
  where suggestion_id = p_suggestion_id;
end;
$$;

create or replace function public.qc_events_after_insert()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  sid text;
  c text;
  sys text;
  prev_valid text;
  applied_sid text;
begin
  sid := nullif(trim(coalesce(NEW.suggestion_id, '')), '');
  c := nullif(trim(coalesce(NEW.payload->>'code', '')), '');
  sys := nullif(trim(coalesce(NEW.payload->>'system', '')), '');

  if NEW.event_name = 'qc_ai_suggestion_shown' and sid is not null then
    insert into public.qc_ai_suggestion_stats as s (suggestion_id, code, system, shown_count, last_updated)
    values (sid, c, sys, 1, now())
    on conflict (suggestion_id) do update set
      shown_count = s.shown_count + 1,
      code = coalesce(excluded.code, s.code),
      system = coalesce(excluded.system, s.system),
      last_updated = now();
    perform public.qc_events_recompute_disabled(sid);

  elsif NEW.event_name = 'qc_ai_suggestion_applied' and sid is not null then
    insert into public.qc_ai_suggestion_stats as s (suggestion_id, code, system, applied_count, last_updated)
    values (sid, c, sys, 1, now())
    on conflict (suggestion_id) do update set
      applied_count = s.applied_count + 1,
      code = coalesce(excluded.code, s.code),
      system = coalesce(excluded.system, s.system),
      last_updated = now();
    perform public.qc_events_recompute_disabled(sid);

  elsif NEW.event_name = 'qc_ai_suggestion_rejected' and sid is not null then
    insert into public.qc_ai_suggestion_stats as s (suggestion_id, code, system, rejected_count, last_updated)
    values (sid, c, sys, 1, now())
    on conflict (suggestion_id) do update set
      rejected_count = s.rejected_count + 1,
      code = coalesce(excluded.code, s.code),
      system = coalesce(excluded.system, s.system),
      last_updated = now();
    perform public.qc_events_recompute_disabled(sid);

  elsif NEW.event_name = 'qc_certification_checked'
    and coalesce(NEW.payload->>'is_valid', '') = 'true' then

    select payload->>'is_valid' into prev_valid
    from public.qc_events
    where report_id = NEW.report_id
      and event_name = 'qc_certification_checked'
      and created_at < NEW.created_at
    order by created_at desc
    limit 1;

    if prev_valid = 'true' then
      return NEW;
    end if;

    for applied_sid in
      select distinct suggestion_id
      from public.qc_events
      where report_id = NEW.report_id
        and event_name = 'qc_ai_suggestion_applied'
        and suggestion_id is not null
        and trim(suggestion_id) <> ''
        and created_at < NEW.created_at
        and created_at >= NEW.created_at - interval '14 days'
    loop
      update public.qc_ai_suggestion_stats s
      set success_after_apply = s.success_after_apply + 1, last_updated = now()
      where s.suggestion_id = applied_sid;
    end loop;
  end if;

  return NEW;
end;
$$;

drop trigger if exists qc_events_after_insert_trg on public.qc_events;
create trigger qc_events_after_insert_trg
  after insert on public.qc_events
  for each row execute function public.qc_events_after_insert();

alter table public.qc_events enable row level security;
alter table public.qc_ai_suggestion_stats enable row level security;

-- Pas de policy : lecture/écriture via service role (route Next) uniquement.

create or replace view public.qc_kpis_daily as
select
  date_trunc('day', created_at at time zone 'utc') as day,
  count(*) filter (where event_name = 'qc_certification_checked') as total_checks,
  count(*) filter (
    where event_name = 'qc_certification_checked'
      and coalesce(payload->>'is_valid', '') = 'true'
  ) as valid_reports,
  count(*) filter (where event_name = 'qc_ai_suggestion_shown') as ai_shown,
  count(*) filter (where event_name = 'qc_ai_suggestion_applied') as ai_applied,
  count(*) filter (where event_name = 'qc_ai_suggestion_rejected') as ai_rejected
from public.qc_events
group by 1
order by 1 desc;

create or replace view public.qc_ai_impact as
select
  report_id,
  count(*) filter (where event_name = 'qc_ai_suggestion_applied') as ai_applied,
  max(
    case
      when event_name = 'qc_certification_checked'
        and coalesce(payload->>'is_valid', '') = 'true'
      then 1
      else 0
    end
  ) as became_valid
from public.qc_events
group by report_id;

comment on view public.qc_kpis_daily is 'KPI quotidiens agrégés (événements bruts).';
comment on view public.qc_ai_impact is 'Par rapport : nombre d’applications IA et passage à conforme (au moins un check valide).';
-- Stats QC atomiques (ON CONFLICT), colonnes finales, trigger unique, vues KPI.
-- Migre depuis qc_ai_suggestion_stats (suggestion_id → key) si présent.

do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public'
      and table_name = 'qc_ai_suggestion_stats'
      and column_name = 'suggestion_id'
  ) then
    alter table public.qc_ai_suggestion_stats rename column suggestion_id to key;
  end if;
end $$;

alter table public.qc_ai_suggestion_stats
  add column if not exists last_applied_at timestamptz;

do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public'
      and table_name = 'qc_ai_suggestion_stats'
      and column_name = 'last_updated'
  ) then
    alter table public.qc_ai_suggestion_stats rename column last_updated to updated_at;
  end if;
end $$;

alter table public.qc_ai_suggestion_stats
  alter column updated_at set default now();

-- Anciennes colonnes analytiques (optionnelles) — retirées du modèle final
alter table public.qc_ai_suggestion_stats drop column if exists code;
alter table public.qc_ai_suggestion_stats drop column if exists system;

-- Contrainte nom de table si recréée ailleurs : garantir NOT NULL sur compteurs
alter table public.qc_ai_suggestion_stats
  alter column shown_count set default 0,
  alter column applied_count set default 0,
  alter column rejected_count set default 0,
  alter column success_after_apply set default 0;

drop function if exists public.qc_events_recompute_disabled(text);

create or replace function public.qc_ai_stats_apply_disabled(p_key text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.qc_ai_suggestion_stats s
  set disabled = (
      s.shown_count >= 20
      and (s.rejected_count::float / greatest(s.shown_count, 1)) > 0.6
    ),
    updated_at = now()
  where s.key = p_key;
end;
$$;

create or replace function public.qc_events_after_insert_v2()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  k text;
  ev text;
  prev_valid text;
  applied_key text;
begin
  k := nullif(trim(coalesce(NEW.suggestion_id, '')), '');
  ev := NEW.event_name;

  if ev in ('qc_ai_suggestion_shown', 'qc_ai_suggestion_applied', 'qc_ai_suggestion_rejected')
     and k is not null then

    insert into public.qc_ai_suggestion_stats as s (
      key,
      shown_count,
      applied_count,
      rejected_count,
      success_after_apply,
      last_applied_at,
      updated_at
    )
    values (
      k,
      case when ev = 'qc_ai_suggestion_shown' then 1 else 0 end,
      case when ev = 'qc_ai_suggestion_applied' then 1 else 0 end,
      case when ev = 'qc_ai_suggestion_rejected' then 1 else 0 end,
      0,
      case when ev = 'qc_ai_suggestion_applied' then NEW.created_at else null end,
      now()
    )
    on conflict (key) do update set
      shown_count = s.shown_count + EXCLUDED.shown_count,
      applied_count = s.applied_count + EXCLUDED.applied_count,
      rejected_count = s.rejected_count + EXCLUDED.rejected_count,
      last_applied_at = coalesce(EXCLUDED.last_applied_at, s.last_applied_at),
      updated_at = now();

    perform public.qc_ai_stats_apply_disabled(k);

  elsif ev = 'qc_certification_checked'
    and coalesce(NEW.payload->>'is_valid', '') = 'true' then

    select payload->>'is_valid' into prev_valid
    from public.qc_events
    where report_id = NEW.report_id
      and event_name = 'qc_certification_checked'
      and created_at < NEW.created_at
    order by created_at desc
    limit 1;

    if prev_valid = 'true' then
      return NEW;
    end if;

    for applied_key in
      select distinct suggestion_id
      from public.qc_events
      where report_id = NEW.report_id
        and event_name = 'qc_ai_suggestion_applied'
        and suggestion_id is not null
        and trim(suggestion_id) <> ''
        and created_at < NEW.created_at
        and created_at >= NEW.created_at - interval '14 days'
    loop
      update public.qc_ai_suggestion_stats s
      set success_after_apply = s.success_after_apply + 1,
          updated_at = now()
      where s.key = applied_key
        and s.last_applied_at is not null
        and s.last_applied_at > NEW.created_at - interval '14 days';
    end loop;
  end if;

  return NEW;
end;
$$;

drop trigger if exists qc_events_after_insert_trg on public.qc_events;
create trigger qc_events_after_insert_trg
  after insert on public.qc_events
  for each row execute function public.qc_events_after_insert_v2();

drop view if exists public.qc_ai_impact;

create or replace view public.qc_ai_impact as
select
  s.key,
  s.shown_count,
  s.applied_count,
  s.rejected_count,
  s.success_after_apply,
  s.last_applied_at,
  s.disabled,
  s.updated_at,
  (s.applied_count::float / greatest(s.shown_count, 1)) as adoption_rate,
  (s.success_after_apply::float / greatest(s.applied_count, 1)) as success_rate,
  (s.rejected_count::float / greatest(s.shown_count, 1)) as rejection_rate,
  (
    (s.applied_count::float / greatest(s.shown_count, 1))
    * (s.success_after_apply::float / greatest(s.applied_count, 1))
  ) as impact_score
from public.qc_ai_suggestion_stats s;

comment on view public.qc_ai_impact is
  'Métriques par clé de suggestion (adoption, succès, rejet, impact).';

create or replace view public.qc_ai_report_impact as
select
  report_id,
  count(*) filter (where event_name = 'qc_ai_suggestion_applied') as ai_applied,
  max(
    case
      when event_name = 'qc_certification_checked'
        and coalesce(payload->>'is_valid', '') = 'true'
      then 1
      else 0
    end
  ) as became_valid
from public.qc_events
group by report_id;

comment on view public.qc_ai_report_impact is
  'Par rapport : applications IA et passage conforme (ex-qc_ai_impact par report).';
-- V3 : contexte sur qc_events, stats (key, context_hash), trigger unifié V2 + V3, succès = dernière apply.

alter table public.qc_events
  add column if not exists context jsonb,
  add column if not exists session_id uuid;

comment on column public.qc_events.context is
  'Contexte léger (system, property_type, severity) pour stats segmentées.';
comment on column public.qc_events.session_id is
  'Corrélation session onglet (optionnel).';

create table if not exists public.qc_ai_suggestion_stats_v3 (
  key text not null,
  context_hash text not null,
  shown_count int not null default 0,
  applied_count int not null default 0,
  rejected_count int not null default 0,
  success_after_apply int not null default 0,
  last_applied_at timestamptz,
  disabled boolean not null default false,
  updated_at timestamptz not null default now(),
  primary key (key, context_hash)
);

comment on table public.qc_ai_suggestion_stats_v3 is
  'Stats Copilot par clé de suggestion + hash de contexte (QC V3).';

alter table public.qc_ai_suggestion_stats_v3 enable row level security;

create or replace function public.qc_context_hash(ctx jsonb)
returns text
language sql
immutable
set search_path = public
as $$
  select md5(
    coalesce(ctx->>'system', '') || '|' ||
    coalesce(ctx->>'property_type', '') || '|' ||
    coalesce(ctx->>'severity', '')
  );
$$;

create or replace function public.qc_ai_stats_v3_apply_disabled(p_key text, p_ctx_hash text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.qc_ai_suggestion_stats_v3 s
  set disabled = (
      s.shown_count >= 30
      and (s.rejected_count::float / greatest(s.shown_count, 1)) > 0.6
    ),
    updated_at = now()
  where s.key = p_key
    and s.context_hash = p_ctx_hash;
end;
$$;

-- Remplace V2 : même logique agrégée + branche V3 (context-aware).
create or replace function public.qc_events_after_insert_unified()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  k text;
  ev text;
  prev_valid text;
  applied_key text;
  ctx_hash text;
begin
  k := nullif(trim(coalesce(NEW.suggestion_id, '')), '');
  ev := NEW.event_name;
  ctx_hash := public.qc_context_hash(coalesce(NEW.context, '{}'::jsonb));

  -- ——— V2 (global par key) ———
  if ev in ('qc_ai_suggestion_shown', 'qc_ai_suggestion_applied', 'qc_ai_suggestion_rejected')
     and k is not null then

    insert into public.qc_ai_suggestion_stats as s (
      key,
      shown_count,
      applied_count,
      rejected_count,
      success_after_apply,
      last_applied_at,
      updated_at
    )
    values (
      k,
      case when ev = 'qc_ai_suggestion_shown' then 1 else 0 end,
      case when ev = 'qc_ai_suggestion_applied' then 1 else 0 end,
      case when ev = 'qc_ai_suggestion_rejected' then 1 else 0 end,
      0,
      case when ev = 'qc_ai_suggestion_applied' then NEW.created_at else null end,
      now()
    )
    on conflict (key) do update set
      shown_count = s.shown_count + EXCLUDED.shown_count,
      applied_count = s.applied_count + EXCLUDED.applied_count,
      rejected_count = s.rejected_count + EXCLUDED.rejected_count,
      last_applied_at = coalesce(EXCLUDED.last_applied_at, s.last_applied_at),
      updated_at = now();

    perform public.qc_ai_stats_apply_disabled(k);

    -- ——— V3 (key + context_hash) ———
    insert into public.qc_ai_suggestion_stats_v3 as sv3 (
      key,
      context_hash,
      shown_count,
      applied_count,
      rejected_count,
      success_after_apply,
      last_applied_at,
      updated_at
    )
    values (
      k,
      ctx_hash,
      case when ev = 'qc_ai_suggestion_shown' then 1 else 0 end,
      case when ev = 'qc_ai_suggestion_applied' then 1 else 0 end,
      case when ev = 'qc_ai_suggestion_rejected' then 1 else 0 end,
      0,
      case when ev = 'qc_ai_suggestion_applied' then NEW.created_at else null end,
      now()
    )
    on conflict (key, context_hash) do update set
      shown_count = sv3.shown_count + EXCLUDED.shown_count,
      applied_count = sv3.applied_count + EXCLUDED.applied_count,
      rejected_count = sv3.rejected_count + EXCLUDED.rejected_count,
      last_applied_at = coalesce(EXCLUDED.last_applied_at, sv3.last_applied_at),
      updated_at = now();

    perform public.qc_ai_stats_v3_apply_disabled(k, ctx_hash);

  elsif ev = 'qc_certification_checked'
    and coalesce(NEW.payload->>'is_valid', '') = 'true' then

    select payload->>'is_valid' into prev_valid
    from public.qc_events
    where report_id = NEW.report_id
      and event_name = 'qc_certification_checked'
      and created_at < NEW.created_at
    order by created_at desc
    limit 1;

    if prev_valid = 'true' then
      return NEW;
    end if;

    -- V2 : boucle applies (comportement historique)
    for applied_key in
      select distinct suggestion_id
      from public.qc_events
      where report_id = NEW.report_id
        and event_name = 'qc_ai_suggestion_applied'
        and suggestion_id is not null
        and trim(suggestion_id) <> ''
        and created_at < NEW.created_at
        and created_at >= NEW.created_at - interval '14 days'
    loop
      update public.qc_ai_suggestion_stats s
      set success_after_apply = s.success_after_apply + 1,
          updated_at = now()
      where s.key = applied_key
        and s.last_applied_at is not null
        and s.last_applied_at > NEW.created_at - interval '14 days';
    end loop;

    -- V3 : uniquement la DERNIÈRE apply (fenêtre 14 j)
    update public.qc_ai_suggestion_stats_v3 s
    set success_after_apply = s.success_after_apply + 1,
        updated_at = now()
    from (
      select suggestion_id as k, public.qc_context_hash(coalesce(context, '{}'::jsonb)) as ch
      from public.qc_events
      where report_id = NEW.report_id
        and event_name = 'qc_ai_suggestion_applied'
        and suggestion_id is not null
        and trim(suggestion_id) <> ''
        and created_at < NEW.created_at
        and created_at >= NEW.created_at - interval '14 days'
      order by created_at desc
      limit 1
    ) la
    where s.key = la.k
      and s.context_hash = la.ch
      and s.last_applied_at is not null
      and s.last_applied_at > NEW.created_at - interval '14 days';
  end if;

  return NEW;
end;
$$;

drop trigger if exists qc_events_after_insert_trg on public.qc_events;
drop function if exists public.qc_events_after_insert_v2();

create trigger qc_events_after_insert_trg
  after insert on public.qc_events
  for each row execute function public.qc_events_after_insert_unified();

create or replace view public.qc_ai_impact_v3 as
select
  s.key,
  s.context_hash,
  s.shown_count,
  s.applied_count,
  s.rejected_count,
  s.success_after_apply,
  s.last_applied_at,
  s.disabled,
  s.updated_at,
  (s.applied_count::float / greatest(s.shown_count, 1)) as adoption_rate,
  (s.success_after_apply::float / greatest(s.applied_count, 1)) as success_rate,
  (s.rejected_count::float / greatest(s.shown_count, 1)) as rejection_rate
from public.qc_ai_suggestion_stats_v3 s;

comment on view public.qc_ai_impact_v3 is 'KPI par (key, context_hash).';
