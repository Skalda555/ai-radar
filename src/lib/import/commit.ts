import type { Db } from "../db/client";
import { withTransaction } from "../db/client";
import { nowIso } from "../shared/time";
import { CHANNEL_ID_RE, channelUrl } from "../youtube/input";
import { dbGet, dbRun } from "../types";
import type { ImportPreviewRow } from "./preview";

export type CommitResult = {
  ok: boolean;
  inserted: number;
  skipped: number;
  invalid: number;
  error?: string;
};

/**
 * Server-side re-validation and one transaction. Only NEW rows with a valid
 * Channel ID are inserted; existing channels are never overwritten and never
 * deactivated. No sync and no Gemini call is triggered.
 */
export function commitImport(db: Db, rows: ImportPreviewRow[]): CommitResult {
  const candidates = rows.filter(
    (row) => row.status === "NEW" && row.channelId && CHANNEL_ID_RE.test(row.channelId),
  );
  const invalid = rows.length - candidates.length;

  const timestamp = nowIso();

  try {
    const inserted = withTransaction(db, () => {
      let count = 0;
      for (const row of candidates) {
        const channelId = row.channelId as string;
        const existing = dbGet<{ id: number }>(
          db,
          `SELECT id FROM channels WHERE channel_id = ?`,
          channelId,
        );
        if (existing) continue;

        const title = (row.name?.trim() || (row.handle ? `@${row.handle}` : channelId)).slice(0, 200);

        dbRun(
          db,
          `INSERT INTO channels (
             channel_id, handle, url, title, description, category, priority, language,
             relevance_score, is_active, is_demo, source, created_at, updated_at
           ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1, 0, 'import', ?, ?)
           ON CONFLICT(channel_id) DO NOTHING`,
          channelId,
          row.handle ?? null,
          row.url ?? channelUrl(channelId),
          title,
          row.description ?? null,
          row.category ?? null,
          row.priority,
          row.language ?? null,
          row.relevanceScore,
          timestamp,
          timestamp,
        );
        count += 1;
      }
      return count;
    });

    return { ok: true, inserted, skipped: candidates.length - inserted, invalid };
  } catch (error) {
    return {
      ok: false,
      inserted: 0,
      skipped: 0,
      invalid,
      error: error instanceof Error ? error.message : "Import selhal a byl vrácen zpět.",
    };
  }
}
