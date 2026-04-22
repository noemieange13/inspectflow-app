-- Contrat explicite pour l’UI + grants restrictifs sur la RPC SECURITY DEFINER.
--
-- Sécurité :
-- - La fonction est SECURITY DEFINER (contourne RLS sur defect_classifications / report_items).
-- - Ne jamais accorder EXECUTE à anon/authenticated sans garde-fou applicatif : la clé
--   service_role ne doit être utilisée que côté serveur (Next), qui valide access_token.
-- - Révocation explicite ci-dessous pour éviter tout héritage accidentel (default grants).

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
  last_success as (
    select created_at
    from public.defect_classifications
    where report_id = p_report_id and status = 'success'
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
    'lastSuccessAt', (select ls.created_at from last_success ls),
    'items', (select j from items_agg)
  );
$$;

comment on function public.get_report_defect_state(uuid) is
  'État agrégé pour l’UI : status/lastRunAt = dernier essai (tout statut) ; lastSuccessAt = dernier run success ; items = vérité métier (report_items). SECURITY DEFINER contourne RLS — EXECUTE réservé service_role ; ne pas exposer au client sans contrôle d’accès applicatif.';

revoke all on function public.get_report_defect_state(uuid) from public;
revoke execute on function public.get_report_defect_state(uuid) from anon;
revoke execute on function public.get_report_defect_state(uuid) from authenticated;
grant execute on function public.get_report_defect_state(uuid) to service_role;
