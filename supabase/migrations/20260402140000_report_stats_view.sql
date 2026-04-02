-- Agrégations par rapport (lecture recommandée avec service role, voir app/dashboard)
--
-- Si la colonne n'existe pas encore :
-- alter table public.reports add column if not exists created_at timestamptz default now();

create or replace view public.report_stats as
select
  r.id,
  r.created_at,
  count(rv.id) as views,
  min(rv.viewed_at) as first_view,
  max(rv.viewed_at) as last_view
from public.reports r
left join public.report_views rv on rv.report_id = r.id
group by r.id, r.created_at;

comment on view public.report_stats is 'Stats par rapport : vues, première / dernière ouverture.';

grant select on public.report_stats to service_role;
