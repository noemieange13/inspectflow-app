import type { SupabaseClient } from "@supabase/supabase-js";
import { Resend } from "resend";

/**
 * Après insert réussi dans `report_views` : si c’est la 1ʳᵉ ligne pour ce rapport,
 * envoie un email (Resend) et pose `first_view_notified` (anti race / doublon).
 */
export async function notifyFirstReportViewIfNeeded(opts: {
  supabase: SupabaseClient;
  reportId: string;
  clientEmail: string | null | undefined;
  firstViewNotified: boolean | null | undefined;
  viewInsertSucceeded: boolean;
}): Promise<void> {
  const {
    supabase,
    reportId,
    clientEmail,
    firstViewNotified,
    viewInsertSucceeded,
  } = opts;

  if (!viewInsertSucceeded) return;
  if (firstViewNotified) return;
  const to = clientEmail?.trim();
  if (!to) return;

  const { count, error: countError } = await supabase
    .from("report_views")
    .select("*", { count: "exact", head: true })
    .eq("report_id", reportId);

  if (countError) {
    console.error("FIRST_VIEW_COUNT:", countError);
    return;
  }

  if (count !== 1) return;

  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.RESEND_FROM;
  if (!apiKey || !from) {
    console.warn("FIRST_VIEW_EMAIL: set RESEND_API_KEY and RESEND_FROM");
    return;
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
    return;
  }

  const { error: updateError } = await supabase
    .from("reports")
    .update({ first_view_notified: true })
    .eq("id", reportId)
    .eq("first_view_notified", false);

  if (updateError) {
    console.error("FIRST_VIEW_NOTIFIED_UPDATE:", updateError);
  }
}
