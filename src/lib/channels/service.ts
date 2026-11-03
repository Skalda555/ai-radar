import type { Db } from "../db/client";
import { withTransaction } from "../db/client";
import { backupDatabase } from "../db/backup";
import { nowIso } from "../shared/time";
import { dbAll, dbGet, dbRun, plainRow, plainRows, type ChannelRow, type ChannelStats } from "../types";
import { fold } from "../shared/text";
import { parseChannelInput } from "../youtube/input";
import { resolveChannel, type ResolveResult } from "../youtube/resolve";
import { syncChannel, type ChannelSyncOutcome } from "../youtube/sync";
import { recordUsage } from "../usage";

export type AddChannelResult =
  | {
      status: "CREATED" | "ALREADY_EXISTS";
      channel: ChannelRow;
      sync: ChannelSyncOutcome | null;
      resolution: ResolveResult;
    }
  | { status: "FAILED"; code: string; message: string };

export type AddChannelOptions = {
  syncNow?: boolean;
  fetchImpl?: typeof fetch;
  now?: () => string;
  priority?: number;
  category?: string | null;
  language?: string | null;
  relevanceScore?: number | null;
  source?: string;
  isDemo?: boolean;
};

export async function addChannelFromInput(
  db: Db,
  rawInput: string,
  options: AddChannelOptions = {},
): Promise<AddChannelResult> {
  const parsed = parseChannelInput(rawInput);
  const resolution = await resolveChannel(parsed, { fetchImpl: options.fetchImpl });

  if (!resolution.ok) {
    return { status: "FAILED", code: resolution.code, message: resolution.message };
  }

  if (resolution.method !== "DIRECT_ID") {
    recordUsage(db, {
      provider: "youtube",
      operation: "channels.list",
      requestCount: 1,
      httpStatus: 200,
    });
  }

  const resolved = resolution.channel;
  const existing = dbGet<ChannelRow>(db, `SELECT * FROM channels WHERE channel_id = ?`, resolved.channelId);
  if (existing) {
    return { status: "ALREADY_EXISTS", channel: plainRow<ChannelRow>(existing), sync: null, resolution };
  }

  const timestamp = (options.now ?? nowIso)();
  const priority = options.priority ?? 3;
  const source = options.source ?? "manual";
  const isDemo = options.isDemo ? 1 : 0;

  const channelId = dbRun(
    db,
    `INSERT INTO channels (
       channel_id, handle, url, title, description, thumbnail_url, category, priority,
       language, relevance_score, is_active, is_demo, source, created_at, updated_at
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?, ?, ?)`,
    resolved.channelId,
    resolved.handle,
    resolved.url,
    resolved.title,
    resolved.description,
    resolved.thumbnailUrl,
    options.category ?? null,
    priority,
    options.language ?? null,
    options.relevanceScore ?? null,
    isDemo,
    source,
    timestamp,
    timestamp,
  ).lastInsertRowid;

  const channel = dbGet<ChannelRow>(db, `SELECT * FROM channels WHERE id = ?`, channelId);
  if (!channel) {
    return { status: "FAILED", code: "DB_ERROR", message: "Kanál se nepodařilo uložit." };
  }

  let sync: ChannelSyncOutcome | null = null;
  if (options.syncNow !== false) {
    sync = await syncChannel(db, channel, { trigger: "manual", fetchImpl: options.fetchImpl, now: options.now });
  }

  return { status: "CREATED", channel: plainRow<ChannelRow>(channel), sync, resolution };
}

export function listChannels(db: Db): ChannelStats[] {
  return plainRows<ChannelStats>(
    dbAll<ChannelStats>(
      db,
    `SELECT c.*,
            (SELECT COUNT(*) FROM videos v WHERE v.channel_id = c.channel_id) AS video_count,
            (SELECT COUNT(*) FROM saved_videos s JOIN videos v ON v.video_id = s.video_id WHERE v.channel_id = c.channel_id) AS saved_count,
            (SELECT COUNT(*) FROM analyses a JOIN videos v ON v.video_id = a.video_id WHERE v.channel_id = c.channel_id) AS analyzed_count
       FROM channels c
      ORDER BY c.is_active DESC, c.priority ASC, c.title COLLATE NOCASE ASC`,
    ),
  );
}

export function getChannel(db: Db, channelId: string): ChannelRow | undefined {
  return dbGet<ChannelRow>(db, `SELECT * FROM channels WHERE channel_id = ?`, channelId);
}

export function setChannelActive(db: Db, channelId: string, active: boolean): boolean {
  const result = dbRun(
    db,
    `UPDATE channels SET is_active = ?, updated_at = ? WHERE channel_id = ?`,
    active ? 1 : 0,
    nowIso(),
    channelId,
  );
  return result.changes > 0;
}

export function countChannels(db: Db): { total: number; active: number } {
  const row = dbGet<{ total: number; active: number }>(
    db,
    `SELECT COUNT(*) AS total, COALESCE(SUM(is_active), 0) AS active FROM channels`,
  );
  return { total: Number(row?.total ?? 0), active: Number(row?.active ?? 0) };
}

