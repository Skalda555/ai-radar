import type { Db } from "../db/client";
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
