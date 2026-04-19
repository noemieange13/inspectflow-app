-- Vue : dernier run *succès* par rapport (journal IA). Utile dashboards / requêtes ad hoc.
-- RPC : état lecture seule pour l’API Next (service_role) — dernier run (tout statut) + items actuels.

create or replace view public.latest_success_defect_run as
select distinct on (dc.report_id)
  dc.report_id,
  dc.id as defect_classification_id,
  dc.status,
  dc.created_at as last_success_at,
  dc.model_name,
  dc.prompt_version,
  dc.output_hash
from public.defect_classifications dc
where dc.status = 'success'
order by dc.report_id, dc.created_at desc;

comment on view public.latest_success_defect_run is
  'Dernier enregistrement de classification IA en statut success par rapport (pas d’historique complet).';

grant select on public.latest_success_defect_run to authenticated, service_role;

create or replace function public.get_report_defect_state(p_report_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  with last_run as (
    select status, created_at
    from public.defect_classifications
    where report_id = p_report_id
    order by created_at desc
    limit 1
  ),
  items_agg as (
    select coalesce(
      jsonb_agg(
        jsonb_build_object(
          'id', ri.id,
          'section', ri.section,
          'severity', ri.severity,
          'title', ri.title,
          'description', ri.description,
          'recommendation', ri.recommendation,
          'created_at', ri.created_at
        )
        order by ri.section asc nulls last, ri.title asc
      ),
      '[]'::jsonb
    ) as j
    from public.report_items ri
    where ri.report_id = p_report_id
  )
  select jsonb_build_object(
    'status', (select lr.status from last_run lr),
    'lastRunAt', (select lr.created_at from last_run lr),
    'items', (select j from items_agg)
  );
$$;

comment on function public.get_report_defect_state(uuid) is
  'Lecture agrégée : dernier run journalisé (tous statuts) + lignes report_items actuelles. Réservé service_role (Next).';

revoke all on function public.get_report_defect_state(uuid) from public;
grant execute on function public.get_report_defect_state(uuid) to service_role;
