import type { Db } from "../db/client";
import { withTransaction } from "../db/client";
import { nowIso } from "../shared/time";
import { dbGet, dbRun } from "../types";

/** Hides every knowledge item of one video from the library (data stays stored). */
export function setVideoKnowledgeHidden(
  db: Db,
  videoId: string,
  hidden: boolean,
): { ok: boolean; hidden: boolean } {
  const video = dbGet<{ video_id: string }>(db, `SELECT video_id FROM videos WHERE video_id = ?`, videoId);
  if (!video) return { ok: false, hidden };

  dbRun(
    db,
    `UPDATE videos SET knowledge_hidden_at = ?, updated_at = ? WHERE video_id = ?`,
    hidden ? nowIso() : null,
    nowIso(),
    videoId,
  );
  return { ok: true, hidden };
}

/** Marks one knowledge item as curated: it appears in the knowledge database. */
export function setItemCurated(
  db: Db,
  itemId: number,
  curated: boolean,
): { ok: boolean; curated: boolean } {
  const item = dbGet<{ id: number }>(db, `SELECT id FROM analysis_items WHERE id = ?`, itemId);
  if (!item) return { ok: false, curated };

  dbRun(
    db,
    `UPDATE analysis_items SET curated_at = ? WHERE id = ?`,
    curated ? nowIso() : null,
    itemId,
  );
  return { ok: true, curated };
}

export function countCurated(db: Db): number {
  const row = dbGet<{ c: number }>(
    db,
    `SELECT COUNT(*) AS c FROM analysis_items WHERE curated_at IS NOT NULL`,
  );
  return Number(row?.c ?? 0);
}

export const SUMMARY_POINT_MIN_CHARS = 10;
export const SUMMARY_POINT_MAX_CHARS = 4000;

export type SummaryPointSource = "summary" | "deep";

export type AddSummaryPointResult =
  | { ok: true; itemId: number; alreadyStored: boolean }
  | { ok: false; code: "NO_ANALYSIS" | "INVALID_TEXT" | "TOO_LONG"; message: string };

/**
 * Turns one paragraph of the Czech summary into a knowledge item.
 *
 * The paragraph becomes a regular `KEY_POINT` item, so it shows in the
 * "Klíčové poznatky" tab and in the knowledge database. It is curated right
 * away, and `extra_json` keeps where it came from: the summary prose is model
 * output, not something the user verified.
 */
export function addSummaryPointToKnowledge(
  db: Db,
  input: { videoId: string; text: string; source: SummaryPointSource },
): AddSummaryPointResult {
  // Paragraphs are split on blank lines, so collapsing inner whitespace is safe.
  const text = input.text.replace(/\s+/g, " ").trim();

  if (text.length < SUMMARY_POINT_MIN_CHARS) {
    return {
      ok: false,
      code: "INVALID_TEXT",
      message: `Text je příliš krátký (minimum ${SUMMARY_POINT_MIN_CHARS} znaků).`,
    };
  }
  if (text.length > SUMMARY_POINT_MAX_CHARS) {
    return {
      ok: false,
      code: "TOO_LONG",
      message: `Text je příliš dlouhý (maximum ${SUMMARY_POINT_MAX_CHARS} znaků).`,
    };
  }

  const analysis = dbGet<{ id: number }>(
    db,
    `SELECT id FROM analyses WHERE video_id = ?`,
    input.videoId,
  );
  if (!analysis) {
    return {
      ok: false,
      code: "NO_ANALYSIS",
      message: "Video nemá analýzu, ze které by šlo poznatek uložit.",
    };
  }

  const existing = dbGet<{ id: number; curated_at: string | null }>(
    db,
    `SELECT id, curated_at FROM analysis_items WHERE video_id = ? AND text_cs = ? LIMIT 1`,
    input.videoId,
    text,
  );

  if (existing) {
    if (!existing.curated_at) {
      dbRun(db, `UPDATE analysis_items SET curated_at = ? WHERE id = ?`, nowIso(), existing.id);
    }
    return { ok: true, itemId: Number(existing.id), alreadyStored: true };
  }

  const timestamp = nowIso();
  const context = dbGet<{ video_title: string; channel_title: string }>(
    db,
    `SELECT v.title AS video_title, c.title AS channel_title
       FROM videos v JOIN channels c ON c.channel_id = v.channel_id
      WHERE v.video_id = ?`,
    input.videoId,
  );
  const lastOrdinal = dbGet<{ m: number | null }>(
    db,
    `SELECT MAX(ordinal) AS m FROM analysis_items WHERE analysis_id = ?`,
    analysis.id,
  );
  const ordinal = Number(lastOrdinal?.m ?? 0) + 1;

  const itemId = withTransaction(db, () => {
    const id = Number(
      dbRun(
        db,
        `INSERT INTO analysis_items (
           analysis_id, video_id, kind, ordinal, text_cs, verification_status,
           curated_at, extra_json, is_demo, created_at
         ) VALUES (?, ?, 'KEY_POINT', ?, ?, 'AI_EXTRACTED', ?, ?, 0, ?)`,
        analysis.id,
        input.videoId,
        ordinal,
        text,
        timestamp,
        JSON.stringify({ source: "ANALYSIS_SUMMARY", summarySource: input.source }),
        timestamp,
      ).lastInsertRowid,
    );

    dbRun(
      db,
      `INSERT INTO knowledge_fts (rowid, text_cs, detail_cs, tool_name, video_title, channel_title)
       VALUES (?, ?, '', '', ?, ?)`,
      id,
      text,
      context?.video_title ?? "",
      context?.channel_title ?? "",
    );

    return id;
  });

  return { ok: true, itemId, alreadyStored: false };
}
