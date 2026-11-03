import { decodeEntities, normalizeWhitespace, stripHtml } from "../shared/text";
import { safeFetchText } from "../http/safe-fetch";
import { VIDEO_ID_RE, videoUrl } from "./input";

/** Parser for the YouTube Atom feed (a small, stable XML subset, not a general parser). */

export type FeedEntry = {
  videoId: string;
  title: string;
  description: string;
  publishedAt: string;
  updatedAt: string | null;
  thumbnailUrl: string;
  url: string;
};

export type ParsedFeed = {
  channelId: string;
  title: string;
  url: string;
  entries: FeedEntry[];
  skipped: number;
};

export class FeedParseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "FeedParseError";
  }
}

const THUMBNAIL_HOSTS = new Set([
  "i.ytimg.com",
  "i1.ytimg.com",
  "i2.ytimg.com",
  "i3.ytimg.com",
  "i4.ytimg.com",
  "img.youtube.com",
]);

function cdataToText(value: string): string {
  const trimmed = value.trim();
  const cdata = /^<!\[CDATA\[([\s\S]*?)\]\]>$/.exec(trimmed);
  return cdata ? cdata[1] : trimmed;
}

function firstTag(xml: string, tag: string): string | null {
  const escaped = tag.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const re = new RegExp(`<${escaped}(?:\\s[^>]*)?>([\\s\\S]*?)</${escaped}>`, "i");
  const match = re.exec(xml);
  if (!match) return null;
  return decodeEntities(cdataToText(match[1]));
}

function firstAttr(xml: string, tag: string, attribute: string): string | null {
  const escapedTag = tag.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const escapedAttr = attribute.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const re = new RegExp(`<${escapedTag}\\b[^>]*\\b${escapedAttr}\\s*=\\s*"([^"]*)"`, "i");
  const match = re.exec(xml);
  return match ? decodeEntities(match[1]) : null;
}

function safeThumbnail(raw: string | null, videoId: string): string {
  const fallback = `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`;
  if (!raw) return fallback;
  try {
    const url = new URL(raw.replace(/^http:/, "https:"));
    if (url.protocol !== "https:") return fallback;
    if (!THUMBNAIL_HOSTS.has(url.hostname.toLowerCase())) return fallback;
    return url.toString();
  } catch {
    return fallback;
  }
}

function toIso(value: string | null): string | null {
  if (!value) return null;
  const ts = Date.parse(value);
  if (!Number.isFinite(ts)) return null;
  return new Date(ts).toISOString();
}

export function parseYouTubeFeed(xml: string): ParsedFeed {
  if (!xml || !/<feed[\s>]/i.test(xml)) {
    throw new FeedParseError("Odpověď není YouTube Atom feed.");
  }

  const firstEntryIndex = xml.search(/<entry[\s>]/i);
  const header = firstEntryIndex >= 0 ? xml.slice(0, firstEntryIndex) : xml;

  const feedTitle = firstTag(header, "title") ?? "";

  const alternateHref =
    /<link\b[^>]*\brel="alternate"[^>]*\bhref="([^"]+)"/i.exec(header)?.[1] ??
    /<link\b[^>]*\bhref="([^"]+)"[^>]*\brel="alternate"/i.exec(header)?.[1] ??
    null;
  const linkChannelId = alternateHref
    ? /\/channel\/(UC[0-9A-Za-z_-]{22})/.exec(alternateHref)?.[1] ?? ""
    : "";

  const entries: FeedEntry[] = [];
  const entryChannelIds: string[] = [];
  let skipped = 0;

  const chunks = xml.split(/<entry[\s>]/i).slice(1);
  for (const chunk of chunks) {
    const end = chunk.search(/<\/entry>/i);
    const body = end >= 0 ? chunk.slice(0, end) : chunk;

    const videoId = (firstTag(body, "yt:videoId") ?? "").trim();
    const title = normalizeWhitespace(firstTag(body, "title") ?? "");
    const mediaTitle = normalizeWhitespace(firstTag(body, "media:title") ?? "");
    const description = normalizeWhitespace(
      stripHtml(firstTag(body, "media:description") ?? firstTag(body, "description") ?? ""),
    );
    const publishedAt = toIso(firstTag(body, "published"));
    const updatedAt = toIso(firstTag(body, "updated"));
    const thumbnail = firstAttr(body, "media:thumbnail", "url");

    const entryChannelId = (firstTag(body, "yt:channelId") ?? "").trim();
    if (/^UC[0-9A-Za-z_-]{22}$/.test(entryChannelId)) {
      entryChannelIds.push(entryChannelId);
    }

    if (!VIDEO_ID_RE.test(videoId) || !title || !publishedAt) {
      skipped += 1;
      continue;
    }

    entries.push({
      videoId,
      title: title || mediaTitle,
      description,
      publishedAt,
      updatedAt,
      thumbnailUrl: safeThumbnail(thumbnail, videoId),
      url: videoUrl(videoId),
    });
  }

  // The feed header may strip the "UC" prefix from yt:channelId, so the
  // canonical /channel/UC… link or an entry id is authoritative.
  const headerChannelId = (firstTag(header, "yt:channelId") ?? "").trim();
  const channelId =
    linkChannelId ||
    entryChannelIds[0] ||
    (/^UC[0-9A-Za-z_-]{22}$/.test(headerChannelId) ? headerChannelId : "");

  if (!channelId) {
    throw new FeedParseError("Feed neobsahuje platné Channel ID.");
  }

  const seen = new Set<string>();
  const uniqueEntries = entries.filter((entry) => {
    if (seen.has(entry.videoId)) return false;
    seen.add(entry.videoId);
    return true;
  });

  return {
    channelId,
    title: normalizeWhitespace(feedTitle) || channelId,
    url: linkChannelId ? `https://www.youtube.com/channel/${linkChannelId}` : "",
    entries: uniqueEntries,
    skipped,
  };
}

export async function fetchChannelFeed(
  channelId: string,
  options: { fetchImpl?: typeof fetch; timeoutMs?: number } = {},
): Promise<
  | { ok: true; feed: ParsedFeed }
  | { ok: false; code: string; message: string; status?: number }
> {
  const url = `https://www.youtube.com/feeds/videos.xml?channel_id=${encodeURIComponent(channelId)}`;
  const result = await safeFetchText(url, {
    allowedHosts: ["www.youtube.com", "youtube.com"],
    timeoutMs: options.timeoutMs ?? 15000,
    maxBytes: 2 * 1024 * 1024,
    accept: "application/atom+xml, application/xml;q=0.9, text/xml;q=0.8",
    fetchImpl: options.fetchImpl,
  });

  if (!result.ok) {
    return { ok: false, code: result.code, message: result.message, status: result.status };
  }

  try {
    return { ok: true, feed: parseYouTubeFeed(result.body) };
  } catch (error) {
    return {
      ok: false,
      code: "PARSE_ERROR",
      message: error instanceof Error ? error.message : "Feed se nepodařilo přečíst.",
    };
  }
}
