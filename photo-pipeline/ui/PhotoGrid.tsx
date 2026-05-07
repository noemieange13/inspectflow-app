"use client";

import { PhotoImage } from "./PhotoImage";

export type PhotoGridItem = {
  id: string;
  src: string | null | undefined;
  caption?: string | null;
};

type Props = {
  items: PhotoGridItem[];
  columnsClassName?: string;
};

/** Grille purement présentationnelle — URLs déjà résolues en amont. */
export function PhotoGrid({
  items,
  columnsClassName = "grid grid-cols-2 gap-2 sm:grid-cols-3",
}: Props) {
  return (
    <div className={columnsClassName}>
      {items.map((item) => (
        <figure key={item.id} className="overflow-hidden rounded bg-neutral-100">
          <PhotoImage
            src={item.src}
            className="h-40 w-full object-cover"
          />
          {item.caption ? (
            <figcaption className="px-2 py-1 text-xs text-neutral-600">
              {item.caption}
            </figcaption>
          ) : null}
        </figure>
      ))}
    </div>
  );
}
