import type { Db } from "../db/client";
import { nowIso } from "../shared/time";
import { getConfig } from "../config";
import { buildSearchText } from "../relevance/prelim";
import { recordUsage } from "../usage";
import { dbGet, dbRun } from "../types";
import { translateTexts } from "./google";

export type TranslateTitlesResult = {
  ok: boolean;
  translated: number;
  remaining: number;
  error: string | null;
};

type PendingRow = {
  video_id: string;
  title: string;
  description: string | null;
  topics: string | null;
  channel_title: string;
};

export function countUntranslatedTitles(db: Db): number {
  const row = dbGet<{ c: number }>(
    db,
    `SELECT COUNT(*) AS c FROM videos
      WHERE title_cs_google IS NULL OR title_cs_google_source IS NOT title`,
  );
  return Number(row?.c ?? 0);
}

/**
 * Translates titles that are missing or whose source title changed. Results are
 * cached in the videos table, so the same title is never paid for twice.
 */
export async function translatePendingTitles(
  db: Db,
  options: {
    apiKey?: string | null;
    limit?: number;
    fetchImpl?: typeof fetch;
    now?: () => string;
    timeoutMs?: number;
  } = {},
): Promise<TranslateTitlesResult> {
  const now = options.now ?? nowIso;
  const apiKey = options.apiKey ?? getConfig().googleTranslateApiKey;
  const limit = Math.min(50, Math.max(1, options.limit ?? 25));

  if (!apiKey) {
    return {
      ok: false,
      translated: 0,
      remaining: countUntranslatedTitles(db),
      error: "Chybí GOOGLE_TRANSLATE_API_KEY v .env.local.",
    };
  }

  const pending = db
    .prepare(
      `SELECT v.video_id, v.title, v.description, v.topics, c.title AS channel_title
         FROM videos v JOIN channels c ON c.channel_id = v.channel_id
        WHERE v.title_cs_google IS NULL OR v.title_cs_google_source IS NOT v.title
        ORDER BY v.published_at DESC
        LIMIT ?`,
    )
    .all(limit) as unknown as PendingRow[];

  if (pending.length === 0) {
    return { ok: true, translated: 0, remaining: 0, error: null };
  }

  const result = await translateTexts(
    pending.map((row) => row.title),
    { apiKey, fetchImpl: options.fetchImpl, timeoutMs: options.timeoutMs },
  );

  if (!result.ok) {
    recordUsage(db, {
      provider: "google_translate",
      operation: "translate.title",
      requestCount: 1,
      httpStatus: result.status ?? null,
    });
    return {
      ok: false,
      translated: 0,
      remaining: countUntranslatedTitles(db),
      error: result.message,
    };
  }

  const timestamp = now();
  pending.forEach((row, index) => {
    const translated = result.translations[index] ?? "";
    if (!translated) return;

    const searchText = buildSearchText([
      row.title,
      row.description,
      row.channel_title,
      row.topics,
      translated,
    ]);

    dbRun(
      db,
      `UPDATE videos SET title_cs_google = ?, title_cs_google_source = ?, search_text = ?, updated_at = ?
        WHERE video_id = ?`,
      translated,
      row.title,
      searchText,
      timestamp,
      row.video_id,
    );
  });

  recordUsage(db, {
    provider: "google_translate",
    operation: "translate.title",
    requestCount: 1,
    httpStatus: result.httpStatus,
  });

  return {
    ok: true,
    translated: pending.length,
    remaining: countUntranslatedTitles(db),
    error: null,
  };
}
