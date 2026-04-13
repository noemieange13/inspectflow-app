-- =============================================================================
-- Revue du pack « email queue + claim batch + cron » — corrections & conseils
-- =============================================================================
-- Ne pas exécuter en bloc sans relecture métier. Colonnes supposent pdf_notified_at
-- déjà présent (snippet notify-pdf-ready-email-revised.sql).
-- =============================================================================

-- -----------------------------------------------------------------------------
-- A) CHECK « email_retry_consistency » — logique à clarifier
-- -----------------------------------------------------------------------------
-- Formule proposée : (email_failed_at IS NULL OR email_retry_count >= 10)
-- Sens : si email_failed_at est renseigné, il faut email_retry_count >= 10.
-- Problèmes :
--   1) Aucune règle n’empêche retry_count = 10 avec email_failed_at NULL → ligne
--      hors claim (retry < 10 faux) mais jamais marquée failed → « trou ».
--   2) Nom « invariant » trompeur : documenter la règle métier en commentaire CHECK.
--
-- Variante plus explicite (à valider avec le produit) :
--   CHECK (
--     (email_failed_at IS NULL AND email_retry_count < 10)
--     OR (email_failed_at IS NOT NULL AND email_retry_count >= 10)
--   )
-- ou gérer l’échec final uniquement via email_failed_at sans plafond strict sur count.

-- -----------------------------------------------------------------------------
-- B) claim_reports_batch — FOR UPDATE dans un sous-SELECT de IN
-- -----------------------------------------------------------------------------
-- Sous PostgreSQL, le motif fiable est CTE + UPDATE ... FROM + RETURNING.

create or replace function public.claim_reports_email_batch(p_limit int)
returns setof public.reports
language plpgsql
security definer
set search_path = public
as $$
begin
  return query
  with picked as (
    select id
    from public.reports
    where
      pdf_notified_at is null
      and email_failed_at is null
      and (email_next_retry_at is null or email_next_retry_at <= now())
      and email_retry_count < 10
      and (
        email_locked_at is null
        or email_locked_at < now() - interval '5 minutes'
      )
    order by created_at
    limit greatest(1, least(p_limit, 100))
    for update skip locked
  )
  update public.reports r
  set email_locked_at = now()
  from picked p
  where r.id = p.id
  returning r.*;
end;
$$;

-- Notes :
--   - greatest/least : borne p_limit (évite LIMIT 0 ou abus).
--   - Colonnes email_* doivent exister (migration préalable).
--   - Prérequis métier : quand envoyer ? (pdf_path non null + client_email ?) —
--     sinon la queue traitera des rapports non prêts ; ajouter des prédicats ici.

-- -----------------------------------------------------------------------------
-- C) Index composite vs partiel
-- -----------------------------------------------------------------------------
-- L’index large sur (pdf_notified_at, email_failed_at, ...) est redondant avec
-- un bon index partiel ciblant la clause WHERE du claim ; garder les deux seulement
-- si les mesures le justifient.

-- -----------------------------------------------------------------------------
-- D) pg_cron + net.http_post
-- -----------------------------------------------------------------------------
-- URL typique Edge : https://<PROJECT_REF>.supabase.co/functions/v1/<slug>
--   (pas *.functions.supabase.co sans /v1/… selon config actuelle).
-- Corps vide : l’Edge doit appeler claim_reports_email_batch elle-même — le cron
-- ne fait qu’un « tick ».
-- Secret : éviter current_setting('app.settings.service_role_key') non configuré ;
--   préférer Vault, ou secret dédié + Edge verify_jwt=false + header secret.

-- -----------------------------------------------------------------------------
-- E) Edge TypeScript
-- -----------------------------------------------------------------------------
-- compute_email_backoff : appeler via supabase.rpc('compute_email_backoff', …)
--   ou implémenter le backoff en TS (même formule).
-- Succès : UPDATE avec .is('pdf_notified_at', null) — bon pour idempotence.
-- Échec : incrémenter retry ; si final, set email_failed_at + email_next_retry_at null.
