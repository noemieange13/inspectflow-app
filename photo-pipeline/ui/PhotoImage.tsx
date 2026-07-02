"use client";

type Props = {
  src?: string | null;
  alt?: string;
  className?: string;
};

/** Affichage image sans logique Storage — `src` déjà résolu. */
export function PhotoImage({ src, alt = "", className = "" }: Props) {
  if (!src) {
    return (
      <div
        className={`flex h-40 w-full items-center justify-center bg-neutral-100 text-sm text-neutral-500 ${className}`}
        style={{ background: "#eee" }}
      >
        Image indisponible
      </div>
    );
  }

  return (
    <img
      src={src}
      alt={alt}
      loading="lazy"
      decoding="async"
      className={className}
      style={{ background: "#eee" }}
    />
  );
}
