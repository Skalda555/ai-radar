import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, it } from "node:test";
import { parseYouTubeFeed, FeedParseError } from "../src/lib/youtube/feed";
import { parseChannelInput } from "../src/lib/youtube/input";
import { resolveChannel } from "../src/lib/youtube/resolve";
import { scorePreliminary } from "../src/lib/relevance/prelim";

const fixture = readFileSync(path.join(process.cwd(), "tests", "fixtures", "feed-lex-clips.xml"), "utf8");

describe("parseChannelInput", () => {
  it("přijme přímé Channel ID", () => {
    const parsed = parseChannelInput("UCJIfeSCssxSC_Dhc5s7woww");
    assert.equal(parsed.kind, "channel_id");
  });

  it("přijme @handle i URL s @handle a podsložkou /videos", () => {
    for (const raw of [
      "@ColeMedin",
      "https://www.youtube.com/@ColeMedin",
      "youtube.com/@ColeMedin",
      "https://www.youtube.com/@ColeMedin/videos",
    ]) {
      const parsed = parseChannelInput(raw);
      assert.equal(parsed.kind, "handle", `vstup ${raw}`);
      assert.equal(parsed.kind === "handle" ? parsed.handle : "", "ColeMedin");
    }
  });

  it("přijme URL /channel/UC…", () => {
    const parsed = parseChannelInput("https://www.youtube.com/channel/UCJIfeSCssxSC_Dhc5s7woww");
    assert.equal(parsed.kind, "channel_id");
  });

  it("odmítne cizí doménu, video URL a nesmysl", () => {
    assert.equal(parseChannelInput("https://example.com/@foo").kind, "invalid");
    assert.equal(parseChannelInput("https://www.youtube.com/watch?v=3YaE5e4PXOk").kind, "invalid");
    assert.equal(parseChannelInput("").kind, "invalid");
    assert.equal(
      parseChannelInput("UC123").kind,
      "handle",
      "krátký UC… token je handle, ne odhadnuté Channel ID",
    );
    assert.equal(parseChannelInput("!!!").kind, "invalid");
  });

  it("nepředstírá /c/ a /user/ převod", () => {
    const parsed = parseChannelInput("https://www.youtube.com/c/SomeChannel");
    assert.equal(parsed.kind, "custom_url");
  });
});

