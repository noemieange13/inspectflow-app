-- Clauses conditionnelles : n’inclure que si le contexte rapport satisfait `applies_if`.

alter table public.qc_legal_clauses
  add column if not exists applies_if text;

comment on column public.qc_legal_clauses.applies_if is
  'Optionnel : expression simple `cle = true|false` (ex. roof_issue_detected = true). Vide = toujours inclure.';

-- Exemple : clause renforcée si anomalie toiture (gravité élevée sur zone toiture).
insert into public.qc_legal_clauses (province, section, clause, version, applies_if) values
(
  'QC',
  'recommendations',
  'Lorsque des anomalies sont observées sur la toiture, une expertise complémentaire par un professionnel qualifié peut être recommandée.',
  'QC2027',
  'roof_issue_detected = true'
);
