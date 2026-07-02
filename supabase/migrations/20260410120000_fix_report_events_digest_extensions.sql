-- Fix : digest() est fourni par pgcrypto dans le schéma `extensions`.
-- Sans `extensions.digest` ou `search_path` incluant `extensions`, les fonctions SECURITY DEFINER
-- peuvent lever : function digest(bytea, text) does not exist

create extension if not exists pgcrypto with schema extensions;

create or replace function public._report_events_compute_hash(p_canonical text)
returns text
language sql
stable
set search_path = public, extensions
as $$
  select encode(
    extensions.digest(convert_to(p_canonical, 'UTF8'), 'sha256'),
    'hex'
  );
$$;

create or replace function public.append_event(
  p_report_id uuid,
  p_event_type text,
  p_payload jsonb default '{}'::jsonb
)
returns uuid
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_next_seq bigint;
  v_prev_hash text;
  v_canonical text;
  v_event_hash text;
  v_id uuid;
begin
  if not exists (select 1 from public.reports r where r.id = p_report_id) then
    raise exception 'report not found: %', p_report_id;
  end if;

  perform pg_advisory_xact_lock(
    hashtext(substring(p_report_id::text, 1, 18)),
    hashtext(substring(p_report_id::text, 19, 18))
  );

  select coalesce(max(e.seq), 0) + 1 into v_next_seq
  from public.report_events e
  where e.report_id = p_report_id;

  if v_next_seq = 1 then
    v_prev_hash := public._report_events_genesis_hash();
  else
    select e.event_hash into v_prev_hash
    from public.report_events e
    where e.report_id = p_report_id and e.seq = v_next_seq - 1;

    if v_prev_hash is null then
      raise exception 'chain broken: missing seq % for report %', v_next_seq - 1, p_report_id;
    end if;
  end if;

  v_canonical := public._report_events_canonical(
    p_report_id, v_next_seq, v_prev_hash, p_event_type, p_payload
  );
  v_event_hash := public._report_events_compute_hash(v_canonical);

  insert into public.report_events (
    report_id, seq, event_type, payload, prev_hash, event_hash
  ) values (
    p_report_id, v_next_seq, p_event_type, p_payload, v_prev_hash, v_event_hash
  )
  returning id into v_id;

  return v_id;
end;
$$;

create or replace function public.verify_report_chain(p_report_id uuid)
returns boolean
language plpgsql
stable
security definer
set search_path = public, extensions
as $$
declare
  r record;
  v_expected_prev text;
  v_canonical text;
  v_expected_hash text;
  v_prev_row_hash text;
begin
  if not exists (select 1 from public.reports r where r.id = p_report_id) then
    return false;
  end if;

  v_expected_prev := public._report_events_genesis_hash();
  v_prev_row_hash := null;

  for r in
    select e.seq, e.prev_hash, e.event_hash, e.event_type, e.payload
    from public.report_events e
    where e.report_id = p_report_id
    order by e.seq asc
  loop
    if r.seq = 1 then
      if r.prev_hash is distinct from v_expected_prev then
        return false;
      end if;
    else
      if v_prev_row_hash is null or r.prev_hash is distinct from v_prev_row_hash then
        return false;
      end if;
    end if;

    v_canonical := public._report_events_canonical(
      p_report_id, r.seq, r.prev_hash, r.event_type, r.payload
    );
    v_expected_hash := public._report_events_compute_hash(v_canonical);

    if r.event_hash is distinct from v_expected_hash then
      return false;
    end if;

    v_prev_row_hash := r.event_hash;
  end loop;

  return true;
end;
$$;
