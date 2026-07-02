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

drop view if exists public.qc_ai_impact cascade;

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
