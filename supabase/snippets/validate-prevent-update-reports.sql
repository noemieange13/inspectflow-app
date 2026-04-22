-- Validation ciblée : trigger + fonction prevent_update_reports, colonnes reports, clé secours B.
-- À exécuter dans le SQL Editor Supabase (projet / base cible).

-- 1) Migration A présente dans le journal applicatif (nom exact peut varier légèrement selon outil)
select version, name
from supabase_migrations.schema_migrations
where version = '20260418140000'
   or name ilike '%20260418140000%prevent_update%';

-- 2) Triggers sur public.reports qui invoquent prevent_update_reports (pas de colonne schemaname sur pg_trigger)
select
  n.nspname as schema_name,
  c.relname as table_name,
  t.tgname as trigger_name,
  t.tgenabled as enabled,
  pg_get_triggerdef(t.oid, true) as trigger_definition
from pg_trigger t
join pg_class c on c.oid = t.tgrelid
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public'
  and c.relname = 'reports'
  and not t.tgisinternal
  and pg_get_triggerdef(t.oid, true) ilike '%prevent_update_reports%'
order by t.tgname;

-- 3) Définition complète de la fonction (vérifier whitelist is_locked / finalized_at dans le corps)
select pg_get_functiondef(p.oid) as definition
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname = 'prevent_update_reports';

-- 4) Colonnes utiles sur public.reports
select column_name, data_type, is_nullable
from information_schema.columns
where table_schema = 'public'
  and table_name = 'reports'
  and column_name in ('payload', 'is_locked', 'finalized_at', 'pdf_path', 'generating', 'generating_at')
order by column_name;

-- 5) Rapports ayant déjà la clé secours app (option B) dans payload
select count(*)::bigint as reports_with_unlock_key
from public.reports
where payload ? '__inspectflow_unlock_at';

-- 6) Optionnel : un rapport avec la clé (aperçu non destructif)
select id, payload->>'__inspectflow_unlock_at' as unlock_at
from public.reports
where payload ? '__inspectflow_unlock_at'
limit 5;
