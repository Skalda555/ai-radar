import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { Icon } from "@/components/ui/Icon";
import { VideoPlayer } from "@/components/videos/VideoPlayer";
import { SaveButton } from "@/components/videos/SaveButton";
import { AnalyzeDialog } from "@/components/analysis/AnalyzeDialog";
import { AnalysisTabs } from "@/components/analysis/AnalysisTabs";
import { isTabId } from "@/lib/ui/tabs";
import { JobPoller } from "@/components/analysis/JobPoller";
import { RecoverButton } from "@/components/analysis/RecoverButton";
import { VideoMetadata } from "@/components/videos/VideoMetadata";
import { getDb } from "@/lib/db/client";
import { getVideoDetail } from "@/lib/queries/videos";
import { listQuestions } from "@/lib/qa/service";
import { getPreferences } from "@/lib/preferences";
import { getConfig } from "@/lib/config";
import { formatDateCs, formatDateTimeCs, relativeTimeCs } from "@/lib/shared/time";
import { parseJsonSafe, statusClass, statusLabel, JOB_STATUS_EXPLANATIONS } from "@/lib/ui/labels";
import { RelevanceGauge } from "@/components/videos/RelevanceGauge";

export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ videoId: string }>;
}): Promise<Metadata> {
  const { videoId } = await params;
  const detail = getVideoDetail(getDb(), videoId);
  return { title: detail?.analysis?.title_cs ?? detail?.video.title ?? "Video" };
}

