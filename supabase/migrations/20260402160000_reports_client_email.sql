alter table public.reports
  add column if not exists client_email text;

alter table public.reports
  add column if not exists first_view_notified boolean default false;

comment on column public.reports.client_email is 'Destinataire pour la notif « première ouverture » (optionnel).';
comment on column public.reports.first_view_notified is 'True après envoi réussi de l’email première vue (anti double envoi).';
