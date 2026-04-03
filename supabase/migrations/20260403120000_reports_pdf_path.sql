-- Chemin objet dans le bucket `rapports-pdf` (ex. : <user_id>/<report_id>.pdf).
-- Si renseigné, l’app utilise createSignedUrl et ignore l’URL externe éventuelle dans pdf_url.

alter table public.reports
  add column if not exists pdf_path text;

comment on column public.reports.pdf_path is 'Clé Storage dans rapports-pdf ; prioritaire sur pdf_url pour l’affichage.';
