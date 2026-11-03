import { getConfig } from "../config";
import { safeFetchText } from "../http/safe-fetch";
import { channelUrl } from "./input";
import type { ParsedChannelInput } from "./input";

export type ResolvedChannel = {
  channelId: string;
  title: string;
  description: string | null;
  handle: string | null;
  thumbnailUrl: string | null;
  url: string;
};

export type ResolveErrorCode =
  | "MISSING_API_KEY"
  | "NOT_FOUND"
  | "BAD_API_KEY"
  | "RATE_LIMITED"
  | "API_ERROR"
  | "TIMEOUT"
  | "NETWORK"
  | "UNSUPPORTED_CUSTOM_URL"
  | "INVALID_INPUT";

export type ResolveResult =
  | { ok: true; channel: ResolvedChannel; method: "DIRECT_ID" | "API_FOR_HANDLE" | "API_FOR_USERNAME" }
  | { ok: false; code: ResolveErrorCode; message: string };

type ApiChannelItem = {
  id?: unknown;
  snippet?: {
    title?: unknown;
    description?: unknown;
    customUrl?: unknown;
    thumbnails?: Record<string, { url?: unknown } | undefined>;
  };
};

function pickThumbnail(item: ApiChannelItem): string | null {
  const thumbs = item.snippet?.thumbnails ?? {};
  for (const key of ["high", "medium", "default"]) {
    const url = thumbs[key]?.url;
    if (typeof url === "string" && url.startsWith("https://")) return url;
  }
  return null;
}

export function directChannel(channelId: string): ResolveResult {
  return {
    ok: true,
    method: "DIRECT_ID",
    channel: {
      channelId,
      title: channelId,
      description: null,
      handle: null,
      thumbnailUrl: null,
      url: channelUrl(channelId),
    },
  };
}

export async function resolveChannel(
  input: ParsedChannelInput,
  options: { fetchImpl?: typeof fetch; apiKey?: string | null } = {},
): Promise<ResolveResult> {
  if (input.kind === "invalid") {
    return { ok: false, code: "INVALID_INPUT", message: input.reason };
  }
  if (input.kind === "channel_id") {
    return directChannel(input.channelId);
  }
  if (input.kind === "custom_url") {
    return {
      ok: false,
      code: "UNSUPPORTED_CUSTOM_URL",
      message:
        "Adresy /c/ a /user/ nelze oficiálně převést bez znalosti Channel ID. Vlož prosím @handle nebo Channel ID.",
    };
  }

  const apiKey = options.apiKey ?? getConfig().youtubeApiKey;
  if (!apiKey) {
    return {
      ok: false,
      code: "MISSING_API_KEY",
      message:
        "Pro převod @handle na Channel ID je potřeba YOUTUBE_API_KEY v .env.local. Bez klíče vlož přímo Channel ID (UC…).",
    };
  }

  const params = new URLSearchParams({
    part: "snippet",
    forHandle: `@${input.handle}`,
    key: apiKey,
  });

  const response = await safeFetchText(
    `https://www.googleapis.com/youtube/v3/channels?${params.toString()}`,
    {
      allowedHosts: ["www.googleapis.com"],
      timeoutMs: 12000,
      maxBytes: 512 * 1024,
      accept: "application/json",
      fetchImpl: options.fetchImpl,
    },
  );

  if (!response.ok) {
    const mapped = mapApiFailure(response.code, response.status);
    return { ok: false, code: mapped.code, message: mapped.message };
  }

  let payload: { items?: unknown };
  try {
    payload = JSON.parse(response.body) as { items?: unknown };
  } catch {
    return { ok: false, code: "API_ERROR", message: "YouTube API vrátila nečitelnou odpověď." };
  }

  const items = Array.isArray(payload.items) ? (payload.items as ApiChannelItem[]) : [];
  const item = items[0];
  const channelId = typeof item?.id === "string" ? item.id : "";
  if (!item || !/^UC[0-9A-Za-z_-]{22}$/.test(channelId)) {
    return {
      ok: false,
      code: "NOT_FOUND",
      message: `Kanál @${input.handle} nebyl nalezen. Zkontroluj handle.`,
    };
  }

  const title = typeof item.snippet?.title === "string" ? item.snippet.title : channelId;
  const description =
    typeof item.snippet?.description === "string" ? item.snippet.description : null;
  const customUrl = typeof item.snippet?.customUrl === "string" ? item.snippet.customUrl : null;

  return {
    ok: true,
    method: "API_FOR_HANDLE",
    channel: {
      channelId,
      title: title.trim() || channelId,
      description,
      handle: customUrl ? customUrl.replace(/^@/, "") : input.handle,
      thumbnailUrl: pickThumbnail(item),
      url: channelUrl(channelId),
    },
  };
}

function mapApiFailure(
  code: string,
  status?: number,
): { code: ResolveErrorCode; message: string } {
  if (code === "TIMEOUT") {
    return { code: "TIMEOUT", message: "YouTube API neodpověděla v časovém limitu." };
  }
  if (code === "NETWORK") {
    return { code: "NETWORK", message: "Síťová chyba při volání YouTube API." };
  }
  if (status === 400) {
    return {
      code: "BAD_API_KEY",
      message: "YouTube API odmítla požadavek (HTTP 400). Zkontroluj platnost YOUTUBE_API_KEY.",
    };
  }
  if (status === 401 || status === 403) {
    return {
      code: "RATE_LIMITED",
      message:
        "YouTube API vrátila 401/403. Klíč je neplatný, omezený nebo vyčerpal kvótu. Channel ID můžeš vložit přímo.",
    };
  }
  if (status === 404) {
    return { code: "NOT_FOUND", message: "Kanál nebyl na YouTube nalezen." };
  }
  return {
    code: "API_ERROR",
    message: `YouTube API selhala (${status ? `HTTP ${status}` : code}).`,
  };
}
