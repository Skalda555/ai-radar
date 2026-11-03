/**
 * Normalises everything a user may paste into the "add channel" box.
 * Channel IDs are only accepted in their real 24-character form; nothing is guessed.
 */

export type ParsedChannelInput =
  | { kind: "channel_id"; channelId: string; raw: string }
  | { kind: "handle"; handle: string; raw: string }
  | { kind: "custom_url"; customUrl: string; raw: string }
  | { kind: "invalid"; raw: string; reason: string };

export const CHANNEL_ID_RE = /^UC[0-9A-Za-z_-]{22}$/;
export const HANDLE_RE = /^[A-Za-z0-9._-]{3,30}$/;
export const VIDEO_ID_RE = /^[A-Za-z0-9_-]{11}$/;

const YOUTUBE_HOSTS = new Set([
  "youtube.com",
  "www.youtube.com",
  "m.youtube.com",
  "music.youtube.com",
]);

const HANDLE_SUFFIXES = new Set([
  "",
  "videos",
  "shorts",
  "streams",
  "featured",
  "playlists",
  "about",
  "community",
  "podcasts",
]);

export function isValidChannelId(value: string): boolean {
  return CHANNEL_ID_RE.test(value);
}

export function parseChannelInput(rawInput: string): ParsedChannelInput {
  const raw = (rawInput ?? "").trim();
  if (!raw) return { kind: "invalid", raw, reason: "Prázdný vstup." };
  if (raw.length > 500) return { kind: "invalid", raw, reason: "Vstup je příliš dlouhý." };

  if (CHANNEL_ID_RE.test(raw)) {
    return { kind: "channel_id", channelId: raw, raw };
  }

  if (raw.startsWith("@")) {
    const handle = raw.slice(1);
    if (!HANDLE_RE.test(handle)) {
      return { kind: "invalid", raw, reason: "@handle obsahuje nepovolené znaky." };
    }
    return { kind: "handle", handle, raw };
  }

  let candidate = raw;
  if (/^(www\.|m\.|music\.)?youtube\.com\//i.test(candidate)) {
    candidate = `https://${candidate}`;
  }

  const looksLikeUrl = /^https?:\/\//i.test(candidate);
  if (looksLikeUrl) {
    let url: URL;
    try {
      url = new URL(candidate);
    } catch {
      return { kind: "invalid", raw, reason: "URL se nepodařilo přečíst." };
    }
    const host = url.hostname.toLowerCase();
    if (!YOUTUBE_HOSTS.has(host)) {
      return {
        kind: "invalid",
        raw,
        reason: `Doména ${host} není YouTube. Podporuji youtube.com a přímé Channel ID.`,
      };
    }

    const segments = url.pathname.split("/").filter(Boolean);
    const first = segments[0] ?? "";

    if (first === "channel") {
      const id = segments[1] ?? "";
      if (!CHANNEL_ID_RE.test(id)) {
        return { kind: "invalid", raw, reason: "Channel ID v URL nemá platný formát (UC + 22 znaků)." };
      }
      return { kind: "channel_id", channelId: id, raw };
    }

    if (first.startsWith("@")) {
      const handle = first.slice(1);
      const rest = segments.slice(1);
      if (!HANDLE_RE.test(handle)) {
        return { kind: "invalid", raw, reason: "@handle v URL obsahuje nepovolené znaky." };
      }
      if (rest.length > 0 && !HANDLE_SUFFIXES.has(rest[0].toLowerCase())) {
        return {
          kind: "invalid",
          raw,
          reason: `Neočekávaná část URL „${rest[0]}“ za @handle.`,
        };
      }
      return { kind: "handle", handle, raw };
    }

    if (first === "c" || first === "user") {
      const name = segments[1] ?? "";
      if (!name || !HANDLE_RE.test(name)) {
        return { kind: "invalid", raw, reason: `Adresa /${first}/ neobsahuje platný název.` };
      }
      return { kind: "custom_url", customUrl: `${first}/${name}`, raw };
    }

    if (first === "watch" || first === "shorts" || first === "playlist") {
      return {
        kind: "invalid",
        raw,
        reason: "Toto je adresa videa, ne kanálu. Vlož @handle nebo Channel ID kanálu.",
      };
    }

    return { kind: "invalid", raw, reason: "Z URL se nepodařilo rozpoznat kanál." };
  }

  if (HANDLE_RE.test(raw)) {
    return { kind: "handle", handle: raw, raw };
  }

  return {
    kind: "invalid",
    raw,
    reason: "Nerozpoznaný vstup. Použij @handle, URL kanálu nebo Channel ID (UC…).",
  };
}

export function channelUrl(channelId: string): string {
  return `https://www.youtube.com/channel/${channelId}`;
}

export function videoUrl(videoId: string): string {
  return `https://www.youtube.com/watch?v=${videoId}`;
}
