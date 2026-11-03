import type { Db } from "../db/client";
import { dbGet } from "../types";
import { listTopVideos, listVideos, type VideoListResult } from "./videos";
import type { VideoListRow } from "../types";

export type DashboardData = {
  newVideos7d: number;
  completedAnalyses: number;
  pendingAnalyses: number;
  failedJobs: number;
  savedCount: number;
  totalVideos: number;
  important: VideoListRow[];
  latest: VideoListResult;
  lastSync: {
    startedAt: string | null;
    finishedAt: string | null;
    status: string;
    videosNew: number;
    error: string | null;
  } | null;
};

export function getDashboardData(db: Db): DashboardData {
  const cutoff = new Date(Date.now() - 7 * 86_400_000).toISOString();

  const stats = dbGet<{
    new_videos: number;
    completed: number;
    pending: number;
    failed: number;
    saved: number;
    total: number;
  }>(
    db,
    `SELECT
       (SELECT COUNT(*) FROM videos WHERE first_seen_at >= ?) AS new_videos,
       (SELECT COUNT(*) FROM analyses WHERE status = 'COMPLETED') AS completed,
       (SELECT COUNT(*) FROM analysis_jobs WHERE status IN ('PENDING','SUBMITTED','IN_PROGRESS','UNKNOWN')) AS pending,
       (SELECT COUNT(*) FROM analysis_jobs WHERE status = 'FAILED') AS failed,
       (SELECT COUNT(*) FROM saved_videos) AS saved,
       (SELECT COUNT(*) FROM videos) AS total`,
    cutoff,
  );

  const sync = dbGet<{
    started_at: string;
    finished_at: string | null;
    status: string;
    videos_new: number;
    error: string | null;
  }>(db, `SELECT * FROM sync_runs ORDER BY id DESC LIMIT 1`);

  return {
    newVideos7d: Number(stats?.new_videos ?? 0),
    completedAnalyses: Number(stats?.completed ?? 0),
    pendingAnalyses: Number(stats?.pending ?? 0),
    failedJobs: Number(stats?.failed ?? 0),
    savedCount: Number(stats?.saved ?? 0),
    totalVideos: Number(stats?.total ?? 0),
    important: listTopVideos(db, { limit: 3 }),
    latest: listVideos(db, { sort: "newest", perPage: 6 }),
    lastSync: sync
      ? {
          startedAt: sync.started_at,
          finishedAt: sync.finished_at,
          status: sync.status,
          videosNew: Number(sync.videos_new),
          error: sync.error,
        }
      : null,
  };
}
