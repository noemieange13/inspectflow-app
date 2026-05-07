"use client";

import type { DisplayPhoto } from "@/hooks/useInspectionPhotos";

type Props = {
  photos: DisplayPhoto[];
  resolvedUrls: Record<string, string>;
};

export function UnclassifiedPhotos({ photos, resolvedUrls }: Props) {
  if (photos.length === 0) return null;

  return (
    <section className="space-y-4">
      <h2 className="text-xl font-bold">Photos non classées</h2>

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        {photos.map((photo) => {
          const src = resolvedUrls[photo.id];
          return (
            <figure
              key={photo.id}
              className="overflow-hidden rounded bg-neutral-100 opacity-90"
            >
              {src ? (
                <img
                  src={src}
                  alt=""
                  className="h-40 w-full object-cover"
                  loading="lazy"
                  decoding="async"
                  style={{ background: "#eee" }}
                />
              ) : (
                <div className="flex h-40 items-center justify-center text-sm text-neutral-500">
                  Image indisponible
                </div>
              )}
              {photo.photo_number != null ? (
                <figcaption className="px-2 py-1 text-xs text-neutral-600">
                  #{photo.photo_number}
                </figcaption>
              ) : null}
            </figure>
          );
        })}
      </div>
    </section>
  );
}
