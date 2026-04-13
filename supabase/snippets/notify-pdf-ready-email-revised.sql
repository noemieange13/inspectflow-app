-- =============================================================================
-- Notif email « rapport PDF prêt » — REVISION alignée sur inspectflow-web
-- =============================================================================
-- À lire avant toute mise en prod. Ne pas exécuter aveuglément : pg_net + secrets.
--
-- Constat repo :
--   - Colonne email existante : **client_email** (pas `user_email`) — voir
--     20260402160000_reports_client_email.sql
--   - Anti double envoi déjà présent pour un autre flux : **first_view_notified**
--   - L’Edge **reports-pdf** met à jour **pdf_path** ; elle ne versionne **pas**
--     **pdf_status** dans les migrations → un trigger sur `pdf_status = 'ready'`
--     ne se déclenchera pas tant que rien n’écrit cette colonne.
--
-- Recommandation : déclencher sur transition **pdf_path** (NULL → non NULL) OU
-- d’abord ajouter / maintenir **pdf_status** dans l’Edge PDF (une seule source).
-- =============================================================================

-- 1) Colonne anti double envoi (OK)
alter table public.reports
  add column if not exists pdf_notified_at timestamptz;

comment on column public.reports.pdf_notified_at is
  'Horodatage du dernier envoi email « PDF prêt » ; NULL = jamais envoyé.';

-- 2) Extension pg_net (Dashboard → Extensions, ou SQL si autorisé)
-- create extension if not exists pg_net with schema extensions;

-- 3) Secrets pour net.http_post
-- ⚠️ NE PAS mettre la service_role en clair dans le trigger.
-- Options Supabase :
--   - **Database Webhooks** (Dashboard) : souvent plus simple qu’un trigger SQL + pg_net
--   - **Vault** (supabase_vault) + lecture dans le trigger (doc Supabase)
--   - `current_setting('app.settings.xxx')` uniquement si un admin a posé des GUC sécurisés
--
-- Exemple conceptuel (URL + anon ou secret dédié **sans** exposer service_role au réseau DB) :
--   Appeler une Edge **verify_jwt + secret partagé** plutôt que d’embarquer la service role.

-- 4) Trigger — EXEMPLE basé sur **pdf_path** + **client_email** (cohérent avec ce repo)
-- create or replace function public.notify_report_pdf_ready()
-- returns trigger
-- language plpgsql
-- security definer
-- set search_path = public
-- as $$
-- begin
--   if tg_op <> 'UPDATE' then
--     return new;
--   end if;
--   if new.pdf_path is null or btrim(new.pdf_path) = '' then
--     return new;
--   end if;
--   if new.pdf_path is not distinct from old.pdf_path then
--     return new;
--   end if;
--   if new.client_email is null or btrim(new.client_email) = '' then
--     return new;
--   end if;
--   if new.pdf_notified_at is not null then
--     return new;
--   end if;
--
--   perform net.http_post(
--     url := '<PROJECT_URL>/functions/v1/send-report-email',
--     headers := jsonb_build_object(
--       'Content-Type', 'application/json',
--       'Authorization', 'Bearer <SECRET_DEDIE_WEBHOOK>'
--     ),
--     body := jsonb_build_object(
--       'report_id', new.id::text,
--       'email', new.client_email
--     )
--   );
--
--   return new;
-- end;
-- $$;

-- create trigger trg_notify_report_pdf_ready
--   after update of pdf_path on public.reports
--   for each row
--   execute function public.notify_report_pdf_ready();

-- 5) Edge send-report-email (revisions cles)
--   - Style Deno : Deno.serve + npm:@supabase/supabase-js (comme create-report)
--   - Re-check idempotence : UPDATE reports SET pdf_notified_at = now()
--     WHERE id = $1 AND pdf_notified_at IS NULL RETURNING id ;
--     si 0 ligne → exit 200 « already »
--   - Envoyer Resend **apres** avoir « réservé » la ligne (ou utiliser transaction)
--   - Lien viewer : /report/:id?token= — token = **access_token** en base (pas hash dans ce repo)
--   - En cas d’echec Resend : ne pas set pdf_notified_at ; prevvoir retry / log

-- 6) Alternative sans trigger SQL
--   - A la fin de **reports-pdf** (succes + pdf_path ecrit), appeler la meme Edge
--     ou une route Next interne — un seul chemin, pas de pg_net.
