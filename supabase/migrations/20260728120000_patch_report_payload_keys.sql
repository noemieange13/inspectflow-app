-- Patch top-level keys on reports.payload under FOR UPDATE without replacing the whole JSON.
-- Used by Edge reports-pdf so concurrent cover/content saves are not wiped by a stale full payload write.

create or replace function public.patch_report_payload_keys(
  p_report_id uuid,
  p_patch jsonb,
  p_source text default 'rpc'
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  r public.reports%rowtype;
  merged jsonb;
begin
  if p_patch is null or jsonb_typeof(p_patch) <> 'object' then
    raise exception 'p_patch must be a jsonb object';
  end if;

  select * into r from public.reports where id = p_report_id for update;
  if not found then
    raise exception 'report not found: %', p_report_id;
  end if;

  -- Shallow top-level merge only; does not unlock, clear generating, or touch pdf_path.
  merged := coalesce(r.payload, '{}'::jsonb) || p_patch;

  update public.reports
  set payload = merged
  where id = p_report_id;

  return jsonb_build_object(
    'ok', true,
    'source', coalesce(nullif(trim(p_source), ''), 'rpc')
  );
end;
$$;

comment on function public.patch_report_payload_keys(uuid, jsonb, text) is
  'Service role: merge top-level jsonb keys into reports.payload under FOR UPDATE. Does not unlock or clear generating.';

revoke all on function public.patch_report_payload_keys(uuid, jsonb, text) from public;
grant execute on function public.patch_report_payload_keys(uuid, jsonb, text) to service_role;
