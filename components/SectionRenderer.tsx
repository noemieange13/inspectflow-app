"use client";

import type { DisplayPhoto } from "@/hooks/useInspectionPhotos";
import type { GroupedPhotos } from "@/utils/groupPhotos";

type Props = {
  grouped: GroupedPhotos;
  /** `photo.id` → URL pour `<img src>` (résolu par `useResolvedPhotoUrls`). */
  resolvedUrls: Record<string, string>;
};

export default function SectionRenderer({ grouped, resolvedUrls }: Props) {
  const sections = Object.entries(grouped);
  if (sections.length === 0) return null;

  return (
    <div className="space-y-8">
      {sections.map(([section, constats]) => (
        <div key={section}>
          <h2 className="mb-4 text-xl font-bold">{section}</h2>

          {Object.entries(constats).map(([constatId, photos]) => (
            <div key={`${section}-${constatId}`} className="mb-4">
              <h3 className="mb-2 font-semibold">{constatId}</h3>

              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                {photos.map((photo: DisplayPhoto) => {
                  const src = resolvedUrls[photo.id];
                  return (
                    <figure
                      key={photo.id}
                      className="overflow-hidden rounded bg-neutral-100"
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
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}
