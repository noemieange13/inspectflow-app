-- Numéros de version atomiques (trigger : le client Supabase ne partage pas une TX entre RPC et insert).
-- Lien optionnel vers le ledger cryptographique + pointeur rapide sur la dernière version.

-- 1) Valeur par défaut pour laisser le trigger attribuer le prochain numéro (écrase toute valeur client).
alter table public.report_versions
  alter column version_number set default -1;

create or replace function public.report_versions_assign_number()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_next integer;
begin
  if not exists (select 1 from public.reports r where r.id = new.report_id) then
    raise exception 'report not found: %', new.report_id;
  end if;

  -- Sérialise les insertions de versions pour ce rapport (aligné sur append_event).
  perform pg_advisory_xact_lock(
    hashtext(substring(new.report_id::text, 1, 18)),
    hashtext(substring(new.report_id::text, 19, 18))
  );

  perform 1 from public.reports where id = new.report_id for update;

  select coalesce(max(v.version_number), 0) + 1 into v_next
  from public.report_versions v
  where v.report_id = new.report_id;

  new.version_number := v_next;
  return new;
end;
$$;

drop trigger if exists report_versions_assign_number on public.report_versions;
create trigger report_versions_assign_number
  before insert on public.report_versions
  for each row
  execute function public.report_versions_assign_number();

comment on function public.report_versions_assign_number() is
  'Attribue version_number = MAX+1 sous verrou (évite les courses côté API).';

-- 2) RPC optionnelle (même logique que le trigger, utile pour diagnostics / scripts).
create or replace function public.next_report_version(p_report_id uuid)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_next integer;
begin
  if not exists (select 1 from public.reports r where r.id = p_report_id) then
    raise exception 'report not found: %', p_report_id;
  end if;

  perform pg_advisory_xact_lock(
    hashtext(substring(p_report_id::text, 1, 18)),
    hashtext(substring(p_report_id::text, 19, 18))
  );

  perform 1 from public.reports where id = p_report_id for update;

  select coalesce(max(v.version_number), 0) + 1 into v_next
  from public.report_versions v
  where v.report_id = p_report_id;

  return v_next;
end;
$$;

revoke all on function public.next_report_version(uuid) from public;
grant execute on function public.next_report_version(uuid) to service_role;

comment on function public.next_report_version(uuid) is
  'Retourne le prochain version_number (sans insert). Préférer le trigger pour l’atomicité insert.';

-- 3) Ancrage ledger + statut d’audit
alter table public.report_versions
  add column if not exists ledger_event_id uuid references public.report_events (id) on delete set null;

alter table public.report_versions
  add column if not exists audit_status text not null default 'partial'
  constraint report_versions_audit_status_chk check (audit_status in ('complete', 'partial'));

comment on column public.report_versions.ledger_event_id is
  'Lien vers public.report_events (append_event) — ancrage cryptographique du snapshot.';

comment on column public.report_versions.audit_status is
  'complete = événement ledger écrit ; partial = snapshot seul (ledger indisponible ou erreur).';

-- 4) Pointeur « vérité courante » (mis à jour par l’app à chaque nouvelle version / restore)
alter table public.reports
  add column if not exists current_version_id uuid references public.report_versions (id) on delete set null;

comment on column public.reports.current_version_id is
  'Dernière entrée report_versions connue comme état courant du payload (évite un MAX runtime).';

-- Backfill : dernière version par rapport + historique sans ledger = partial
update public.report_versions v
set audit_status = 'partial'
where v.ledger_event_id is null;

update public.reports r
set current_version_id = s.id
from (
  select distinct on (report_id)
    report_id,
    id
  from public.report_versions
  order by report_id, version_number desc
) s
where r.id = s.report_id
  and (r.current_version_id is distinct from s.id);

revoke all on function public.report_versions_assign_number() from public;
