import type { Db } from "../db/client";
import { dbAll, plainRows, type ChannelRow } from "../types";

/**
 * Export uses the same column names the import parser understands
 * (`name` is an accepted alias for the channel title), so a file exported here
 * can be imported back without editing. Fields the importer does not know are
 * deliberately not part of the file.
 */
export const CHANNEL_EXPORT_COLUMNS = [
  "channel_id",
  "handle",
  "url",
  "name",
  "category",
  "priority",
  "language",
  "description",
  "relevance_score",
] as const;

export type ChannelExportColumn = (typeof CHANNEL_EXPORT_COLUMNS)[number];

/** Every value is a string because that is what a CSV cell can hold. */
export type ChannelCsvRecord = Record<ChannelExportColumn, string>;

export type ChannelJsonRecord = {
  channel_id: string;
  handle: string | null;
  url: string | null;
  name: string;
  category: string | null;
  priority: number;
  language: string | null;
  description: string | null;
  relevance_score: number | null;
};

export type ChannelsExportBundle = {
  exported_at: string;
  count: number;
  channels: ChannelJsonRecord[];
};

export function loadChannelsForExport(db: Db): ChannelRow[] {
  return plainRows<ChannelRow>(
    dbAll<ChannelRow>(
      db,
      `SELECT * FROM channels
        ORDER BY is_active DESC, priority ASC, title COLLATE NOCASE ASC`,
    ),
  );
}

function csvValue(value: string | number | null): string {
  return value == null ? "" : String(value);
}

export function channelToCsvRecord(row: ChannelRow): ChannelCsvRecord {
  return {
    channel_id: row.channel_id,
    handle: csvValue(row.handle),
    url: csvValue(row.url),
    name: row.title,
    category: csvValue(row.category),
    priority: csvValue(row.priority),
    language: csvValue(row.language),
    description: csvValue(row.description),
    relevance_score: csvValue(row.relevance_score),
  };
}

export function channelToJsonRecord(row: ChannelRow): ChannelJsonRecord {
  return {
    channel_id: row.channel_id,
    handle: row.handle,
    url: row.url,
    name: row.title,
    category: row.category,
    priority: row.priority,
    language: row.language,
    description: row.description,
    relevance_score: row.relevance_score,
  };
}

/** Quotes a cell only when it contains a separator, a quote or a line break. */
function csvCell(value: string): string {
  return /[",;\r\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}

export function channelsToCsv(rows: ChannelRow[]): string {
  const lines = [CHANNEL_EXPORT_COLUMNS.join(",")];
  for (const row of rows) {
    const record = channelToCsvRecord(row);
    lines.push(CHANNEL_EXPORT_COLUMNS.map((column) => csvCell(record[column])).join(","));
  }
  // The BOM keeps Czech diacritics readable in Excel; the importer strips it again.
  return `\uFEFF${lines.join("\r\n")}\r\n`;
}

export function channelsToJson(rows: ChannelRow[]): ChannelsExportBundle {
  return {
    exported_at: new Date().toISOString(),
    count: rows.length,
    channels: rows.map(channelToJsonRecord),
  };
}
