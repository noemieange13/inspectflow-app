-- Où est créée la ligne public.reports ? (Supabase SQL Editor)
-- Ce dépôt Next/Edge ne contient pas de .from("reports").insert — à exécuter sur la DB réelle.

-- 1) Triggers sur la table reports
select t.tgname,
       pg_get_triggerdef(t.oid, true) as definition
from pg_trigger t
join pg_class c on c.oid = t.tgrelid
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public'
  and c.relname = 'reports'
  and not t.tgisinternal
order by t.tgname;

-- 2) Règles (rules) — rare mais possible
select *
from pg_rules
where schemaname = 'public' and tablename = 'reports';

-- 3) Vue matérialisée / vue qui INSERT ? — inspection manuelle des définitions
select table_name, view_definition
from information_schema.views
where table_schema = 'public'
  and view_definition ilike '%insert%reports%';
