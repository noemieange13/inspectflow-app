-- Hardening: only the service role PDF pipeline may claim/release generation locks.
revoke execute on function public.claim_report_lock(uuid) from public;
revoke execute on function public.claim_report_lock(uuid) from anon;
revoke execute on function public.claim_report_lock(uuid) from authenticated;
grant execute on function public.claim_report_lock(uuid) to service_role;

-- Payload updates must not clear an active PDF generation lock. Otherwise a writer can
-- race reports-pdf and publish a payload/PDF pair from different snapshots.
create or replace function public.update_report_payload_with_unlock(
  p_report_id uuid,
  p_payload jsonb,
  p_source text default 'rpc',
  p_clear_pdf_path boolean default false,
  p_allow_unlock boolean default true
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  r public.reports%rowtype;
  did_unlock boolean := false;
begin
  select * into r from public.reports where id = p_report_id for update;
  if not found then
    raise exception 'report not found: %', p_report_id;
  end if;

  if coalesce(r.generating, false) then
    raise exception 'PDF generation in progress'
      using errcode = 'P0001';
  end if;

  if coalesce(r.is_locked, false) then
    if not p_allow_unlock then
      raise exception 'Report is locked'
        using errcode = 'P0001';
    end if;

    update public.reports
    set
      is_locked = false,
      finalized_at = null,
      payload = p_payload,
      pdf_path = case when p_clear_pdf_path then null else pdf_path end
    where id = p_report_id;

    did_unlock := true;
  else
    update public.reports
    set
      payload = p_payload,
      pdf_path = case when p_clear_pdf_path then null else pdf_path end
    where id = p_report_id;
  end if;

  return jsonb_build_object(
    'ok', true,
    'unlocked', did_unlock,
    'source', coalesce(nullif(trim(p_source), ''), 'rpc')
  );
end;
$$;

comment on function public.update_report_payload_with_unlock(uuid, jsonb, text, boolean, boolean) is
  'Service role : met à jour payload (et optionnellement pdf_path) ; refuse les écritures pendant une génération PDF active ; déverrouille si is_locked et p_allow_unlock. Sérialise par FOR UPDATE sur la ligne.';

revoke all on function public.update_report_payload_with_unlock(uuid, jsonb, text, boolean, boolean) from public;
grant execute on function public.update_report_payload_with_unlock(uuid, jsonb, text, boolean, boolean) to service_role;
