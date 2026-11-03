import { openDatabase, type Db } from "../src/lib/db/client";
import type { ChannelRow } from "../src/lib/types";
import { fold } from "../src/lib/shared/text";

export function openTestDb(): Db {
  return openDatabase(":memory:");
}

export function seedChannel(
  db: Db,
  input: {
    channelId: string;
    title?: string;
    priority?: number;
    isActive?: boolean;
    isDemo?: boolean;
    category?: string;
  },
): ChannelRow {
  const now = new Date().toISOString();
  db.prepare(
    `INSERT INTO channels (channel_id, title, priority, is_active, is_demo, source, url, category, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, 'test', ?, ?, ?, ?)`,
  ).run(
    input.channelId,
    input.title ?? `Kanál ${input.channelId.slice(-4)}`,
    input.priority ?? 3,
    input.isActive === false ? 0 : 1,
    input.isDemo ? 1 : 0,
    `https://www.youtube.com/channel/${input.channelId}`,
    input.category ?? null,
    now,
    now,
  );
  return db.prepare(`SELECT * FROM channels WHERE channel_id = ?`).get(input.channelId) as unknown as ChannelRow;
}

export type FeedEntryInput = {
  id: string;
  title: string;
  published?: string;
  description?: string;
  thumbnail?: string | null;
};

export function makeFeed(
  channelId: string,
  channelTitle: string,
  entries: FeedEntryInput[],
): string {
  const body = entries
    .map(
      (entry) => `  <entry>
    <id>yt:video:${entry.id}</id>
    <yt:videoId>${entry.id}</yt:videoId>
    <yt:channelId>${channelId}</yt:channelId>
    <title>${escapeXml(entry.title)}</title>
    <link rel="alternate" href="https://www.youtube.com/watch?v=${entry.id}"/>
    <author><name>${escapeXml(channelTitle)}</name></author>
    <published>${entry.published ?? "2026-10-01T10:00:00+00:00"}</published>
    <updated>${entry.published ?? "2026-10-01T10:00:00+00:00"}</updated>
    <media:group>
      <media:title>${escapeXml(entry.title)}</media:title>
      ${
        entry.thumbnail === null
          ? ""
          : `<media:thumbnail url="${entry.thumbnail ?? `https://i4.ytimg.com/vi/${entry.id}/hqdefault.jpg`}" width="480" height="360"/>`
      }
      <media:description>${escapeXml(entry.description ?? "Popis videa")}</media:description>
    </media:group>
  </entry>`,
    )
    .join("\n");

  return `<?xml version="1.0" encoding="UTF-8"?>
<feed xmlns:yt="http://www.youtube.com/xml/schemas/2015" xmlns:media="http://search.yahoo.com/mrss/" xmlns="http://www.w3.org/2005/Atom">
  <link rel="self" href="http://www.youtube.com/feeds/videos.xml?channel_id=${channelId}"/>
  <id>yt:channel:${channelId}</id>
  <yt:channelId>${channelId}</yt:channelId>
  <title>${escapeXml(channelTitle)}</title>
  <link rel="alternate" href="https://www.youtube.com/channel/${channelId}"/>
  <author><name>${escapeXml(channelTitle)}</name></author>
${body}
</feed>
`;
}

function escapeXml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function fakeFetchFor(body: string, status = 200): typeof fetch {
  return (async () =>
    new Response(body, { status, headers: { "content-type": "application/atom+xml" } })) as typeof fetch;
}

export function failingFetch(errorName = "TimeoutError"): typeof fetch {
  return (async () => {
    const error = new Error("simulated transport failure");
    error.name = errorName;
    throw error;
  }) as typeof fetch;
}

export const CHANNEL_ID = "UCJIfeSCssxSC_Dhc5s7woww";

export function seedVideo(
  db: Db,
  input: {
    videoId: string;
    channelId?: string;
    title?: string;
    description?: string;
    publishedAt?: string;
    isDemo?: boolean;
  },
): void {
  const now = new Date().toISOString();
  const channelId = input.channelId ?? CHANNEL_ID;
  db.prepare(
    `INSERT INTO videos (
       video_id, channel_id, title, description, published_at, source_updated_at,
       thumbnail_url, url, duration_seconds, source, is_demo, topics, search_text,
       prelim_relevance, prelim_relevance_detail, first_seen_at, last_seen_at, created_at, updated_at
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, NULL, 'test', ?, NULL, ?, 50, NULL, ?, ?, ?, ?)`,
  ).run(
    input.videoId,
    channelId,
    input.title ?? "Testovací video o Codex a MCP",
    input.description ?? "Popis testovacího videa",
    input.publishedAt ?? "2026-10-20T10:00:00+00:00",
    input.publishedAt ?? "2026-10-20T10:00:00+00:00",
    `https://i.ytimg.com/vi/${input.videoId}/hqdefault.jpg`,
    `https://www.youtube.com/watch?v=${input.videoId}`,
    input.isDemo ? 1 : 0,
    fold(`${input.title ?? "Testovací video o Codex a MCP"} ${input.description ?? "Popis testovacího videa"}`),
    now,
    now,
    now,
    now,
  );
}

export function jsonFetch(
  responseBody: unknown,
  status = 200,
  init: ResponseInit = {},
): typeof fetch {
  return (async () =>
    new Response(typeof responseBody === "string" ? responseBody : JSON.stringify(responseBody), {
      status,
      headers: { "content-type": "application/json" },
      ...init,
    })) as typeof fetch;
}

export function countingFetch(
  handler: (url: string, init?: RequestInit) => { body: unknown; status?: number },
): { fetchImpl: typeof fetch; calls: { url: string; init?: RequestInit }[] } {
  const calls: { url: string; init?: RequestInit }[] = [];
  const fetchImpl = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input);
    calls.push({ url, init });
    const result = handler(url, init);
    return new Response(
      typeof result.body === "string" ? result.body : JSON.stringify(result.body),
      {
        status: result.status ?? 200,
        headers: { "content-type": "application/json" },
      },
    );
  }) as typeof fetch;
  return { fetchImpl, calls };
}
