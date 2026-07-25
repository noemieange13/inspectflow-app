-- claim_report_lock was executable by `authenticated`, while release_report_lock
-- is service_role-only and there is no stale-lock reclaim. Any logged-in user
-- could permanently DoS PDF generation for an arbitrary report UUID.
-- Align claim with release: service_role only (Edge reports-pdf).

revoke execute on function public.claim_report_lock(uuid) from authenticated;
revoke execute on function public.claim_report_lock(uuid) from anon;
revoke execute on function public.claim_report_lock(uuid) from public;

grant execute on function public.claim_report_lock(uuid) to service_role;
