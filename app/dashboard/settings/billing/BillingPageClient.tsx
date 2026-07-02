"use client";

import BillingPage from "@/components/billing/BillingPage";

export default function BillingPageClient({
  organizationId,
  accessToken,
}: {
  organizationId: string;
  accessToken?: string;
}) {
  return <BillingPage organizationId={organizationId} accessToken={accessToken} />;
}
