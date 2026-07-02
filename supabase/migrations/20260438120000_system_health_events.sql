-- Phase 5C — événements santé système (monitoring opérationnel, append-first).

create table if not exists public.system_health_events (
  id uuid primary key default gen_random_uuid(),
  event_type text not null,
  severity text not null check (severity in ('info', 'warning', 'critical', 'healthy')),
  source text not null,
  status text not null default 'open' check (status in ('open', 'resolved')),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  resolved_at timestamptz
);

create index if not exists system_health_events_created_idx
  on public.system_health_events (created_at desc);

create index if not exists system_health_events_open_idx
  on public.system_health_events (status, severity, created_at desc)
  where status = 'open';

comment on table public.system_health_events is
  'Monitoring opérationnel InspectFlow — append-first. Aucune PII client.';

alter table public.system_health_events enable row level security;
revoke all on public.system_health_events from public;
grant select, insert, update on public.system_health_events to service_role;
grant select, insert, update on public.system_health_events to postgres;

create or replace function public.prevent_system_health_events_delete()
returns trigger
language plpgsql
as $$
begin
  raise exception 'system_health_events delete is not allowed';
end;
$$;

drop trigger if exists system_health_events_no_delete on public.system_health_events;
create trigger system_health_events_no_delete
  before delete on public.system_health_events
  for each row
  execute function public.prevent_system_health_events_delete();
