import { formatDateTimeCs } from "@/lib/shared/time";
import { formatDuration } from "@/lib/shared/text";

export type VideoMetadataInput = {
  videoId: string;
  channelTitle: string;
  publishedAt: string;
  sourceUpdatedAt: string | null;
  durationSeconds: number | null;
  source: string;
  description: string | null;
  url: string;
};

const SOURCE_LABELS: Record<string, string> = {
  rss: "RSS feed",
  demo: "demo data",
  test: "testovací data",
};

export function VideoMetadata({ video }: { video: VideoMetadataInput }) {
  const duration = formatDuration(video.durationSeconds);

  const rows: { label: string; value: React.ReactNode }[] = [
    { label: "YouTube ID", value: <span className="mono">{video.videoId}</span> },
    { label: "Kanál", value: video.channelTitle },
    { label: "Publikováno", value: formatDateTimeCs(video.publishedAt) },
    {
      label: "Aktualizováno",
      value: video.sourceUpdatedAt ? formatDateTimeCs(video.sourceUpdatedAt) : "—",
    },
    { label: "Délka", value: duration ?? "neznámá" },
    { label: "Zdroj", value: SOURCE_LABELS[video.source] ?? video.source },
  ];

  return (
    <section className="panel" style={{ marginTop: 22 }} aria-labelledby="video-metadata-title">
      <div className="panel-head">
        <h2 id="video-metadata-title" style={{ fontSize: 15 }}>
          Metadata videa
        </h2>
        <a href={video.url} target="_blank" rel="noreferrer noopener" className="btn btn-sm btn-ghost">
          YouTube
        </a>
      </div>

      <div className="panel-body">
        <dl className="meta-grid">
          {rows.map((row) => (
            <div key={row.label} className="meta-row">
              <dt>{row.label}</dt>
              <dd>{row.value}</dd>
            </div>
          ))}
        </dl>

        {video.description ? (
          <details className="evidence" style={{ marginTop: 14 }}>
            <summary>Popis videa</summary>
            <div
              className="prose-cs"
              style={{ marginTop: 8, fontSize: 14, color: "#B9C6D3", whiteSpace: "pre-wrap" }}
            >
              {video.description}
            </div>
          </details>
        ) : null}

        <details className="evidence" style={{ marginTop: 10 }}>
          <summary>Originál</summary>
          <div className="mono tiny" style={{ marginTop: 8, display: "grid", gap: 4 }}>
            <span>url: {video.url}</span>
            <span>video_id: {video.videoId}</span>
            <span>source: {video.source}</span>
            <span>published_at: {video.publishedAt}</span>
            <span>source_updated_at: {video.sourceUpdatedAt ?? "—"}</span>
          </div>
        </details>
      </div>
    </section>
  );
}