describe("parseYouTubeFeed", () => {
  it("přečte skutečný feed z YouTube", () => {
    const feed = parseYouTubeFeed(fixture);
    assert.equal(feed.channelId, "UCJIfeSCssxSC_Dhc5s7woww");
    assert.equal(feed.title, "Lex Clips");
    assert.equal(feed.entries.length, 3);
    assert.equal(feed.skipped, 0);

    for (const entry of feed.entries) {
      assert.match(entry.videoId, /^[A-Za-z0-9_-]{11}$/);
      assert.ok(entry.title.length > 0);
      assert.ok(entry.description.length > 0);
      assert.match(entry.publishedAt, /^\d{4}-\d{2}-\d{2}T/);
      assert.equal(entry.url, `https://www.youtube.com/watch?v=${entry.videoId}`);
      assert.match(entry.thumbnailUrl, /^https:\/\/i\d?\.ytimg\.com\//);
    }
  });

  it("odmítne odpověď, která není feed", () => {
    assert.throws(() => parseYouTubeFeed("<html>Not found</html>"), FeedParseError);
  });

  it("odmítne feed bez channelId", () => {
    assert.throws(() => parseYouTubeFeed("<feed><title>x</title></feed>"), FeedParseError);
  });

  it("přeskočí položku s neplatným video ID", () => {
    const xml = fixture.replace("<yt:videoId>", "<yt:videoId>bad");
    const feed = parseYouTubeFeed(xml);
    assert.equal(feed.entries.length, 2);
    assert.equal(feed.skipped, 1);
  });

  it("nahradí podezřelou miniaturu bezpečným fallbackem", () => {
    const xml = `<?xml version="1.0"?>
<feed xmlns:yt="http://www.youtube.com/xml/schemas/2015" xmlns:media="http://search.yahoo.com/mrss/" xmlns="http://www.w3.org/2005/Atom">
  <yt:channelId>UCJIfeSCssxSC_Dhc5s7woww</yt:channelId><title>Test</title>
  <entry><yt:videoId>abcdefghijk</yt:videoId><title>Video</title>
  <published>2026-10-01T10:00:00+00:00</published>
  <media:group><media:thumbnail url="https://evil.example.com/x.jpg"/><media:description>Popis</media:description></media:group>
  </entry>
</feed>`;
    const feed = parseYouTubeFeed(xml);
    assert.equal(feed.entries[0].thumbnailUrl, "https://i.ytimg.com/vi/abcdefghijk/hqdefault.jpg");
  });
});

describe("resolveChannel", () => {
  it("bez API klíče vrátí srozumitelnou chybu MISSING_API_KEY", async () => {
    const parsed = parseChannelInput("@ColeMedin");
    const result = await resolveChannel(parsed, { apiKey: null });
    assert.equal(result.ok, false);
    assert.equal(result.ok === false ? result.code : "", "MISSING_API_KEY");
    assert.match(result.ok === false ? result.message : "", /YOUTUBE_API_KEY/);
  });

  it("přímé Channel ID funguje bez klíče", async () => {
    const parsed = parseChannelInput("UCJIfeSCssxSC_Dhc5s7woww");
    const result = await resolveChannel(parsed, { apiKey: null });
    assert.equal(result.ok, true);
    assert.equal(result.ok === true ? result.method : "", "DIRECT_ID");
  });

  it("převede @handle přes channels.list forHandle", async () => {
    let calledUrl = "";
    const fetchImpl = (async (input: string | URL | Request) => {
      calledUrl = String(input);
      return new Response(
        JSON.stringify({
          items: [
            {
              id: "UCJIfeSCssxSC_Dhc5s7woww",
              snippet: {
                title: "Lex Clips",
                description: "Clips",
                customUrl: "@LexClips",
                thumbnails: { high: { url: "https://yt3.googleusercontent.com/x.jpg" } },
              },
            },
          ],
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      );
    }) as typeof fetch;

    const result = await resolveChannel(parseChannelInput("@LexClips"), {
      fetchImpl,
      apiKey: "test-key",
    });

    assert.equal(result.ok, true);
    assert.equal(result.ok === true ? result.channel.title : "", "Lex Clips");
    assert.match(calledUrl, /forHandle=%40LexClips/);
    assert.match(calledUrl, /part=snippet/);
    assert.ok(calledUrl.includes("test-key"), "klíč jde jen na serverovou stranu API volání");
  });

  it("neexistující kanál vrátí NOT_FOUND", async () => {
    const fetchImpl = (async () =>
      new Response(JSON.stringify({ items: [] }), {
        status: 200,
        headers: { "content-type": "application/json" },
      })) as typeof fetch;
    const result = await resolveChannel(parseChannelInput("@nikdo"), {
      fetchImpl,
      apiKey: "k",
    });
    assert.equal(result.ok === false ? result.code : "", "NOT_FOUND");
  });

  it("HTTP 403 z API vrátí RATE_LIMITED s vysvětlením", async () => {
    const fetchImpl = (async () =>
      new Response("{}", { status: 403, headers: { "content-type": "application/json" } })) as typeof fetch;
    const result = await resolveChannel(parseChannelInput("@xyz"), { fetchImpl, apiKey: "k" });
    assert.equal(result.ok === false ? result.code : "", "RATE_LIMITED");
  });
});

describe("scorePreliminary", () => {
  it("vysoko ohodnotí české téma z názvu a popisu", () => {
    const result = scorePreliminary({
      title: "Codex Skills a MCP pro vibe coding",
      description: "Jak propojit MCP server s Claude Code a automatizovat workflow.",
      publishedAt: new Date().toISOString(),
      priority: 1,
    });
    assert.ok(result.score >= 70, `skóre ${result.score}`);
    assert.ok(result.topics.includes("Skills a MCP"));
    assert.ok(result.reasons.length >= 2);
  });

  it("nedá vysoké skóre videu bez souvislosti", () => {
    const result = scorePreliminary({
      title: "Vaření svíčkové na osm způsobů",
      description: "Recept z babiččiny kuchařky.",
      publishedAt: "2026-01-01T00:00:00.000Z",
      priority: 5,
    });
    assert.ok(result.score < 20, `skóre ${result.score}`);
    assert.deepEqual(result.topics, []);
  });

  it("je deterministické a bez diakritiky závislé", () => {
    const a = scorePreliminary({
      title: "AI AGENTI a automatizace",
      publishedAt: "2026-10-01T00:00:00.000Z",
      now: Date.parse("2026-10-02T00:00:00.000Z"),
    });
    const b = scorePreliminary({
      title: "ai agenti a automatizace",
      publishedAt: "2026-10-01T00:00:00.000Z",
      now: Date.parse("2026-10-02T00:00:00.000Z"),
    });
    assert.equal(a.score, b.score);
  });
});
