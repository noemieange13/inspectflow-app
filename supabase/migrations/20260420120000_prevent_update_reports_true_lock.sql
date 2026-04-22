-- Verrou métier : tant que is_locked = true, pas de changement de contenu (payload, champs fiche).
-- Exceptions : déverrouillage explicite (is_locked → false) ; pipeline PDF (generating) pour autoriser
-- la synchro payload pendant la génération ; colonnes opérationnelles (pdf_path, jetons, etc.).
-- Lorsque is_locked = false, on conserve le garde-fou « whitelist » historique (évite les no-op et
-- les updates hors pipeline).

create or replace function public.prevent_update_reports()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if OLD.id is distinct from NEW.id
     or OLD.user_id is distinct from NEW.user_id
     or OLD.report_id is distinct from NEW.report_id
     or OLD.inspection_id is distinct from NEW.inspection_id
  then
    raise exception 'Report is immutable'
      using errcode = 'P0001';
  end if;

  -- Déverrouillage explicite : une seule requête peut tout modifier (API / secours unlock).
  if coalesce(OLD.is_locked, false)
     and coalesce(NEW.is_locked, false) = false
     and OLD.is_locked is distinct from NEW.is_locked
  then
    return NEW;
  end if;

  if coalesce(OLD.is_locked, false) and coalesce(NEW.is_locked, false) then
    if OLD.payload is distinct from NEW.payload
       and not (coalesce(OLD.generating, false) or coalesce(NEW.generating, false))
    then
      raise exception 'Report is locked'
        using errcode = 'P0001';
    end if;

    if OLD.client is distinct from NEW.client
       or OLD.adresse is distinct from NEW.adresse
       or OLD."date" is distinct from NEW."date"
       or OLD.inspecteur is distinct from NEW.inspecteur
       or OLD.data_hash is distinct from NEW.data_hash
       or OLD.job_id is distinct from NEW.job_id
       or OLD.photo_id is distinct from NEW.photo_id
    then
      raise exception 'Report is locked'
        using errcode = 'P0001';
    end if;

    return NEW;
  end if;

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
    or OLD.is_locked is distinct from NEW.is_locked
    or OLD.finalized_at is distinct from NEW.finalized_at
    or OLD.client_email is distinct from NEW.client_email
  ) then
    return NEW;
  end if;

  raise exception 'Report is immutable'
    using errcode = 'P0001';
end;
$$;

comment on function public.prevent_update_reports() is
  'is_locked=true : bloque payload (sauf si generating), client/adresse/date/inspecteur/data_hash/job_id/photo_id ; autorise ops (pdf_path, jetons, generating, etc.). Déverrouillage explicite autorisé. is_locked=false : whitelist pipeline + no-op interdit.';
