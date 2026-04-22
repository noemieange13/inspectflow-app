-- V1 : pas de UNIQUE(report_id, input_hash) — l’historique des runs (reruns, prompts) doit rester complet.
-- Index pour diagnostics / filtres applicatifs uniquement.

create index if not exists idx_defect_classifications_report_input
  on public.defect_classifications (report_id, input_hash);

comment on table public.defect_classifications is
  'Journal append-only des exécutions IA (audit, debug, re-run). Pas de contrainte unique sur (report_id, input_hash) : plusieurs runs avec la même entrée sont légitimes.';
