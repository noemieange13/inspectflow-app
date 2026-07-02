"use client";

import { useEffect, useState } from "react";

import { buildDefaultSendMessage } from "@/lib/reportDeliveryClient";
import type { DeliveryTimelineEntry } from "@/lib/reportDeliveryTimeline";
import { formatDeliveryTimelineDate } from "@/lib/reportDeliveryTimeline";

type Props = {
  reportId: string;
  viewerToken?: string;
  language?: "fr" | "en";
};

export default function ReportDeliveryTimeline({
  reportId,
  viewerToken,
  language = "fr",
}: Props) {
  const [entries, setEntries] = useState<DeliveryTimelineEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (!viewerToken) {
      setLoading(false);
      return;
    }

    let cancelled = false;
    void (async () => {
      try {
        const params = new URLSearchParams({
          reportId,
          token: viewerToken,
        });
        const res = await fetch(`/api/report-delivery-timeline?${params.toString()}`);
        const body = (await res.json().catch(() => ({}))) as {
          timeline?: DeliveryTimelineEntry[];
        };
        if (!cancelled && res.ok && Array.isArray(body.timeline)) {
          setEntries(body.timeline);
        } else if (!cancelled) {
          setFailed(true);
        }
      } catch (e) {
        console.error("REPORT_DELIVERY_TIMELINE:", e);
        if (!cancelled) setFailed(true);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [reportId, viewerToken]);

  if (!viewerToken) return null;

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <h2 className="text-sm font-semibold text-slate-800">
        {language === "en" ? "Delivery history" : "Historique de livraison"}
      </h2>
      {loading ? (
        <p className="mt-3 text-sm text-slate-500">
          {language === "en" ? "Loading…" : "Chargement…"}
        </p>
      ) : failed ? (
        <p className="mt-3 text-sm text-slate-500">
          {language === "en" ? "History unavailable." : "Historique indisponible."}
        </p>
      ) : entries.length === 0 ? (
        <p className="mt-3 text-sm text-slate-500">
          {language === "en" ? "No events yet." : "Aucun événement pour l'instant."}
        </p>
      ) : (
        <ol className="mt-4 space-y-3">
          {entries.map((entry) => (
            <li key={entry.id} className="flex flex-col gap-0.5 border-l-2 border-emerald-200 pl-3">
              <span className="text-sm font-medium text-slate-900">{entry.label}</span>
              <time className="text-xs text-slate-500" dateTime={entry.at}>
                {formatDeliveryTimelineDate(entry.at, language)}
              </time>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
