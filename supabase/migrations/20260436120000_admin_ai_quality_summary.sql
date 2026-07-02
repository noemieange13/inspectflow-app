-- Phase 4B — agrégats qualité IA (admin / service role uniquement, pas d'affichage client).

create or replace view public.admin_ai_quality_summary as
with base as (
  select
    f.*,
    coalesce(f.inspection_id, f.report_id) as inspection_key,
    coalesce(f.original_ai ->> 'system', 'general') as system_raw
  from public.inspection_ai_feedback f
),
ai_suggestions as (
  select * from base where original_ai is not null
),
inspections as (
  select count(distinct inspection_key)::numeric as inspection_count from base
),
rates as (
  select
    (select count(*) from base)::bigint as total_events,
    (select count(*) from ai_suggestions)::bigint as ai_suggestion_count,
    (select count(*) from base where change_type = 'accepted')::bigint as accepted_count,
    (select count(*) from base where change_type = 'deleted')::bigint as deleted_count,
    (select count(*) from base where change_type = 'added_manual')::bigint as manual_additions,
    (
      select count(*)
      from base
      where original_ai is not null
        and inspector_final is not null
        and (original_ai ->> 'severity') = (inspector_final ->> 'severity')
    )::bigint as severity_matches,
    (
      select count(*)
      from base
      where original_ai is not null
        and inspector_final is not null
        and (original_ai ->> 'severity') is not null
        and (inspector_final ->> 'severity') is not null
    )::bigint as severity_comparable
)
select
  r.total_events,
  case
    when r.ai_suggestion_count > 0
      then round(r.accepted_count::numeric / r.ai_suggestion_count, 4)
    else 0
  end as acceptance_rate,
  case
    when r.ai_suggestion_count > 0
      then round(r.deleted_count::numeric / r.ai_suggestion_count, 4)
    else 0
  end as false_positive_rate,
  case
    when i.inspection_count > 0
      then round(r.manual_additions::numeric / i.inspection_count, 4)
    else 0
  end as missed_issue_rate,
  case
    when r.severity_comparable > 0
      then round(r.severity_matches::numeric / r.severity_comparable, 4)
    else 0
  end as severity_accuracy,
  (
    select coalesce(
      jsonb_object_agg(system_key, stats order by system_key),
      '{}'::jsonb
    )
    from (
      select
        case lower(system_raw)
          when 'electricite' then 'electrical'
          when 'plomberie' then 'plumbing'
          when 'structure' then 'structural'
          when 'toiture' then 'roofing'
          when 'chauffage' then 'heating'
          when 'isolation' then 'insulation'
          else lower(system_raw)
        end as system_key,
        jsonb_build_object(
          'accepted',
          count(*) filter (where change_type = 'accepted'),
          'corrected',
          count(*) filter (where change_type in ('edited_text', 'changed_severity')),
          'false_positive',
          count(*) filter (where change_type = 'deleted')
        ) as stats
      from ai_suggestions
      group by 1
    ) s
  ) as by_system,
  (
    select coalesce(jsonb_agg(system_key order by corrections desc), '[]'::jsonb)
    from (
      select
        case lower(system_raw)
          when 'electricite' then 'electrical'
          when 'plomberie' then 'plumbing'
          when 'structure' then 'structural'
          when 'toiture' then 'roofing'
          when 'chauffage' then 'heating'
          when 'isolation' then 'isolation'
          else lower(system_raw)
        end as system_key,
        count(*) filter (
          where change_type in ('edited_text', 'changed_severity', 'deleted')
        ) as corrections
      from ai_suggestions
      group by 1
      having count(*) filter (
        where change_type in ('edited_text', 'changed_severity', 'deleted')
      ) >= 2
    ) t
  ) as improvement_targets
from rates r
cross join inspections i;

comment on view public.admin_ai_quality_summary is
  'Métriques qualité IA agrégées (admin). Lecture service_role uniquement — jamais exposé client.';

revoke all on public.admin_ai_quality_summary from public;
grant select on public.admin_ai_quality_summary to service_role;
grant select on public.admin_ai_quality_summary to postgres;
