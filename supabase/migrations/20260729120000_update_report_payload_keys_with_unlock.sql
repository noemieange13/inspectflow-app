-- Merge top-level keys into reports.payload under FOR UPDATE (with optional unlock / pdf clear).
-- Used by Next /api/report-content so a long OpenAI polish cannot wipe concurrent cover/notes saves
-- via a stale full-payload replace.

create or replace function public.update_report_payload_keys_with_unlock(
  p_report_id uuid,
  p_patch jsonb,
  p_source text default 'rpc',
  p_clear_pdf_path boolean default false,
  p_allow_unlock boolean default true,
  p_remove_keys text[] default null,
  p_audit_entry jsonb default null
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
  did_unlock boolean := false;
  v_trail jsonb;
  v_trail_len int;
begin
  if p_patch is null or jsonb_typeof(p_patch) <> 'object' then
    raise exception 'p_patch must be a jsonb object';
  end if;

  select * into r from public.reports where id = p_report_id for update;
  if not found then
    raise exception 'report not found: %', p_report_id;
  end if;

  if coalesce(r.is_locked, false) then
    if not p_allow_unlock then
      raise exception 'Report is locked'
        using errcode = 'P0001';
    end if;
    did_unlock := true;
  end if;

  merged := coalesce(r.payload, '{}'::jsonb) || p_patch;

  if p_remove_keys is not null then
    for i in 1 .. coalesce(array_length(p_remove_keys, 1), 0) loop
      if p_remove_keys[i] is not null and length(trim(p_remove_keys[i])) > 0 then
        merged := merged - trim(p_remove_keys[i]);
      end if;
    end loop;
  end if;

  if p_audit_entry is not null and jsonb_typeof(p_audit_entry) = 'object' then
    v_trail := case
      when jsonb_typeof(merged -> 'audit_trail_v1') = 'array' then merged -> 'audit_trail_v1'
      else '[]'::jsonb
    end || jsonb_build_array(p_audit_entry);
    v_trail_len := jsonb_array_length(v_trail);
    if v_trail_len > 150 then
      v_trail := (
        select coalesce(jsonb_agg(elem order by ord), '[]'::jsonb)
        from jsonb_array_elements(v_trail) with ordinality as t(elem, ord)
        where ord > v_trail_len - 150
      );
    end if;
    merged := jsonb_set(merged, '{audit_trail_v1}', v_trail, true);
  end if;

  if did_unlock then
    update public.reports
    set
      is_locked = false,
      finalized_at = null,
      generating = false,
      generating_at = null,
      payload = merged,
      pdf_path = case when p_clear_pdf_path then null else pdf_path end
    where id = p_report_id;
  else
    update public.reports
    set
      payload = merged,
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

comment on function public.update_report_payload_keys_with_unlock(uuid, jsonb, text, boolean, boolean, text[], jsonb) is
  'Service role: shallow-merge top-level jsonb keys into reports.payload under FOR UPDATE; optional unlock, pdf clear, key removal, and atomic audit_trail_v1 append.';

revoke all on function public.update_report_payload_keys_with_unlock(uuid, jsonb, text, boolean, boolean, text[], jsonb) from public;
grant execute on function public.update_report_payload_keys_with_unlock(uuid, jsonb, text, boolean, boolean, text[], jsonb) to service_role;
