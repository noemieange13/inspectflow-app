-- Libère le verrou posé par claim_report_lock (appelé depuis le finally de reports-pdf).

create or replace function public.release_report_lock(p_report_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.reports r
  set
    generating = null,
    generating_at = null
  where r.id = p_report_id;
end;
$$;

comment on function public.release_report_lock(uuid) is
  'Remet generating / generating_at à NULL après génération PDF (succès ou erreur).';

grant execute on function public.release_report_lock(uuid) to service_role;
