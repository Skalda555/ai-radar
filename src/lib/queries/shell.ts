import type { Db } from "../db/client";
import { getConfig } from "../config";
import { dbGet } from "../types";
import { lastSyncRun } from "../youtube/sync";

export type ShellData = {
  channelTotal: number;
  channelActive: number;
  videoCount: number;
  savedCount: number;
  activeJobs: number;
  pendingAnalyses: number;
  knowledgeCount: number;
  curatedCount: number;
  lastSync: {
    finishedAt: string | null;
    status: string;
    videosNew: number;
    error: string | null;
  } | null;
  youtubeKey: boolean;
  geminiKey: boolean;
  model: string;
};

export function getShellData(db: Db): ShellData {
  const counts = dbGet<{
    channel_total: number;
    channel_active: number;
    video_count: number;
    saved_count: number;
    active_jobs: number;
    knowledge_count: number;
    curated_count: number;
  }>(
    db,
    `SELECT
      (SELECT COUNT(*) FROM channels) AS channel_total,
      (SELECT COUNT(*) FROM channels WHERE is_active = 1) AS channel_active,
      (SELECT COUNT(*) FROM videos) AS video_count,
      (SELECT COUNT(*) FROM saved_videos) AS saved_count,
      (SELECT COUNT(*) FROM analysis_jobs WHERE status IN ('PENDING','SUBMITTED','IN_PROGRESS','UNKNOWN')) AS active_jobs,
      (SELECT COUNT(*) FROM analysis_items) AS knowledge_count,
      (SELECT COUNT(*) FROM analysis_items WHERE curated_at IS NOT NULL) AS curated_count`,
  );

  const pending = dbGet<{ c: number }>(
    db,
    `SELECT COUNT(*) AS c FROM videos v
       LEFT JOIN analyses a ON a.video_id = v.video_id
       LEFT JOIN analysis_jobs j ON j.video_id = v.video_id
        AND j.status IN ('PENDING','SUBMITTED','IN_PROGRESS','UNKNOWN')
      WHERE a.id IS NULL AND j.id IS NULL`,
  );

  const config = getConfig();
  const run = lastSyncRun(db);

  return {
    channelTotal: Number(counts?.channel_total ?? 0),
    channelActive: Number(counts?.channel_active ?? 0),
    videoCount: Number(counts?.video_count ?? 0),
    savedCount: Number(counts?.saved_count ?? 0),
    activeJobs: Number(counts?.active_jobs ?? 0),
    pendingAnalyses: Number(pending?.c ?? 0),
    knowledgeCount: Number(counts?.knowledge_count ?? 0),
    curatedCount: Number(counts?.curated_count ?? 0),
    lastSync: run
      ? {
          finishedAt: run.finished_at,
          status: run.status,
          videosNew: Number(run.videos_new),
          error: run.error,
        }
      : null,
    youtubeKey: config.youtubeApiKey !== null,
    geminiKey: config.geminiApiKey !== null,
    model: config.geminiModel,
  };
}
