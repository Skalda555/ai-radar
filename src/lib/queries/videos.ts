import type { Db } from "../db/client";
import { plainRow, plainRows, type VideoListRow } from "../types";
import { fold } from "../shared/text";

export const VIDEO_STATUS_OPTIONS = [
  { value: "ALL", label: "Všechny stavy" },
  { value: "NOT_ANALYZED", label: "Neanalyzováno" },
  { value: "PENDING", label: "Čeká" },
  { value: "IN_PROGRESS", label: "Zpracovává se" },
  { value: "COMPLETED", label: "Analýza hotová" },
  { value: "FAILED", label: "Selhalo" },
  { value: "UNKNOWN", label: "Neznámý stav" },
  { value: "SAVED", label: "Na později" },
] as const;

export type VideoStatusFilter = (typeof VIDEO_STATUS_OPTIONS)[number]["value"];

export const SORT_OPTIONS = [
  { value: "newest", label: "Nejnovější" },
  { value: "prelim", label: "Odhad relevance" },
  { value: "analysis", label: "Relevance po analýze" },
  { value: "oldest", label: "Nejstarší" },
  { value: "channel", label: "Kanál" },
] as const;

export type SortOption = (typeof SORT_OPTIONS)[number]["value"];

export const DATE_OPTIONS = [
  { value: "all", label: "Celé období" },
  { value: "7", label: "Posledních 7 dní" },
  { value: "30", label: "Posledních 30 dní" },
  { value: "90", label: "Posledních 90 dní" },
] as const;

export type VideoFilters = {
  q?: string;
  channel?: string;
  category?: string;
  topic?: string;
  date?: string;
  status?: VideoStatusFilter;
  minRelevance?: number;
  sort?: SortOption;
  page?: number;
  perPage?: number;
  savedOnly?: boolean;
};

export type VideoListResult = {
  rows: VideoListRow[];
  total: number;
  page: number;
  perPage: number;
  pages: number;
  appliedTokens: string[];
};

const BASE_SELECT = `
  SELECT v.*,
         c.title AS channel_title,
         c.category AS channel_category,
         (s.video_id IS NOT NULL) AS is_saved,
         a.id AS analysis_id,
         a.title_cs AS analysis_title_cs,
         a.relevance_score AS analysis_score,
         j.status AS job_status,
         j.id AS job_id,
         j.error_message AS job_error,
         CASE
           WHEN a.id IS NOT NULL THEN a.status
           WHEN j.status IS NOT NULL THEN j.status
           ELSE 'NOT_ANALYZED'
         END AS analysis_status
    FROM videos v
    JOIN channels c ON c.channel_id = v.channel_id
    LEFT JOIN analyses a ON a.video_id = v.video_id
    LEFT JOIN saved_videos s ON s.video_id = v.video_id
    LEFT JOIN analysis_jobs j ON j.id = (
      SELECT id FROM analysis_jobs WHERE video_id = v.video_id ORDER BY id DESC LIMIT 1
    )
`;

function buildWhere(filters: VideoFilters): { sql: string; params: (string | number)[]; tokens: string[] } {
  const clauses: string[] = [];
  const params: (string | number)[] = [];

  const tokens = fold(filters.q ?? "")
    .split(" ")
    .filter((token) => token.length >= 2)
    .slice(0, 5);

  for (const token of tokens) {
    clauses.push("t.search_text LIKE ?");
    params.push(`%${token}%`);
  }

  if (filters.channel) {
    clauses.push("t.channel_id = ?");
    params.push(filters.channel);
  }

  if (filters.category) {
    clauses.push("t.channel_category = ?");
    params.push(filters.category);
  }

  if (filters.topic) {
    clauses.push("t.topics LIKE ?");
    params.push(`%${filters.topic}%`);
  }

  if (filters.date && filters.date !== "all") {
    const days = Number.parseInt(filters.date, 10);
    if (Number.isFinite(days) && days > 0) {
      const cutoff = new Date(Date.now() - days * 86_400_000).toISOString();
      clauses.push("t.published_at >= ?");
      params.push(cutoff);
    }
  }

  if (filters.status && filters.status !== "ALL") {
    if (filters.status === "SAVED") {
      clauses.push("t.is_saved = 1");
    } else {
      clauses.push("t.analysis_status = ?");
      params.push(filters.status);
    }
  }

  if (filters.savedOnly) {
    clauses.push("t.is_saved = 1");
  }

  if (typeof filters.minRelevance === "number" && filters.minRelevance > 0) {
    clauses.push("COALESCE(t.analysis_score, t.prelim_relevance, 0) >= ?");
    params.push(filters.minRelevance);
  }

  return {
    sql: clauses.length > 0 ? `WHERE ${clauses.join(" AND ")}` : "",
    params,
    tokens,
  };
}

function orderBy(sort: SortOption | undefined): string {
  switch (sort) {
    case "oldest":
      return "ORDER BY published_at ASC";
    case "prelim":
      return "ORDER BY prelim_relevance IS NULL, prelim_relevance DESC, published_at DESC";
    case "analysis":
      return "ORDER BY analysis_score IS NULL, analysis_score DESC, published_at DESC";
    case "channel":
      return "ORDER BY channel_title COLLATE NOCASE ASC, published_at DESC";
    case "newest":
    default:
      return "ORDER BY published_at DESC";
  }
}

