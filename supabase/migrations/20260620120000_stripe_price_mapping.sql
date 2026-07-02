-- Phase 7B — mapping plans → Stripe Price IDs.

create table if not exists public.stripe_price_mapping (
  plan text primary key check (plan in ('solo', 'team', 'enterprise')),
  stripe_price_id text not null,
  updated_at timestamptz not null default now()
);

comment on table public.stripe_price_mapping is
  'Price IDs Stripe par plan commercial (solo/team/enterprise). Complété via env ou dashboard Stripe.';

insert into public.stripe_price_mapping (plan, stripe_price_id)
values
  ('solo', 'price_solo_placeholder'),
  ('team', 'price_team_placeholder'),
  ('enterprise', 'price_enterprise_placeholder')
on conflict (plan) do nothing;

alter table public.stripe_price_mapping enable row level security;
revoke all on public.stripe_price_mapping from public;
grant select on public.stripe_price_mapping to service_role;
grant select on public.stripe_price_mapping to postgres;
