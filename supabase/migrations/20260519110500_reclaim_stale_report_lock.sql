-- Reprend automatiquement un verrou PDF resté bloqué après arrêt brutal de l'Edge Function.
-- Le finally de reports-pdf libère les verrous en erreur normale, mais il ne s'exécute pas
-- si l'isolate est tué (timeout plateforme, OOM, déploiement).

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
    and (
      r.generating is not true
      or r.generating_at is null
      or r.generating_at < now() - interval '10 minutes'
    )
  returning r.id into v_updated;

  if v_updated is not null then
    return 'claimed';
  end if;

  return 'already_generating';
end;
$$;

comment on function public.claim_report_lock(uuid) is
  'claimed = verrou pris ou stale repris ; already_generating = autre exécution récente en cours ; not_found = rapport absent.';

grant execute on function public.claim_report_lock(uuid) to service_role;
grant execute on function public.claim_report_lock(uuid) to authenticated;
