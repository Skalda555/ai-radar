"use client";

import { useState } from "react";
import { Icon } from "../ui/Icon";
import { Thumbnail } from "./Thumbnail";

/**
 * Poster + click-to-play. The embed is created only after the user asks for it,
 * so the page does not request YouTube on its own.
 */
export function VideoPlayer({
  videoId,
  thumbnailUrl,
  title,
}: {
  videoId: string;
  thumbnailUrl: string | null;
  title: string;
}) {
  const [playing, setPlaying] = useState(false);

  if (playing) {
    return (
      <div className="video-frame">
        <iframe
          src={`https://www.youtube-nocookie.com/embed/${encodeURIComponent(videoId)}?autoplay=1&rel=0`}
          title={title}
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
          allowFullScreen
          referrerPolicy="strict-origin-when-cross-origin"
        />
      </div>
    );
  }

  return (
    <div className="video-frame">
      <Thumbnail src={thumbnailUrl} alt="" />
      <button
        type="button"
        className="play-overlay"
        onClick={() => setPlaying(true)}
        aria-label={`Přehrát video: ${title}`}
      >
        <span className="play-disc">
          <Icon name="play" size={24} />
        </span>
      </button>
    </div>
  );
}
