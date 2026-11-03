import type { Db } from "../db/client";
import { getConfig } from "../config";
import { CHANNEL_ID_RE, HANDLE_RE, parseChannelInput, channelUrl } from "../youtube/input";
import { resolveChannel } from "../youtube/resolve";
import { clampPriority } from "../relevance/prelim";
import { dbGet } from "../types";
import type { RawImportRecord } from "./parse";

export const IMPORT_STATUSES = [
  "NEW",
  "ALREADY_EXISTS",
  "DUPLICATE_IN_FILE",
  "INVALID",
  "HANDLE_UNRESOLVED",
] as const;

export type ImportRowStatus = (typeof IMPORT_STATUSES)[number];

export type ImportPreviewRow = {
  line: number;
  input: string;
  channelId: string | null;
  handle: string | null;
  url: string | null;
  name: string | null;
  category: string | null;
  priority: number;
  language: string | null;
  description: string | null;
  relevanceScore: number | null;
  status: ImportRowStatus;
  reason: string | null;
};

export type ImportSummary = Record<ImportRowStatus, number> & { total: number };

export function summarize(rows: ImportPreviewRow[]): ImportSummary {
  const summary: ImportSummary = {
    total: rows.length,
    NEW: 0,
    ALREADY_EXISTS: 0,
    DUPLICATE_IN_FILE: 0,
    INVALID: 0,
    HANDLE_UNRESOLVED: 0,
  };
  for (const row of rows) summary[row.status] += 1;
  return summary;
}

export function dedupeKey(row: ImportPreviewRow): string {
  if (row.channelId) return `id:${row.channelId}`;
  if (row.handle) return `handle:${row.handle.toLowerCase()}`;
  return `line:${row.line}`;
}

function clean(value: string | undefined, max: number): string | null {
  if (!value) return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed.slice(0, max) : null;
}

function parsePriority(value: string | undefined): number {
  const parsed = Number.parseInt(value ?? "", 10);
  return Number.isFinite(parsed) ? clampPriority(parsed) : 3;
}

function parseRelevance(value: string | undefined): number | null {
  if (!value) return null;
  const parsed = Number.parseFloat(value.replace(",", "."));
  if (!Number.isFinite(parsed)) return null;
  return Math.min(100, Math.max(0, Math.round(parsed)));
}

export function buildPreview(db: Db, records: RawImportRecord[]): ImportPreviewRow[] {
  const seen = new Set<string>();
  const rows: ImportPreviewRow[] = [];

  records.forEach((record, index) => {
    const rawChannelId = clean(record.channel_id, 64);
    const rawHandle = clean(record.handle, 64);
    const rawUrl = clean(record.url, 500);
    const handle = rawHandle ? rawHandle.replace(/^@+/, "") : null;

    let channelId: string | null = null;
    let reason: string | null = null;
    let status: ImportRowStatus = "NEW";

    if (rawChannelId && CHANNEL_ID_RE.test(rawChannelId)) {
      channelId = rawChannelId;
    } else if (rawUrl) {
      const parsed = parseChannelInput(rawUrl);
      if (parsed.kind === "channel_id") {
        channelId = parsed.channelId;
      } else if (parsed.kind === "handle") {
        if (!handle) {
          // URL carries the handle; keep it for the explicit resolver.
          rows.push({
            line: index + 1,
            input: rawUrl,
            channelId: null,
            handle: parsed.handle,
            url: rawUrl,
            name: clean(record.name, 200),
            category: clean(record.category, 80),
            priority: parsePriority(record.priority),
            language: clean(record.language, 12),
            description: clean(record.description, 2000),
            relevanceScore: parseRelevance(record.relevance_score),
            status: "HANDLE_UNRESOLVED",
            reason: "Kanál je zadaný jen @handle v URL – převod je samostatná akce.",
          });
          return;
        }
      } else if (parsed.kind === "custom_url") {
        reason = "Adresu /c/ nebo /user/ nelze oficiálně převést. Použij @handle nebo Channel ID.";
      } else {
        reason = parsed.reason;
      }
    }

    if (!channelId && !reason) {
      if (rawChannelId) {
        reason = "Channel ID nemá platný formát (UC + 22 znaků).";
      } else if (handle) {
        if (!HANDLE_RE.test(handle)) {
          reason = "@handle obsahuje nepovolené znaky.";
        }
      } else {
        reason = "Chybí channel_id, handle i URL.";
      }
    }

    const input = rawChannelId ?? rawUrl ?? (handle ? `@${handle}` : rawHandle ?? "");

    if (reason) {
      rows.push({
        line: index + 1,
        input,
        channelId: null,
        handle,
        url: rawUrl,
        name: clean(record.name, 200),
        category: clean(record.category, 80),
        priority: parsePriority(record.priority),
        language: clean(record.language, 12),
        description: clean(record.description, 2000),
        relevanceScore: parseRelevance(record.relevance_score),
        status: "INVALID",
        reason,
      });
      return;
    }

    if (!channelId) {
      rows.push({
        line: index + 1,
        input,
        channelId: null,
        handle,
        url: rawUrl,
        name: clean(record.name, 200),
        category: clean(record.category, 80),
        priority: parsePriority(record.priority),
        language: clean(record.language, 12),
        description: clean(record.description, 2000),
        relevanceScore: parseRelevance(record.relevance_score),
        status: "HANDLE_UNRESOLVED",
        reason: "Pro @handle chybí Channel ID – převod je samostatná akce s API klíčem.",
      });
      return;
    }

    const key = `id:${channelId}`;
    if (seen.has(key)) {
      status = "DUPLICATE_IN_FILE";
      reason = "Stejný kanál je v souboru už na předchozím řádku.";
    } else {
      seen.add(key);
      const existing = dbGet<{ channel_id: string }>(
        db,
        `SELECT channel_id FROM channels WHERE channel_id = ?`,
        channelId,
      );
      if (existing) {
        status = "ALREADY_EXISTS";
        reason = "Kanál už je ve sledovaných – import ho nepřepíše.";
      }
    }

    rows.push({
      line: index + 1,
      input,
      channelId,
      handle,
      url: rawUrl ?? channelUrl(channelId),
      name: clean(record.name, 200),
      category: clean(record.category, 80),
      priority: parsePriority(record.priority),
      language: clean(record.language, 12),
      description: clean(record.description, 2000),
      relevanceScore: parseRelevance(record.relevance_score),
      status,
      reason,
    });
  });

  return rows;
}

