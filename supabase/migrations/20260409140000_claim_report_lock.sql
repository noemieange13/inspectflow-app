-- Verrou logique pour génération PDF concurrente (Edge Function / worker).
-- claim_report_lock : une seule session "gagne" ; les autres voient already_generating.

alter table public.reports
  add column if not exists generating boolean;

alter table public.reports
  add column if not exists generating_at timestamptz;

comment on column public.reports.generating is 'True pendant une génération PDF en cours.';
comment on column public.reports.generating_at is 'Horodatage du dernier claim (verrou).';

-- Atomique : pas deux générateurs pour le même report (sauf si generating laissé bloqué).
create or replace function public.claim_report_lock(p_report_id uuid)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_updated uuid;
begin
  if not exists (select 1 from public.reports r where r.id = p_report_id) then
    return 'not_found';
  end if;

  update public.reports r
  set
    generating = true,
    generating_at = now()
  where r.id = p_report_id
    and (r.generating is not true)
  returning r.id into v_updated;

  if v_updated is not null then
    return 'claimed';
  end if;

  return 'already_generating';
end;
$$;

comment on function public.claim_report_lock(uuid) is
  'claimed = verrou pris ; already_generating = autre exécution en cours ; not_found = rapport absent.';

grant execute on function public.claim_report_lock(uuid) to service_role;
grant execute on function public.claim_report_lock(uuid) to authenticated;

-- Libération après succès ou échec (à appeler depuis la même fonction / finally) :
-- update public.reports
-- set generating = null, generating_at = null
-- where id = :report_id;
