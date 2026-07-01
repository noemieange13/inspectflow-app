-- claim_report_lock is a service-role-only PDF generation lock.
-- Authenticated clients must not be able to block another report's PDF build.
revoke execute on function public.claim_report_lock(uuid) from anon;
revoke execute on function public.claim_report_lock(uuid) from authenticated;
grant execute on function public.claim_report_lock(uuid) to service_role;