export default async function VideoDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ videoId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { videoId } = await params;
  const sp = await searchParams;
  const tabParam = Array.isArray(sp.tab) ? sp.tab[0] : sp.tab;
  const initialTab = isTabId(tabParam) ? tabParam : undefined;
  const db = getDb();
  const detail = getVideoDetail(db, videoId);
  if (!detail) notFound();

  const { video, analysis, items, jobs } = detail;
  const questions = listQuestions(db, videoId);
  const config = getConfig();
  const prefs = getPreferences(db);
  const activeJob = jobs.find((job) =>
    ["PENDING", "SUBMITTED", "IN_PROGRESS"].includes(job.status),
  );
  const unknownJob = jobs.find((job) => job.status === "UNKNOWN");
  const prelim = parseJsonSafe<{
    score?: number;
    topics?: string[];
    reasons?: string[];
    components?: { keyword: number; recency: number; priority: number };
  }>(video.prelim_relevance_detail, {});

  const displayTitle =
    analysis?.title_cs?.trim() || video.title_cs_google?.trim() || video.title;
  const showOriginal = displayTitle !== video.title;
  const translatedByGoogle = !analysis?.title_cs && Boolean(video.title_cs_google);

  return (
    <div className="page">
      <nav style={{ marginBottom: 14 }}>
        <Link href="/videa" className="btn btn-sm btn-ghost" style={{ paddingLeft: 0 }}>
          <Icon name="chevronLeft" size={15} /> Zpět na videa
        </Link>
      </nav>

      <div className="detail-top">
        <VideoPlayer
          videoId={video.video_id}
          thumbnailUrl={video.thumbnail_url}
          title={video.title}
        />
        <header className="detail-info">
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
          <span className="chip chip-neutral">{video.channel_title}</span>
          <span className={statusClass(video.analysis_status)}>{statusLabel(video.analysis_status)}</span>
          {video.is_saved ? <span className="chip chip-accent">Na později</span> : null}
          <span className="tiny muted">přidáno {relativeTimeCs(video.first_seen_at)}</span>
        </div>

        <h1 style={{ maxWidth: "34ch" }}>{displayTitle}</h1>
        {showOriginal ? (
          <p className="muted" style={{ margin: "-6px 0 0" }}>
            Původní název: {video.title}
            {translatedByGoogle ? " · překlad názvu: Google Translate" : ""}
          </p>
        ) : null}

        <div className="video-meta" style={{ fontSize: 13.5 }}>
          <time dateTime={video.published_at} title={formatDateTimeCs(video.published_at)}>
            <Icon name="clock" size={13} /> {formatDateCs(video.published_at)}
          </time>
          {video.duration_seconds ? <span>délka {Math.round(video.duration_seconds / 60)} min</span> : null}
        </div>

        <div style={{ display: "flex", gap: 9, flexWrap: "wrap", alignItems: "center" }}>
          <AnalyzeDialog
            videoId={video.video_id}
            videoTitle={video.title}
            model={config.geminiModel}
            geminiKey={Boolean(config.geminiApiKey)}
            hasAnalysis={Boolean(analysis)}
            activeJobId={activeJob?.id ?? null}
            unknownJobId={unknownJob?.id ?? null}
            defaultMode={prefs.defaultAnalysisMode}
          />
          <SaveButton videoId={video.video_id} initialSaved={Boolean(video.is_saved)} size="md" />
          <a
            className="btn"
            href={video.url}
            target="_blank"
            rel="noreferrer noopener"
            title="Otevřít na YouTube"
          >
            <Icon name="external" size={16} /> Otevřít YouTube
          </a>
        </div>
        </header>
      </div>

      {activeJob ? (
        <div style={{ marginBottom: 18 }}>
          <JobPoller jobId={activeJob.id} initialStatus={activeJob.status} />
        </div>
      ) : null}

      <div className="detail-grid">
        <div style={{ display: "grid", gap: 18, minWidth: 0 }}>
          {analysis ? (
            <AnalysisTabs
              analysis={analysis}
              items={items}
              video={{
                videoId: video.video_id,
                title: video.title,
                url: video.url,
                channelTitle: video.channel_title,
                publishedAt: video.published_at,
              }}
              tokenInput={analysis.token_input}
              tokenOutput={analysis.token_output}
              questions={questions}
              model={config.geminiModel}
              geminiKey={Boolean(config.geminiApiKey)}
              initialTab={initialTab}
            />
          ) : (
            <section className="panel" style={{ padding: 20 }}>
              <div className="eyebrow">Bez analýzy</div>
              <h2 style={{ margin: "6px 0 8px" }}>Tohle video zatím nemá AI analýzu</h2>
              <p className="lede" style={{ marginBottom: 0 }}>
                Analýza se nespouští automaticky. Tlačítkem výše otevřeš potvrzení s modelem, videem a
                upozorněním na možnou spotřebu API. Bez potvrzení se neodešle žádný placený požadavek.
              </p>
            </section>
          )}
        </div>

        <aside style={{ display: "grid", gap: 14, minWidth: 0 }}>
          <section className="panel" style={{ padding: 16 }}>
            <div className="eyebrow">Kontext</div>
            <dl style={{ margin: "10px 0 0", display: "grid", gap: 8, fontSize: 13.5 }}>
              <div style={{ display: "flex", justifyContent: "space-between", gap: 10 }}>
                <dt className="muted">Kanál</dt>
                <dd style={{ margin: 0, textAlign: "right" }}>{video.channel_title}</dd>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", gap: 10 }}>
                <dt className="muted">Publikováno</dt>
                <dd style={{ margin: 0 }}>{formatDateCs(video.published_at)}</dd>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", gap: 10 }}>
                <dt className="muted">Zdroj metadat</dt>
                <dd style={{ margin: 0 }} className="mono">
                  {video.source}
                </dd>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", gap: 10 }}>
                <dt className="muted">Délka</dt>
                <dd style={{ margin: 0 }}>
                  {video.duration_seconds ? `${Math.round(video.duration_seconds / 60)} min` : "neznámá"}
                </dd>
              </div>
            </dl>
            <p className="tiny muted" style={{ margin: "10px 0 0" }}>
              Délku ukládáme jen tehdy, když ji zdroj skutečně poskytne. RSS ji neobsahuje, proto je
              obvykle neznámá.
            </p>
          </section>

          <section className="panel" style={{ padding: 16 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
              <div className="eyebrow">Odhad relevance z metadat</div>
              <RelevanceGauge score={video.prelim_relevance} kind="odhad" />
            </div>
            <div style={{ display: "flex", alignItems: "baseline", gap: 8, marginTop: 8 }}>
              <span style={{ fontSize: 30, fontWeight: 650, fontVariantNumeric: "tabular-nums" }}>
                {video.prelim_relevance != null ? Math.round(video.prelim_relevance) : "—"}
              </span>
              <span className="muted tiny">/ 100</span>
            </div>
            {prelim.topics && prelim.topics.length > 0 ? (
              <div style={{ display: "flex", gap: 5, flexWrap: "wrap", marginTop: 8 }}>
                {prelim.topics.map((topic) => (
                  <span key={topic} className="chip chip-accent">
                    {topic}
                  </span>
                ))}
              </div>
            ) : null}
            {prelim.reasons ? (
              <ul className="tiny muted" style={{ margin: "10px 0 0 16px", padding: 0 }}>
                {prelim.reasons.map((reason) => (
                  <li key={reason} style={{ marginBottom: 3 }}>
                    {reason}
                  </li>
                ))}
              </ul>
            ) : null}
            <p className="tiny" style={{ color: "#6F7C8A", margin: "10px 0 0" }}>
              Heuristika z názvu, popisu a priority kanálu. Nepoužívá Gemini a nedokazuje kvalitu videa.
            </p>
          </section>

          {analysis ? (
            <section className="panel" style={{ padding: 16 }}>
              <div className="eyebrow">Analýza</div>
              <dl style={{ margin: "10px 0 0", display: "grid", gap: 8, fontSize: 13.5 }}>
                <div style={{ display: "flex", justifyContent: "space-between", gap: 10 }}>
                  <dt className="muted">Relevance</dt>
                  <dd style={{ margin: 0 }}>{analysis.relevance_score ?? "—"} / 100</dd>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", gap: 10 }}>
                  <dt className="muted">Model</dt>
                  <dd style={{ margin: 0 }} className="mono">
                    {analysis.model}
                  </dd>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", gap: 10 }}>
                  <dt className="muted">Vytvořeno</dt>
                  <dd style={{ margin: 0 }}>{formatDateTimeCs(analysis.created_at)}</dd>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", gap: 10 }}>
                  <dt className="muted">Poznatků</dt>
                  <dd style={{ margin: 0 }}>{items.length}</dd>
                </div>
              </dl>
            </section>
          ) : null}

          {jobs.length > 0 ? (
            <section className="panel" style={{ padding: 16 }}>
              <div className="eyebrow">Historie úloh</div>
              <div style={{ display: "grid", gap: 9, marginTop: 10 }}>
                {jobs.slice(0, 4).map((job) => (
                  <div key={job.id} style={{ display: "grid", gap: 3 }}>
                    <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
                      <span className={statusClass(job.status)}>{statusLabel(job.status)}</span>
                      <span className="tiny muted">{formatDateTimeCs(job.created_at)}</span>
                    </div>
                    <div className="tiny muted" style={{ lineHeight: 1.45 }}>
                      {JOB_STATUS_EXPLANATIONS[job.status] ?? ""}
                    </div>
                    {job.error_message ? (
                      <div className="tiny" style={{ color: "#F0A3A3", wordBreak: "break-word" }}>
                        {job.error_message}
                      </div>
                    ) : null}
                    {job.status === "FAILED" ? (
                      <div style={{ marginTop: 4 }}>
                        <RecoverButton jobId={job.id} />
                      </div>
                    ) : null}
                  </div>
                ))}
              </div>
              <Link href="/zpracovani" className="btn btn-sm btn-ghost" style={{ marginTop: 10 }}>
                Všechny úlohy <Icon name="arrowRight" size={13} />
              </Link>
            </section>
          ) : null}
        </aside>
      </div>

      <VideoMetadata
        video={{
          videoId: video.video_id,
          channelTitle: video.channel_title,
          publishedAt: video.published_at,
          sourceUpdatedAt: video.source_updated_at,
          durationSeconds: video.duration_seconds,
          source: video.source,
          description: video.description,
          url: video.url,
        }}
      />
    </div>
  );
}
