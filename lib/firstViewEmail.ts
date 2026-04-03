import type { SupabaseClient } from "@supabase/supabase-js";
import { Resend } from "resend";

import { sendReportOpenedWebhook } from "@/lib/reportWebhook";

export type FirstViewSideEffectsResult = {
  isFirstView: boolean;
};

/**
 * Compte les vues après insert réussi ; notif email + webhook si 1ʳᵉ ouverture.
 */
export async function runFirstViewSideEffects(opts: {
  supabase: SupabaseClient;
  reportId: string;
  clientEmail: string | null | undefined;
  firstViewNotified: boolean | null | undefined;
  viewInsertSucceeded: boolean;
}): Promise<FirstViewSideEffectsResult> {
  const {
    supabase,
    reportId,
    clientEmail,
    firstViewNotified,
    viewInsertSucceeded,
  } = opts;

  const result: FirstViewSideEffectsResult = { isFirstView: false };

  if (!viewInsertSucceeded) {
    return result;
  }

  const { count, error: countError } = await supabase
    .from("report_views")
    .select("*", { count: "exact", head: true })
    .eq("report_id", reportId);

  if (countError) {
    console.error("FIRST_VIEW_COUNT:", countError);
    return result;
  }

  const isFirstView = count === 1;
  result.isFirstView = isFirstView;

  if (!isFirstView) {
    return result;
  }

  const viewedAt = new Date().toISOString();

  if (process.env.WEBHOOK_REPORT_OPENED) {
    await sendReportOpenedWebhook({
      report_id: reportId,
      viewed_at: viewedAt,
      is_first_view: true,
    });
  }

  if (firstViewNotified) {
    return result;
  }

  const to = clientEmail?.trim();
  if (!to) {
    return result;
  }

  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.RESEND_FROM;
  if (!apiKey || !from) {
    console.warn("FIRST_VIEW_EMAIL: set RESEND_API_KEY and RESEND_FROM");
    return result;
  }

  const resend = new Resend(apiKey);

  try {
    await resend.emails.send({
      from,
      to,
      subject: "Votre rapport a été consulté",
      html: `<p>Votre rapport a été ouvert pour la première fois.</p><p>Référence : <code>${reportId}</code></p>`,
    });
  } catch (e) {
    console.error("FIRST_VIEW_EMAIL:", e);
    return result;
  }

  const { error: updateError } = await supabase
    .from("reports")
    .update({ first_view_notified: true })
    .eq("id", reportId)
    .eq("first_view_notified", false);

  if (updateError) {
    console.error("FIRST_VIEW_NOTIFIED_UPDATE:", updateError);
  }

  return result;
}
