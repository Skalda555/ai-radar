"use client";

import { useState } from "react";
import { Icon } from "../ui/Icon";

export function Thumbnail({
  src,
  alt,
  className,
}: {
  src: string | null | undefined;
  alt: string;
  className?: string;
}) {
  const [failed, setFailed] = useState(false);
  const usable = Boolean(src) && !failed;

  if (!usable) {
    return (
      <div className="thumb-fallback" role="img" aria-label={`Miniatura není dostupná: ${alt}`}>
        <Icon name="videos" size={26} />
        <span>Miniatura není dostupná</span>
      </div>
    );
  }

  return (
    <img
      src={src as string}
      alt={alt}
      className={className}
      loading="lazy"
      decoding="async"
      referrerPolicy="no-referrer"
      onError={() => setFailed(true)}
    />
  );
}
