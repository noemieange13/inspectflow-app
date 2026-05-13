-- The PDF lock lifecycle is owned by the reports-pdf Edge Function.
-- Authenticated clients could claim a lock but could not release it, leaving
-- reports.generating stuck and blocking future PDF generation.
revoke execute on function public.claim_report_lock(uuid) from authenticated;
revoke execute on function public.claim_report_lock(uuid) from anon;

grant execute on function public.claim_report_lock(uuid) to service_role;
