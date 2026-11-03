import Link from "next/link";
import { Icon } from "../ui/Icon";
import { Thumbnail } from "./Thumbnail";
import { RelevanceGauge } from "./RelevanceGauge";
import { SaveButton } from "./SaveButton";
import { formatDateCs, relativeTimeCs } from "@/lib/shared/time";
import { formatDuration } from "@/lib/shared/text";
import { statusClass, statusLabel, VERIFICATION_LABELS } from "@/lib/ui/labels";
import type { VideoListRow } from "@/lib/types";

export function VideoCard({ video }: { video: VideoListRow }) {
  const duration = formatDuration(video.duration_seconds);
  const displayTitle =
    video.analysis_title_cs?.trim() || video.title_cs_google?.trim() || video.title;
  const relevance = video.analysis_score ?? video.prelim_relevance ?? null;
  const relevanceKind = video.analysis_score !== null ? "analýza" : "odhad";

  return (
    <article className="video-card video-card--compact">
      <div className="thumb-wrap">
        <Link href={`/video/${video.video_id}`} aria-label={`Detail videa ${displayTitle}`}>
          <Thumbnail src={video.thumbnail_url} alt={displayTitle} />
        </Link>
        <div className="thumb-badges">
          {duration ? <span className="chip chip-live">{duration}</span> : null}
          {video.is_saved ? (
            <span className="chip chip-accent">
              <Icon name="saved" size={11} /> Uloženo
            </span>
          ) : null}
        </div>
      </div>

      <div className="video-card-body">
        <div className="video-card-channel">
          <span>{video.channel_title}</span>
          <time dateTime={video.published_at} title={formatDateCs(video.published_at)}>
            <Icon name="clock" size={12} /> {relativeTimeCs(video.published_at)}
          </time>
        </div>

        <h3 className="video-title">
          <Link href={`/video/${video.video_id}`} style={{ textDecoration: "none" }} title={video.title}>
            {displayTitle}
          </Link>
        </h3>
      </div>

      <div className="video-card-footer">
        <span className={statusClass(video.analysis_status)}>{statusLabel(video.analysis_status)}</span>
        {relevance !== null ? <RelevanceGauge score={relevance} kind={relevanceKind} /> : null}
        <Link href={`/video/${video.video_id}`} className="btn btn-sm" title="Otevřít detail">
          Detail
        </Link>
        <SaveButton videoId={video.video_id} initialSaved={Boolean(video.is_saved)} iconOnly />
        <a
          className="btn btn-sm btn-ghost btn-icon"
          href={video.url}
          target="_blank"
          rel="noreferrer noopener"
          aria-label="Otevřít na YouTube"
          title="Otevřít na YouTube"
        >
          <Icon name="external" size={15} />
        </a>
      </div>
    </article>
  );
}

export function CompactVideoRow({ video }: { video: VideoListRow }) {
  const displayTitle =
    video.analysis_title_cs?.trim() || video.title_cs_google?.trim() || video.title;

  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "112px minmax(0, 1fr) auto",
        gap: 12,
        alignItems: "center",
        padding: "10px 0",
        borderBottom: "1px solid var(--color-line)",
      }}
    >
      <div className="thumb-wrap" style={{ borderRadius: 8, border: "1px solid var(--color-line)" }}>
        <Link href={`/video/${video.video_id}`}>
          <Thumbnail src={video.thumbnail_url} alt={displayTitle} />
        </Link>
      </div>
      <div style={{ minWidth: 0 }}>
        <Link
          href={`/video/${video.video_id}`}
          style={{ textDecoration: "none", fontWeight: 600, fontSize: 14.5 }}
          title={video.title}
        >
          {displayTitle}
        </Link>
        <div className="video-meta" style={{ marginTop: 3 }}>
          <span>{video.channel_title}</span>
          <span aria-hidden="true">·</span>
          <time dateTime={video.published_at}>{relativeTimeCs(video.published_at)}</time>
        </div>
      </div>
      <div style={{ display: "grid", gap: 5, justifyItems: "end" }}>
        <span className={statusClass(video.analysis_status)}>{statusLabel(video.analysis_status)}</span>
        {video.prelim_relevance !== null ? (
          <RelevanceGauge score={video.prelim_relevance} kind="odhad" />
        ) : null}
      </div>
    </div>
  );
}

export function VerificationBadge({ status }: { status: string }) {
  return <span title={status}>{VERIFICATION_LABELS[status] ?? status}</span>;
}
