-- Remplace atomiquement les lignes report_items pour un rapport (DELETE + INSERT dans une seule transaction).
-- À appeler uniquement après un run IA réussi (côté app : classifyDefects).

create or replace function public.apply_report_items_classification_batch(
  p_report_id uuid,
  p_items jsonb
) returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  n int := 0;
  el jsonb;
  sev text;
begin
  if p_report_id is null then
    raise exception 'report_id required';
  end if;

  delete from public.report_items where report_id = p_report_id;

  for el in select * from jsonb_array_elements(coalesce(p_items, '[]'::jsonb))
  loop
    sev := coalesce(el->>'severity', '');
    if sev not in ('low', 'medium', 'high') then
      raise exception 'invalid severity: %', sev;
    end if;

    insert into public.report_items (report_id, section, severity, title, description, recommendation)
    values (
      p_report_id,
      left(coalesce(el->>'section', ''), 2000),
      sev,
      left(coalesce(el->>'title', ''), 2000),
      el->>'description',
      el->>'recommendation'
    );
    n := n + 1;
  end loop;

  return n;
end;
$$;

comment on function public.apply_report_items_classification_batch(uuid, jsonb) is
  'Transaction unique : vide puis réinsère les défauts classés pour report_id.';

grant execute on function public.apply_report_items_classification_batch(uuid, jsonb) to service_role;
