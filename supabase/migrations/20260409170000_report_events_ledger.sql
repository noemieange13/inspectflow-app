-- Ledger d’événements par rapport (chaîne de hash SHA-256).
-- À appliquer sur la même base que public.reports (Supabase SQL Editor ou `supabase db push`).
-- Vérif post-déploiement : select to_regclass('public.report_events');

-- Sur Supabase, pgcrypto est typiquement dans le schéma `extensions` ; `digest` n’est pas dans `public`.
create extension if not exists pgcrypto with schema extensions;

-- Constante genesis (64 zéros hex) — premier prev_hash de chaque rapport.
create or replace function public._report_events_genesis_hash()
returns text
language sql
immutable
as $$
  select repeat('0', 64);
$$;

create table if not exists public.report_events (
  id uuid primary key default gen_random_uuid(),
  report_id uuid not null references public.reports (id) on delete cascade,
  seq bigint not null,
  event_type text not null,
  payload jsonb not null default '{}'::jsonb,
  prev_hash text not null,
  event_hash text not null,
  created_at timestamptz not null default now(),
  constraint report_events_report_seq_unique unique (report_id, seq),
  constraint report_events_seq_positive check (seq > 0)
);

create index if not exists report_events_report_id_seq_idx
  on public.report_events (report_id, seq);

comment on table public.report_events is
  'Journal append-only par rapport ; chaîne de hash (prev_hash → event_hash).';

-- Canonique v1 : déterministe pour une même ligne logique.
create or replace function public._report_events_canonical(
  p_report_id uuid,
  p_seq bigint,
  p_prev_hash text,
  p_event_type text,
  p_payload jsonb
)
returns text
language sql
immutable
as $$
  select format(
    'v1|%s|%s|%s|%s|%s',
    p_report_id::text,
    p_seq::text,
    p_prev_hash,
    p_event_type,
    coalesce(p_payload::text, 'null')
  );
$$;

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

-- Ajoute un événement (à appeler depuis Edge / service role). Verrou par rapport.
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

comment on function public.append_event(uuid, text, jsonb) is
  'Ajoute une ligne au journal ; calcule prev_hash / event_hash.';

-- true = chaîne intacte ou aucun événement pour ce rapport.
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

comment on function public.verify_report_chain(uuid) is
  'Vérifie la chaîne de hash pour un rapport (ordre seq, genesis, recompute).';

alter table public.report_events enable row level security;

-- Pas de policy : anon/authenticated n’accèdent pas ; service_role contourne le RLS.

revoke all on public.report_events from public;
grant select, insert, update, delete on public.report_events to postgres;
grant select, insert, update, delete on public.report_events to service_role;

revoke all on function public.append_event(uuid, text, jsonb) from public;
grant execute on function public.append_event(uuid, text, jsonb) to service_role;

revoke all on function public.verify_report_chain(uuid) from public;
grant execute on function public.verify_report_chain(uuid) to service_role;

-- Helpers internes : pas d’exposition nécessaire côté API.
revoke all on function public._report_events_genesis_hash() from public;
revoke all on function public._report_events_canonical(uuid, bigint, text, text, jsonb) from public;
revoke all on function public._report_events_compute_hash(text) from public;
