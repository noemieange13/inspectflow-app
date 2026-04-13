-- Fix 1 : job_id doit être nullable (create-report n'exige que inspection_id)
alter table public.reports alter column job_id drop not null;

-- Fix 2 : trigger prevent_update_reports — autoriser les colonnes du pipeline
create or replace function public.prevent_update_reports()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if (
    OLD.payload is distinct from NEW.payload
    or OLD.pdf_path is distinct from NEW.pdf_path
    or OLD.pdf_url is distinct from NEW.pdf_url
    or OLD.generating is distinct from NEW.generating
    or OLD.generating_at is distinct from NEW.generating_at
    or OLD.status is distinct from NEW.status
    or OLD.access_token is distinct from NEW.access_token
    or OLD.token_expires_at is distinct from NEW.token_expires_at
    or OLD.first_view_notified is distinct from NEW.first_view_notified
  ) and (
    OLD.id = NEW.id
    and OLD.user_id is not distinct from NEW.user_id
    and OLD.report_id is not distinct from NEW.report_id
    and OLD.inspection_id is not distinct from NEW.inspection_id
  ) then
    return NEW;
  end if;

  raise exception 'Report is immutable'
    using errcode = 'P0001';
end;
$$;
