import type { Db } from "../db/client";
import { withTransaction } from "../db/client";
import { nowIso } from "../shared/time";
import { scorePreliminary, buildSearchText } from "../relevance/prelim";
import { dbGet, dbRun, type ChannelRow, type VideoRow } from "../types";
import { fetchChannelFeed } from "./feed";
import { channelUrl, videoUrl } from "./input";

export type SyncTrigger = "manual" | "cli" | "all" | "import";

export type ChannelSyncOutcome = {
  channelId: string;
  title: string;
  status: "OK" | "FAILED";
  found: number;
  created: number;
  updated: number;
  error: string | null;
};

export type SyncOptions = {
  trigger?: SyncTrigger;
  fetchImpl?: typeof fetch;
  now?: () => string;
};

function countFillableChange(existing: VideoRow, incoming: {
  title: string;
  description: string;
  thumbnailUrl: string;
  sourceUpdatedAt: string | null;
  publishedAt: string;
  url: string;
}): boolean {
  return (
    existing.title !== incoming.title ||
    (existing.description ?? "") !== incoming.description ||
    (existing.thumbnail_url ?? "") !== incoming.thumbnailUrl ||
    (existing.source_updated_at ?? "") !== (incoming.sourceUpdatedAt ?? "") ||
    existing.published_at !== incoming.publishedAt ||
    existing.url !== incoming.url
  );
}

export async function syncChannel(
  db: Db,
  channel: ChannelRow,
  options: SyncOptions = {},
): Promise<ChannelSyncOutcome> {
  const trigger = options.trigger ?? "manual";
  const now = options.now ?? nowIso;
  const startedAt = now();

  const runId = dbRun(
    db,
    `INSERT INTO sync_runs (trigger, channel_id, channel_row_id, started_at, status)
     VALUES (?, ?, ?, ?, 'RUNNING')`,
    trigger,
    channel.channel_id,
    channel.id,
    startedAt,
  ).lastInsertRowid;

  const response = await fetchChannelFeed(channel.channel_id, { fetchImpl: options.fetchImpl });

  if (!response.ok) {
    const finishedAt = now();
    const message = `${response.code}: ${response.message}`.slice(0, 500);
    dbRun(
      db,
      `UPDATE sync_runs SET finished_at = ?, status = 'FAILED', error = ? WHERE id = ?`,
      finishedAt,
      message,
      runId,
    );
    dbRun(
      db,
      `UPDATE channels
          SET last_synced_at = ?, last_sync_status = 'FAILED', last_sync_error = ?,
              last_sync_new_videos = 0, updated_at = ?
        WHERE id = ?`,
      finishedAt,
      message,
      finishedAt,
      channel.id,
    );
    return {
      channelId: channel.channel_id,
      title: channel.title,
      status: "FAILED",
      found: 0,
      created: 0,
      updated: 0,
      error: message,
    };
  }

  const feed = response.feed;
  if (feed.channelId !== channel.channel_id) {
    const message = `Feed vrátil jiné Channel ID (${feed.channelId}) než požadované (${channel.channel_id}).`;
    dbRun(
      db,
      `UPDATE sync_runs SET finished_at = ?, status = 'FAILED', error = ? WHERE id = ?`,
      now(),
      message,
      runId,
    );
    dbRun(
      db,
      `UPDATE channels SET last_synced_at = ?, last_sync_status = 'FAILED', last_sync_error = ?, updated_at = ? WHERE id = ?`,
      now(),
      message,
      now(),
      channel.id,
    );
    return {
      channelId: channel.channel_id,
      title: channel.title,
      status: "FAILED",
      found: 0,
      created: 0,
      updated: 0,
      error: message,
    };
  }

  const result = withTransaction(db, () => {
    const finishedAt = now();
    const channelTitle = feed.title || channel.title;

    dbRun(
      db,
      `UPDATE channels
          SET title = ?, url = COALESCE(?, url), last_synced_at = ?, last_sync_status = 'OK',
              last_sync_error = NULL, updated_at = ?
        WHERE id = ?`,
      channelTitle,
      feed.url || channelUrl(channel.channel_id),
      finishedAt,
      finishedAt,
      channel.id,
    );

    let created = 0;
    let updated = 0;

    for (const entry of feed.entries) {
      const prelim = scorePreliminary({
        title: entry.title,
        description: entry.description,
        publishedAt: entry.publishedAt,
        priority: channel.priority,
        now: Date.parse(finishedAt),
      });
      const searchText = buildSearchText([
        entry.title,
        entry.description,
        channelTitle,
        prelim.topics.join(" "),
      ]);
      const topics = prelim.topics.join(", ") || null;
      const detail = JSON.stringify(prelim);

      const existing = dbGet<VideoRow>(db, `SELECT * FROM videos WHERE video_id = ?`, entry.videoId);

      if (!existing) {
        dbRun(
          db,
          `INSERT INTO videos (
             video_id, channel_id, title, description, published_at, source_updated_at,
             thumbnail_url, url, duration_seconds, source, is_demo, topics, search_text,
             prelim_relevance, prelim_relevance_detail, first_seen_at, last_seen_at, created_at, updated_at
           ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, NULL, 'rss', 0, ?, ?, ?, ?, ?, ?, ?, ?)`,
          entry.videoId,
          channel.channel_id,
          entry.title,
          entry.description,
          entry.publishedAt,
          entry.updatedAt,
          entry.thumbnailUrl,
          videoUrl(entry.videoId),
          topics,
          searchText,
          prelim.score,
          detail,
          finishedAt,
          finishedAt,
          finishedAt,
          finishedAt,
        );
        created += 1;
        continue;
      }

      const changed = countFillableChange(existing, {
        title: entry.title,
        description: entry.description,
        thumbnailUrl: entry.thumbnailUrl,
        sourceUpdatedAt: entry.updatedAt,
        publishedAt: entry.publishedAt,
        url: videoUrl(entry.videoId),
      });

      dbRun(
        db,
        `UPDATE videos SET
           title = ?, description = ?, published_at = ?, source_updated_at = ?,
           thumbnail_url = ?, url = ?, topics = ?, search_text = ?,
           prelim_relevance = ?, prelim_relevance_detail = ?, last_seen_at = ?, updated_at = ?
         WHERE video_id = ?`,
        entry.title,
        entry.description,
        entry.publishedAt,
        entry.updatedAt,
        entry.thumbnailUrl,
        videoUrl(entry.videoId),
        topics,
        searchText,
        prelim.score,
        detail,
        finishedAt,
        finishedAt,
        entry.videoId,
      );

      if (changed) updated += 1;
    }

    dbRun(
      db,
      `UPDATE channels SET last_sync_new_videos = ? WHERE id = ?`,
      created,
      channel.id,
    );

    dbRun(
      db,
      `UPDATE sync_runs SET finished_at = ?, status = 'OK', videos_found = ?, videos_new = ?, videos_updated = ?
        WHERE id = ?`,
      finishedAt,
      feed.entries.length,
      created,
      updated,
      runId,
    );

    return { created, updated, found: feed.entries.length, channelTitle, finishedAt };
  });

  return {
    channelId: channel.channel_id,
    title: result.channelTitle,
    status: "OK",
    found: result.found,
    created: result.created,
    updated: result.updated,
    error: null,
  };
}

