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

    select e.payload->>'is_valid' into prev_valid
    from public.qc_events e
    where e.report_id = NEW.report_id
      and e.event_name = 'qc_certification_checked'
      and e.created_at < NEW.created_at
    order by e.created_at desc
    limit 1;

    if prev_valid = 'true' then
      return NEW;
    end if;

    for applied_key in
      select distinct e.suggestion_id
      from public.qc_events e
      where e.report_id = NEW.report_id
        and e.event_name = 'qc_ai_suggestion_applied'
        and e.suggestion_id is not null
        and trim(e.suggestion_id) <> ''
        and e.created_at < NEW.created_at
        and e.created_at >= NEW.created_at - interval '14 days'
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
