-- Backfill payload.html when missing, so reports-pdf can generate PDFs.
-- 1) Preview missing rows
select id, user_id, created_at, payload
from public.reports
where payload is null
   or coalesce(payload->>'html', '') = ''
order by created_at desc
limit 50;

-- 2) Patch ONE report (safe test)
-- Replace REPORT_ID_HERE with a real UUID.
update public.reports
set payload = jsonb_set(
  coalesce(payload, '{}'::jsonb),
  '{html}',
  to_jsonb(
    '<!doctype html><html><body>' ||
    '<h1>Rapport ' || id::text || '</h1>' ||
    '<p>Payload HTML backfilled for PDF generation.</p>' ||
    '</body></html>'
  ),
  true
)
where id = 'REPORT_ID_HERE'
  and (payload is null or coalesce(payload->>'html', '') = '');

-- 3) Optional: patch ALL missing rows (use with care)
-- update public.reports
-- set payload = jsonb_set(
--   coalesce(payload, '{}'::jsonb),
--   '{html}',
--   to_jsonb(
--     '<!doctype html><html><body>' ||
--     '<h1>Rapport ' || id::text || '</h1>' ||
--     '<p>Payload HTML backfilled for PDF generation.</p>' ||
--     '</body></html>'
--   ),
--   true
-- )
-- where payload is null or coalesce(payload->>'html', '') = '';