export async function syncAllActive(
  db: Db,
  options: SyncOptions = {},
): Promise<{ results: ChannelSyncOutcome[]; totalNew: number; totalFound: number; failures: number }> {
  const channels = db
    .prepare(`SELECT * FROM channels WHERE is_active = 1 ORDER BY priority ASC, title COLLATE NOCASE ASC`)
    .all() as unknown as ChannelRow[];

  const results: ChannelSyncOutcome[] = [];
  for (const channel of channels) {
    results.push(await syncChannel(db, channel, { ...options, trigger: options.trigger ?? "all" }));
  }

  return {
    results,
    totalNew: results.reduce((sum, r) => sum + r.created, 0),
    totalFound: results.reduce((sum, r) => sum + r.found, 0),
    failures: results.filter((r) => r.status !== "OK").length,
  };
}

export function lastSyncRun(db: Db) {
  return dbGet<{
    id: number;
    trigger: string;
    status: string;
    started_at: string;
    finished_at: string | null;
    videos_found: number;
    videos_new: number;
    videos_updated: number;
    error: string | null;
  }>(db, `SELECT * FROM sync_runs ORDER BY id DESC LIMIT 1`);
}

export function recentSyncRuns(db: Db, limit = 10) {
  return db
    .prepare(`SELECT * FROM sync_runs ORDER BY id DESC LIMIT ?`)
    .all(limit) as unknown as {
    id: number;
    trigger: string;
    channel_id: string | null;
    status: string;
    started_at: string;
    finished_at: string | null;
    videos_found: number;
    videos_new: number;
    videos_updated: number;
    error: string | null;
  }[];
}