export function seedChannels(
  db: Db,
  rows: {
    channelId: string;
    title: string;
    handle?: string | null;
    priority?: number;
    category?: string | null;
    isDemo?: boolean;
    isActive?: boolean;
  }[],
): number {
  return withTransaction(db, () => {
    let inserted = 0;
    const timestamp = nowIso();
    for (const row of rows) {
      const existing = dbGet<ChannelRow>(db, `SELECT id FROM channels WHERE channel_id = ?`, row.channelId);
      if (existing) continue;
      dbRun(
        db,
        `INSERT INTO channels (channel_id, handle, url, title, priority, category, is_active, is_demo, source, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'seed', ?, ?)`,
        row.channelId,
        row.handle ?? null,
        `https://www.youtube.com/channel/${row.channelId}`,
        row.title,
        row.priority ?? 3,
        row.category ?? null,
        row.isActive === false ? 0 : 1,
        row.isDemo ? 1 : 0,
        timestamp,
        timestamp,
      );
      inserted += 1;
    }
    return inserted;
  });
}
export type DeletionImpact = {
  channelId: string;
  title: string;
  videos: number;
  analyses: number;
  items: number;
  saved: number;
  questions: number;
  jobs: number;
};

export function getChannelDeletionImpact(db: Db, channelId: string): DeletionImpact | null {
  const channel = getChannel(db, channelId);
  if (!channel) return null;

  const counts = dbGet<{
    videos: number;
    analyses: number;
    items: number;
    saved: number;
    questions: number;
    jobs: number;
  }>(
    db,
    `SELECT
       (SELECT COUNT(*) FROM videos WHERE channel_id = ?1) AS videos,
       (SELECT COUNT(*) FROM analyses a JOIN videos v ON v.video_id = a.video_id WHERE v.channel_id = ?1) AS analyses,
       (SELECT COUNT(*) FROM analysis_items i JOIN videos v ON v.video_id = i.video_id WHERE v.channel_id = ?1) AS items,
       (SELECT COUNT(*) FROM saved_videos s JOIN videos v ON v.video_id = s.video_id WHERE v.channel_id = ?1) AS saved,
       (SELECT COUNT(*) FROM analysis_questions q JOIN videos v ON v.video_id = q.video_id WHERE v.channel_id = ?1) AS questions,
       (SELECT COUNT(*) FROM analysis_jobs j JOIN videos v ON v.video_id = j.video_id WHERE v.channel_id = ?1) AS jobs`,
    channelId,
  );

  return {
    channelId,
    title: channel.title,
    videos: Number(counts?.videos ?? 0),
    analyses: Number(counts?.analyses ?? 0),
    items: Number(counts?.items ?? 0),
    saved: Number(counts?.saved ?? 0),
    questions: Number(counts?.questions ?? 0),
    jobs: Number(counts?.jobs ?? 0),
  };
}

export type DeleteChannelResult =
  | { ok: true; impact: DeletionImpact; backupPath: string | null }
  | { ok: false; code: string; message: string; status: number };

/**
 * Removing a channel removes its videos and every analysis attached to them.
 * A verified backup is written first (except for in-memory test databases), and
 * full-text rows are cleared before the cascade so no orphan index entries stay.
 */
export function deleteChannel(
  db: Db,
  channelId: string,
  options: { dbPath?: string } = {},
): DeleteChannelResult {
  const impact = getChannelDeletionImpact(db, channelId);
  if (!impact) {
    return { ok: false, code: "NOT_FOUND", message: "Kanál není v databázi.", status: 404 };
  }

  let backupPath: string | null = null;
  if (options.dbPath && options.dbPath !== ":memory:") {
    backupPath = backupDatabase(db, options.dbPath, "pre-delete-channel");
  }

  withTransaction(db, () => {
    dbRun(
      db,
      `DELETE FROM knowledge_fts WHERE rowid IN (
         SELECT i.id FROM analysis_items i
           JOIN videos v ON v.video_id = i.video_id
          WHERE v.channel_id = ?
       )`,
      channelId,
    );
    dbRun(
      db,
      `DELETE FROM analysis_runs WHERE video_id IN (SELECT video_id FROM videos WHERE channel_id = ?)`,
      channelId,
    );
    dbRun(db, `DELETE FROM channels WHERE channel_id = ?`, channelId);
  });

  return { ok: true, impact, backupPath };
}
/** Reuses the existing spelling of a category when it only differs by case or diacritics. */
export function canonicalCategory(db: Db, input: string | null | undefined): string | null {
  const value = (input ?? "").trim();
  if (!value) return null;

  const rows = db
    .prepare(
      `SELECT DISTINCT category FROM channels
        WHERE category IS NOT NULL AND LENGTH(TRIM(category)) > 0`,
    )
    .all() as unknown as { category: string }[];

  const target = fold(value);
  const match = rows.find((row) => fold(row.category) === target);
  return match ? match.category : value.slice(0, 60);
}
export function setChannelCategory(
  db: Db,
  channelId: string,
  input: string | null | undefined,
): { ok: boolean; category: string | null } {
  const channel = getChannel(db, channelId);
  if (!channel) return { ok: false, category: null };

  const category = canonicalCategory(db, input);
  dbRun(
    db,
    `UPDATE channels SET category = ?, updated_at = ? WHERE channel_id = ?`,
    category,
    nowIso(),
    channelId,
  );
  return { ok: true, category };
}