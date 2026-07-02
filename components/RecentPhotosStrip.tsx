"use client";

import { assistantSuggestionLabel } from "@/lib/commercialCopy8g";

export type RecentPhotoItem = {
  id: string;
  url: string;
  saved: boolean;
  hasAiInsight: boolean;
};

type Props = {
  photos: RecentPhotoItem[];
  language: "fr" | "en";
};

export default function RecentPhotosStrip({ photos, language }: Props) {
  if (photos.length === 0) return null;

  return (
    <section aria-label={language === "en" ? "Recent photos" : "Photos récentes"}>
      <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
        {language === "en" ? "Recent" : "Récentes"}
      </h2>
      <div className="flex gap-2 overflow-x-auto pb-1 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {photos.map((photo) => (
          <div
            key={photo.id}
            className="relative h-20 w-20 shrink-0 overflow-hidden rounded-lg border border-slate-200 bg-slate-100"
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={photo.url}
              alt=""
              className="h-full w-full object-cover"
              loading="lazy"
            />
            <div className="absolute bottom-0 left-0 right-0 flex gap-0.5 bg-black/50 px-1 py-0.5">
              {photo.saved ? (
                <span
                  className="rounded px-1 text-[9px] font-medium text-white"
                  title={language === "en" ? "Saved" : "Sauvegardée"}
                >
                  ✓
                </span>
              ) : null}
              {photo.hasAiInsight ? (
                <span
                  className="rounded bg-blue-600 px-1 text-[9px] font-medium text-white"
                  title={assistantSuggestionLabel(language)}
                >
                  ✓
                </span>
              ) : null}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
