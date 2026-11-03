import { fold } from "../shared/text";

/** Minimal shape the search needs; both `ChannelRow` and `ChannelStats` satisfy it. */
export type FilterableChannel = {
  title: string;
  channel_id: string;
  handle?: string | null;
  category?: string | null;
};

/**
 * Splits the query into folded tokens; every token must match somewhere in the
 * channel. Tokens shorter than two characters are ignored, so a stray keystroke
 * does not hide every channel.
 */
export function searchTokens(query: string): string[] {
  return fold(query)
    .split(" ")
    .filter((token) => token.length >= 2);
}

export function hasSearchTokens(query: string): boolean {
  return searchTokens(query).length > 0;
}

/**
 * Shared by the channels page and the export endpoint so a filtered view and a
 * filtered download always contain the same channels.
 */
export function filterChannels<T extends FilterableChannel>(channels: T[], query: string): T[] {
  const tokens = searchTokens(query);
  if (tokens.length === 0) return channels;

  return channels.filter((channel) => {
    const haystack = fold(
      [channel.title, channel.channel_id, channel.handle ?? "", channel.category ?? ""].join(" "),
    );
    return tokens.every((token) => haystack.includes(token));
  });
}
