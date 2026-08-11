-- Append to reports.payload.processed_notes under FOR UPDATE so concurrent
-- process-notes invocations cannot drop each other's notes (or wipe sibling
-- payload keys via a stale full-payload read-modify-write).

create or replace function public.append_report_processed_notes(
  p_report_id uuid,
  p_notes jsonb,
  p_source text default 'process-notes',
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
  existing jsonb;
  merged_notes jsonb;
  next_payload jsonb;
  did_unlock boolean := false;
  processed_at text := to_char(timezone('utc', now()), 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"');
begin
  if p_notes is null or jsonb_typeof(p_notes) <> 'array' then
    raise exception 'p_notes must be a jsonb array';
  end if;

  select * into r from public.reports where id = p_report_id for update;
  if not found then
    raise exception 'report not found: %', p_report_id;
  end if;

  existing := coalesce(r.payload, '{}'::jsonb) -> 'processed_notes';
  if existing is null or jsonb_typeof(existing) <> 'array' then
    existing := '[]'::jsonb;
  end if;

  merged_notes := existing || p_notes;
  next_payload := coalesce(r.payload, '{}'::jsonb)
    || jsonb_build_object(
      'processed_notes', merged_notes,
      'notes_processed_at', to_jsonb(processed_at)
    );

  if coalesce(r.is_locked, false) then
    if not p_allow_unlock then
      raise exception 'Report is locked'
        using errcode = 'P0001';
    end if;

    update public.reports
    set
      is_locked = false,
      finalized_at = null,
      generating = false,
      generating_at = null,
      payload = next_payload,
      pdf_path = case when p_clear_pdf_path then null else pdf_path end
    where id = p_report_id;

    did_unlock := true;
  else
    update public.reports
    set
      payload = next_payload,
      pdf_path = case when p_clear_pdf_path then null else pdf_path end
    where id = p_report_id;
  end if;

  return jsonb_build_object(
    'ok', true,
    'unlocked', did_unlock,
    'notes_total', jsonb_array_length(merged_notes),
    'notes_appended', jsonb_array_length(p_notes),
    'source', coalesce(nullif(trim(p_source), ''), 'process-notes')
  );
end;
$$;

comment on function public.append_report_processed_notes(uuid, jsonb, text, boolean, boolean) is
  'Service role: atomically append jsonb array items to reports.payload.processed_notes under FOR UPDATE; optional unlock / pdf_path clear.';

revoke all on function public.append_report_processed_notes(uuid, jsonb, text, boolean, boolean) from public;
grant execute on function public.append_report_processed_notes(uuid, jsonb, text, boolean, boolean) to service_role;
