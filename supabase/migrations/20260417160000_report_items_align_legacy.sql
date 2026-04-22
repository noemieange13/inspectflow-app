-- Si `report_items` a été créée avant la migration defect_classification (ou à la main),
-- `CREATE TABLE IF NOT EXISTS` ne rajoute pas les colonnes manquantes — alignement sûr pour la suite (RPC / index).

alter table public.report_items add column if not exists section text not null default '—';
alter table public.report_items add column if not exists severity text not null default 'medium';
alter table public.report_items add column if not exists title text not null default '';
alter table public.report_items add column if not exists description text;
alter table public.report_items add column if not exists recommendation text;
alter table public.report_items add column if not exists created_at timestamptz not null default now();
