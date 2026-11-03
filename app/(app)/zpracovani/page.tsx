import Link from "next/link";
import type { Metadata } from "next";
import { Icon } from "@/components/ui/Icon";
import { JobCheckButton } from "@/components/analysis/JobCheckButton";
import { RecoverButton } from "@/components/analysis/RecoverButton";
import { ResumeJobsButton } from "@/components/analysis/JobPoller";
import { getDb } from "@/lib/db/client";
import { dbAll, dbGet, type JobRow } from "@/lib/types";
import { formatDateTimeCs, relativeTimeCs } from "@/lib/shared/time";
import { JOB_STATUS_EXPLANATIONS, statusClass, statusLabel, jobDuration } from "@/lib/ui/labels";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Zpracování" };

type JobListRow = JobRow & { video_title: string; channel_title: string; analysis_exists: number };

const ACTIVE_STATUSES = ["PENDING", "SUBMITTED", "IN_PROGRESS"];

function JobRowView({ job }: { job: JobListRow }) {
  const isActive = ACTIVE_STATUSES.includes(job.status);
  const explanation = JOB_STATUS_EXPLANATIONS[job.status] ?? statusLabel(job.status);
  const started = job.request_started_at ?? job.created_at;

  return (
    <div className="job-row">
      <div className="job-main">
        <Link href={`/video/${job.video_id}`} className="job-title clamp-1" title={job.video_title}>
          {job.video_title}
        </Link>
        <div className="job-meta">
          <span>{job.channel_title}</span>
          <span>
            {job.model} · {job.mode}
          </span>
          <span>
            Začátek {formatDateTimeCs(started)} · {relativeTimeCs(started)}
          </span>
          {job.last_checked_at ? <span>Kontrola {formatDateTimeCs(job.last_checked_at)}</span> : null}
          {jobDuration(job) ? <span>doba {jobDuration(job)}</span> : null}
          {job.token_input != null || job.token_output != null ? (
            <span>
              {job.token_input ?? "?"} / {job.token_output ?? "?"} tok.
            </span>
          ) : null}
        </div>
        {job.error_message ? (
          <div className="job-error clamp-1" title={job.error_message}>
            {job.error_message}
          </div>
        ) : null}
      </div>

      <div className="job-side">
        <span className={statusClass(job.status)} title={explanation}>
          {statusLabel(job.status)}
        </span>
        {isActive ? <JobCheckButton jobId={job.id} /> : null}
        {job.status === "FAILED" ? <RecoverButton jobId={job.id} /> : null}
        {job.analysis_exists ? (
          <Link href={`/video/${job.video_id}`} className="btn btn-sm btn-ghost">
            <Icon name="arrowRight" size={13} /> Otevřít výsledek
          </Link>
        ) : null}
        <a
          className="btn btn-sm btn-ghost btn-icon"
          href={`https://www.youtube.com/watch?v=${job.video_id}`}
          target="_blank"
          rel="noreferrer noopener"
          aria-label="Otevřít video na YouTube"
          title="Otevřít video na YouTube"
        >
          <Icon name="external" size={14} />
        </a>
      </div>
    </div>
  );
}

export default function ProcessingPage() {
  const db = getDb();
  const jobs = dbAll<JobListRow>(
    db,
    `SELECT j.*, v.title AS video_title, c.title AS channel_title,
            (a.id IS NOT NULL) AS analysis_exists
       FROM analysis_jobs j
       JOIN videos v ON v.video_id = j.video_id
       JOIN channels c ON c.channel_id = v.channel_id
       LEFT JOIN analyses a ON a.video_id = j.video_id
      ORDER BY j.created_at DESC
      LIMIT 100`,
  );

  const stats = dbGet<{ tokens: number }>(
    db,
    `SELECT COALESCE(SUM(token_total), 0) AS tokens FROM api_usage WHERE provider = 'gemini'`,
  );

  const activeJobs = jobs.filter((job) => ACTIVE_STATUSES.includes(job.status));
  const finishedJobs = jobs.filter((job) => !ACTIVE_STATUSES.includes(job.status));

  return (
    <div className="page zpracovani-page">
      <header className="page-head">
        <div>
          <div className="eyebrow">Analytická fronta</div>
          <h1>Zpracování</h1>
          <p className="lede">
            Stav uložených Gemini Interactions. Kontrola stavu je ruční a používá známé Interaction
            ID; nové analytické POST požadavky se automaticky neopakují.
          </p>
        </div>
        <ResumeJobsButton />
      </header>

      <section className="job-group">
        <div className="job-group-head">
          <h2>Čeká nebo běží</h2>
          <span>{activeJobs.length} úloh</span>
        </div>
        {activeJobs.length === 0 ? (
          <p className="tiny muted" style={{ margin: 0 }}>
            Nic neběží. Novou úlohu spustíš z detailu videa.
          </p>
        ) : (
          <div className="job-list">
            {activeJobs.map((job) => (
              <JobRowView key={job.id} job={job} />
            ))}
          </div>
        )}
      </section>

      <section className="job-group">
        <div className="job-group-head">
          <h2>Dokončeno a selhalo</h2>
          <span>{finishedJobs.length} uložených úloh</span>
        </div>
        {finishedJobs.length === 0 ? (
          <p className="tiny muted" style={{ margin: 0 }}>
            Zatím žádná dokončená ani selhaná úloha.
          </p>
        ) : (
          <div className="job-list">
            {finishedJobs.map((job) => (
              <JobRowView key={job.id} job={job} />
            ))}
          </div>
        )}
      </section>

      <p className="tiny muted" style={{ margin: "0 0 14px" }}>
        Tokenů evidováno: {Number(stats?.tokens ?? 0).toLocaleString("cs-CZ")}
      </p>

      <details className="panel" style={{ padding: 14 }}>
        <summary style={{ cursor: "pointer", fontSize: 14, fontWeight: 600 }}>
          Co jednotlivé stavy znamenají
        </summary>
        <dl style={{ display: "grid", gap: 8, margin: "10px 0 0", fontSize: 13.5 }}>
          {Object.entries(JOB_STATUS_EXPLANATIONS).map(([status, explanation]) => (
            <div key={status} style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
              <dt style={{ minWidth: 150 }}>
                <span className={statusClass(status)}>{statusLabel(status)}</span>
              </dt>
              <dd style={{ margin: 0, color: "var(--color-muted)", flex: 1 }}>{explanation}</dd>
            </div>
          ))}
        </dl>
      </details>
    </div>
  );
}
