import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import type { Db } from "../src/lib/db/client";
import { translateTexts } from "../src/lib/translate/google";
import { countUntranslatedTitles, translatePendingTitles } from "../src/lib/translate/titles";
import { CHANNEL_ID, openTestDb, seedChannel, seedVideo } from "./helpers";

let db: Db | null = null;

function setup(): Db {
  db = openTestDb();
  seedChannel(db, { channelId: CHANNEL_ID, title: "AI kanál" });
  seedVideo(db, {
    videoId: "aaaaaaaaaaa",
    title: "How I built an MCP server",
    description: "Tutorial about MCP servers and Codex skills.",
    publishedAt: "2026-11-01T10:00:00+00:00",
  });
  seedVideo(db, {
    videoId: "bbbbbbbbbbb",
    title: "Second video",
    description: "Another description",
    publishedAt: "2026-10-30T10:00:00+00:00",
  });
  return db;
}

afterEach(() => {
  db?.close();
  db = null;
});

function translationFetch(map: Record<string, string>) {
  const calls: string[][] = [];
  const fetchImpl = (async (_url: string, init?: RequestInit) => {
    const body = JSON.parse(String(init?.body ?? "{}")) as { q?: string[] };
    const texts = body.q ?? [];
    calls.push(texts);
    return new Response(
      JSON.stringify({
        data: {
          translations: texts.map((text) => ({
            translatedText: map[text] ?? `PŘEKLAD: ${text}`,
            detectedSourceLanguage: "en",
          })),
        },
      }),
      { status: 200, headers: { "content-type": "application/json" } },
    );
  }) as unknown as typeof fetch;
  return { fetchImpl, calls };
}

describe("translateTexts", () => {
  it("bez klíče nic neposílá", async () => {
    const result = await translateTexts(["Hello"], { apiKey: "" });
    assert.equal(result.ok === false ? result.code : "", "MISSING_KEY");
  });

  it("přeloží dávku a dekóduje entity", async () => {
    const { fetchImpl } = translationFetch({ Hello: "Ahoj &amp; vítej" });
    const result = await translateTexts(["Hello"], { apiKey: "k", fetchImpl });
    assert.equal(result.ok, true);
    assert.equal(result.ok === true ? result.translations[0] : "", "Ahoj & vítej");
  });

  it("HTTP 403 vrátí srozumitelnou chybu", async () => {
    const failing = (async () =>
      new Response(JSON.stringify({ error: { message: "keyInvalid" } }), {
        status: 403,
        headers: { "content-type": "application/json" },
      })) as unknown as typeof fetch;
    const result = await translateTexts(["Hello"], { apiKey: "k", fetchImpl: failing });
    assert.equal(result.ok === false ? result.code : "", "HTTP");
    assert.match(result.ok === false ? result.message : "", /GOOGLE_TRANSLATE_API_KEY/);
  });
});

describe("translatePendingTitles", () => {
  it("přeloží chybějící názvy a uloží je", async () => {
    const database = setup();
    assert.equal(countUntranslatedTitles(database), 2);
    const { fetchImpl, calls } = translationFetch({ "How I built an MCP server": "Jak jsem postavil MCP server" });

    const result = await translatePendingTitles(database, { apiKey: "k", fetchImpl });
    assert.equal(result.ok, true);
    assert.equal(result.translated, 2);
    assert.equal(result.remaining, 0);
    assert.equal(calls.length, 1, "jedna dávka");

    const row = database
      .prepare(`SELECT title_cs_google, title_cs_google_source FROM videos WHERE video_id = 'aaaaaaaaaaa'`)
      .get() as { title_cs_google: string; title_cs_google_source: string };
    assert.equal(row.title_cs_google, "Jak jsem postavil MCP server");
    assert.equal(row.title_cs_google_source, "How I built an MCP server");
  });

  it("podruhé už nic neposílá", async () => {
    const database = setup();
    const { fetchImpl, calls } = translationFetch({});
    await translatePendingTitles(database, { apiKey: "k", fetchImpl });
    const second = await translatePendingTitles(database, { apiKey: "k", fetchImpl });
    assert.equal(second.translated, 0);
    assert.equal(calls.length, 1, "cache zabránila druhému požadavku");
  });

  it("změněný název se přeloží znovu", async () => {
    const database = setup();
    const first = translationFetch({});
    await translatePendingTitles(database, { apiKey: "k", fetchImpl: first.fetchImpl });

    database.prepare(`UPDATE videos SET title = ? WHERE video_id = 'aaaaaaaaaaa'`).run("Renamed video");
    const second = translationFetch({ "Renamed video": "Přejmenované video" });
    const result = await translatePendingTitles(database, { apiKey: "k", fetchImpl: second.fetchImpl });

    assert.equal(result.translated, 1);
    assert.equal(second.calls.length, 1);
    const row = database.prepare(`SELECT title_cs_google FROM videos WHERE video_id = 'aaaaaaaaaaa'`).get() as {
      title_cs_google: string;
    };
    assert.equal(row.title_cs_google, "Přejmenované video");
  });

  it("překlad se propíše do fulltextu", () => {
    const database = setup();
    return translatePendingTitles(database, {
      apiKey: "k",
      fetchImpl: translationFetch({ "How I built an MCP server": "Jak postavit MCP server" }).fetchImpl,
    }).then(() => {
      // search_text je folded, diakritika se ignoruje
      const found = database
        .prepare(`SELECT COUNT(*) AS c FROM videos WHERE search_text LIKE ?`)
        .get("%postavit mcp server%") as { c: number };
      assert.ok(found.c >= 1, " český překlad je dohledatelný");
    });
  });

  it("bez klíče vrátí chybu a nic nezapíše", async () => {
    const database = setup();
    const result = await translatePendingTitles(database, { apiKey: null });
    assert.equal(result.ok, false);
    assert.equal(result.translated, 0);
    assert.equal(countUntranslatedTitles(database), 2);
  });

  it("eviduje spotřebu překladu", async () => {
    const database = setup();
    const { fetchImpl } = translationFetch({});
    await translatePendingTitles(database, { apiKey: "k", fetchImpl });
    const usage = database
      .prepare(`SELECT COUNT(*) AS c FROM api_usage WHERE provider = 'google_translate'`)
      .get() as { c: number };
    assert.equal(usage.c, 1);
  });
});

