-- Classification de défauts (IA) — items par rapport + journal des runs.
-- Les écritures applicatives passent par la service role (Next) ; RLS pour accès direct authentifié.

create table if not exists public.report_items (
  id uuid primary key default gen_random_uuid(),
  report_id uuid not null references public.reports (id) on delete cascade,
  section text not null,
  severity text not null check (severity in ('low', 'medium', 'high')),
  title text not null,
  description text,
  recommendation text,
  created_at timestamptz not null default now()
);

create index if not exists idx_report_items_report_id on public.report_items (report_id);

create table if not exists public.defect_classifications (
  id uuid primary key default gen_random_uuid(),
  report_id uuid not null references public.reports (id) on delete cascade,
  status text not null,
  model_name text,
  prompt_version int not null default 1,
  input_hash text,
  output_hash text,
  result jsonb,
  ai_failure_reason text,
  created_at timestamptz not null default now()
);

create index if not exists idx_defect_classifications_report_id
  on public.defect_classifications (report_id);

comment on table public.report_items is 'Défauts classés par l’IA (V1 sans template), liés au rapport.';
comment on table public.defect_classifications is 'Journal des runs de classification IA (succès / raison d’échec).';

alter table public.report_items enable row level security;
alter table public.defect_classifications enable row level security;

-- Lecture / écriture : propriétaire du rapport (user_id sur public.reports).
create policy "report_items_select_own"
  on public.report_items for select to authenticated
  using (
    exists (
      select 1 from public.reports r
      where r.id = report_items.report_id and r.user_id = auth.uid()
    )
  );

create policy "report_items_modify_own"
  on public.report_items for all to authenticated
  using (
    exists (
      select 1 from public.reports r
      where r.id = report_items.report_id and r.user_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from public.reports r
      where r.id = report_items.report_id and r.user_id = auth.uid()
    )
  );

create policy "defect_classifications_select_own"
  on public.defect_classifications for select to authenticated
  using (
    exists (
      select 1 from public.reports r
      where r.id = defect_classifications.report_id and r.user_id = auth.uid()
    )
  );

create policy "defect_classifications_modify_own"
  on public.defect_classifications for all to authenticated
  using (
    exists (
      select 1 from public.reports r
      where r.id = defect_classifications.report_id and r.user_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from public.reports r
      where r.id = defect_classifications.report_id and r.user_id = auth.uid()
    )
  );
