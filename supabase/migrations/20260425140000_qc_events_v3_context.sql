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
