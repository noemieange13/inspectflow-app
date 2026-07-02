"use client";

import Link from "next/link";

import type { InspectorHomeListItem } from "@/lib/inspectorHomeList";

type Props = {
  item: InspectorHomeListItem;
  variant?: "hero" | "list";
};

export default function InspectionCard({ item, variant = "list" }: Props) {
  const isHero = variant === "hero";

  return (
    <article
      className={
        isHero
          ? "rounded-2xl border border-blue-200 bg-gradient-to-br from-blue-50 to-white p-5 shadow-sm"
          : "rounded-xl border border-slate-200 bg-white p-4 shadow-sm"
      }
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
            {isHero ? "Inspection en cours" : item.statusLabel}
          </p>
          <h2
            className={`mt-1 font-semibold text-slate-900 ${isHero ? "text-lg" : "text-base"} truncate`}
          >
            {item.address}
          </h2>
          <p className="mt-0.5 truncate text-sm text-slate-600">{item.clientName}</p>
        </div>
        {isHero ? (
          <div className="text-right">
            <p className="text-3xl font-bold tabular-nums text-blue-700">
              {item.completionPercent}%
            </p>
            <p className="text-xs text-slate-500">{item.statusLabel}</p>
          </div>
        ) : (
          <span className="shrink-0 rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-700">
            {item.statusLabel}
          </span>
        )}
      </div>

      {!isHero && item.photoCount > 0 ? (
        <p className="mt-2 text-xs text-slate-500">{item.photoCount} photos</p>
      ) : null}

      <Link
        href={item.reportHref}
        className={`mt-4 inline-flex min-h-[44px] w-full items-center justify-center rounded-xl font-semibold transition sm:w-auto sm:px-6 ${
          isHero
            ? "bg-blue-600 text-white hover:bg-blue-700"
            : "border border-slate-300 bg-white text-slate-900 hover:bg-slate-50"
        }`}
      >
        Continuer
      </Link>
    </article>
  );
}