export function listVideos(db: Db, filters: VideoFilters = {}): VideoListResult {
  const { sql, params, tokens } = buildWhere(filters);
  const perPage = Math.min(60, Math.max(1, filters.perPage ?? 24));
  const page = Math.max(1, filters.page ?? 1);
  const offset = (page - 1) * perPage;

  const totalRow = db
    .prepare(`SELECT COUNT(*) AS c FROM (${BASE_SELECT}) t ${sql}`)
    .get(...params) as unknown as { c: number } | undefined;
  const total = Number(totalRow?.c ?? 0);

  const rows = plainRows<VideoListRow>(
    db
      .prepare(`SELECT * FROM (${BASE_SELECT}) t ${sql} ${orderBy(filters.sort)} LIMIT ? OFFSET ?`)
      .all(...params, perPage, offset),
  );

  return {
    rows,
    total,
    page,
    perPage,
    pages: Math.max(1, Math.ceil(total / perPage)),
    appliedTokens: tokens,
  };
}

export function listCategories(db: Db): string[] {
  const rows = db
    .prepare(
      `SELECT DISTINCT category FROM channels
        WHERE category IS NOT NULL AND LENGTH(TRIM(category)) > 0
        ORDER BY category COLLATE NOCASE`,
    )
    .all() as unknown as { category: string }[];
  return rows.map((row) => row.category);
}

export function listTopics(db: Db, limit = 20): { topic: string; count: number }[] {
  const rows = db
    .prepare(
      `SELECT topics FROM videos WHERE topics IS NOT NULL AND topics != ''`,
    )
    .all() as unknown as { topics: string }[];

  const counts = new Map<string, number>();
  for (const row of rows) {
    for (const topic of row.topics.split(",").map((value) => value.trim()).filter(Boolean)) {
      counts.set(topic, (counts.get(topic) ?? 0) + 1);
    }
  }

  return [...counts.entries()]
    .map(([topic, count]) => ({ topic, count }))
    .sort((a, b) => b.count - a.count || a.topic.localeCompare(b.topic, "cs"))
    .slice(0, limit);
}

export function getVideoDetail(db: Db, videoId: string) {
  const video = db
    .prepare(
      `SELECT v.*, c.title AS channel_title, c.url AS channel_url,
              (s.video_id IS NOT NULL) AS is_saved, s.note AS saved_note,
              a.id AS analysis_id
         FROM videos v
         JOIN channels c ON c.channel_id = v.channel_id
         LEFT JOIN analyses a ON a.video_id = v.video_id
         LEFT JOIN saved_videos s ON s.video_id = v.video_id
        WHERE v.video_id = ?`,
    )
    .get(videoId) as unknown as (VideoListRow & {
    saved_note: string | null;
    channel_url: string | null;
  }) | undefined;

  if (!video) return null;

  const analysis = db
    .prepare(`SELECT * FROM analyses WHERE video_id = ?`)
    .get(videoId) as unknown as import("../types").AnalysisRow | undefined;

  const items = analysis
    ? (db
        .prepare(`SELECT * FROM analysis_items WHERE analysis_id = ? ORDER BY kind, ordinal, id`)
        .all(analysis.id) as unknown as import("../types").AnalysisItemRow[])
    : [];

  const jobs = db
    .prepare(`SELECT * FROM analysis_jobs WHERE video_id = ? ORDER BY id DESC LIMIT 10`)
    .all(videoId) as unknown as import("../types").JobRow[];

  return {
    video: plainRow<VideoListRow & { saved_note: string | null; channel_url: string | null }>(video),
    analysis: analysis ? plainRow<import("../types").AnalysisRow>(analysis) : undefined,
    items: plainRows<import("../types").AnalysisItemRow>(items),
    jobs: plainRows<import("../types").JobRow>(jobs),
  };
}

export function countVideos(db: Db): number {
  const row = db.prepare(`SELECT COUNT(*) AS c FROM videos`).get() as unknown as {
    c: number;
  };
  return Number(row.c);
}

/**
 * Highest-signal videos for the dashboard. Analysis relevance wins over the
 * metadata estimate; the returned rows say which metric produced the score.
 */
export function listTopVideos(
  db: Db,
  options: { limit?: number; days?: number } = {},
): VideoListRow[] {
  const limit = options.limit ?? 3;
  const days = options.days ?? 120;
  const cutoff = new Date(Date.now() - days * 86_400_000).toISOString();

  const run = (clause: string, params: (string | number)[]) =>
    plainRows<VideoListRow>(
      db
        .prepare(
          `SELECT * FROM (${BASE_SELECT}) t
          WHERE COALESCE(analysis_score, prelim_relevance) IS NOT NULL ${clause}
          ORDER BY COALESCE(analysis_score, prelim_relevance) DESC, published_at DESC
          LIMIT ?`,
        )
        .all(...params, limit),
    );

  const recent = run("AND published_at >= ?", [cutoff]);
  if (recent.length > 0) return recent;
  return run("", []);
}