export type ResolveHandlesResult = {
  rows: ImportPreviewRow[];
  resolved: number;
  remaining: number;
  errors: string[];
};

/**
 * Explicit, bounded handle resolution. Never called from preview or commit.
 * At most `limit` API requests per invocation, no duplicate handles.
 */
export async function resolveHandles(
  db: Db,
  rows: ImportPreviewRow[],
  options: { limit?: number; fetchImpl?: typeof fetch; apiKey?: string | null } = {},
): Promise<ResolveHandlesResult> {
  const limit = Math.min(25, Math.max(1, options.limit ?? 10));
  const apiKey = options.apiKey ?? getConfig().youtubeApiKey;
  const errors: string[] = [];

  if (!apiKey) {
    return {
      rows,
      resolved: 0,
      remaining: rows.filter((row) => row.status === "HANDLE_UNRESOLVED").length,
      errors: [
        "Převod @handle vyžaduje YOUTUBE_API_KEY v .env.local. Bez klíče vlož přímo Channel ID.",
      ],
    };
  }

  const claimed = new Set(
    rows.filter((row) => row.channelId).map((row) => row.channelId as string),
  );
  const attempted = new Set<string>();
  const updated = [...rows];
  let resolved = 0;
  let requests = 0;

  for (let index = 0; index < updated.length; index += 1) {
    const row = updated[index];
    if (row.status !== "HANDLE_UNRESOLVED" || !row.handle) continue;
    if (attempted.has(row.handle.toLowerCase())) continue;
    if (requests >= limit) break;

    attempted.add(row.handle.toLowerCase());
    requests += 1;

    const result = await resolveChannel(parseChannelInput(`@${row.handle}`), {
      apiKey,
      fetchImpl: options.fetchImpl,
    });

    if (!result.ok) {
      if (!errors.includes(result.message)) errors.push(result.message);
      continue;
    }

    const channelId = result.channel.channelId;
    const existed = dbGet<{ channel_id: string }>(
      db,
      `SELECT channel_id FROM channels WHERE channel_id = ?`,
      channelId,
    );

    updated[index] = {
      ...row,
      channelId,
      url: row.url ?? result.channel.url,
      name: row.name ?? result.channel.title,
      status: claimed.has(channelId) ? "DUPLICATE_IN_FILE" : existed ? "ALREADY_EXISTS" : "NEW",
      reason: claimed.has(channelId)
        ? "Stejný kanál je v souboru víckrát."
        : existed
          ? "Kanál už je ve sledovaných – import ho nepřepíše."
          : null,
    };
    claimed.add(channelId);
    resolved += 1;
  }

  const remaining = updated.filter((row) => row.status === "HANDLE_UNRESOLVED").length;
  return { rows: updated, resolved, remaining, errors };
}
