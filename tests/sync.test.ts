import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import type { Db } from "../src/lib/db/client";
import { syncChannel, syncAllActive, lastSyncRun } from "../src/lib/youtube/sync";
import type { VideoRow } from "../src/lib/types";
import { CHANNEL_ID, failingFetch, fakeFetchFor, makeFeed, openTestDb, seedChannel } from "./helpers";

let db: Db | null = null;

function setup(): Db {
  db = openTestDb();
  return db;
}

afterEach(() => {
  db?.close();
  db = null;
});

function videos(database: Db): VideoRow[] {
  return database.prepare(`SELECT * FROM videos ORDER BY video_id`).all() as unknown as VideoRow[];
}

describe("syncChannel", () => {
  it("zapíše videa z reálného feedu a nastaví název kanálu", async () => {
    const database = setup();
    const channel = seedChannel(database, { channelId: CHANNEL_ID, title: CHANNEL_ID });
    const xml = makeFeed(CHANNEL_ID, "AI Weekly", [
      { id: "aaaaaaaaaaa", title: "Codex Skills v praxi", description: "MCP server a workflow" },
      { id: "bbbbbbbbbbb", title: "Claude Code agenti" },
    ]);

    const result = await syncChannel(database, channel, { fetchImpl: fakeFetchFor(xml) });

    assert.equal(result.status, "OK");
    assert.equal(result.found, 2);
    assert.equal(result.created, 2);
    assert.equal(result.updated, 0);

    const rows = videos(database);
    assert.equal(rows.length, 2);
    assert.equal(rows[0].channel_id, CHANNEL_ID);
    assert.match(rows[0].url, /^https:\/\/www\.youtube\.com\/watch\?v=/);
    assert.equal(rows[0].duration_seconds, null, "délka videa se nesmí odhadovat");
    assert.ok((rows[0].prelim_relevance ?? 0) > 0);
    assert.ok(rows[0].search_text.includes("codex"));

    const updatedChannel = database
      .prepare(`SELECT * FROM channels WHERE channel_id = ?`)
      .get(CHANNEL_ID) as unknown as { title: string; last_sync_status: string; last_sync_new_videos: number };
    assert.equal(updatedChannel.title, "AI Weekly");
    assert.equal(updatedChannel.last_sync_status, "OK");
    assert.equal(updatedChannel.last_sync_new_videos, 2);

    const run = lastSyncRun(database);
    assert.equal(run?.status, "OK");
    assert.equal(run?.videos_new, 2);
  });

  it("je idempotentní – druhý běh nevytvoří duplicity", async () => {
    const database = setup();
    const channel = seedChannel(database, { channelId: CHANNEL_ID });
    const xml = makeFeed(CHANNEL_ID, "Kanál", [
      { id: "aaaaaaaaaaa", title: "První" },
      { id: "bbbbbbbbbbb", title: "Druhé" },
    ]);

    await syncChannel(database, channel, { fetchImpl: fakeFetchFor(xml) });
    const refreshed = database
      .prepare(`SELECT * FROM channels WHERE channel_id = ?`)
      .get(CHANNEL_ID) as never;
    const second = await syncChannel(database, refreshed, { fetchImpl: fakeFetchFor(xml) });

    assert.equal(second.created, 0);
    assert.equal(second.updated, 0);
    assert.equal(videos(database).length, 2);
  });

  it("aktualizuje změněná metadata bez ztráty analýzy a uložení", async () => {
    const database = setup();
    const channel = seedChannel(database, { channelId: CHANNEL_ID });
    const firstXml = makeFeed(CHANNEL_ID, "Kanál", [{ id: "aaaaaaaaaaa", title: "Původní název" }]);
    await syncChannel(database, channel, { fetchImpl: fakeFetchFor(firstXml) });

    database
      .prepare(
        `INSERT INTO analyses (video_id, model, prompt_version, mode, status, summary_short_cs, created_at, updated_at)
         VALUES (?, 'gemini-3.5-flash-lite', 'v1', 'AGENTIC', 'COMPLETED', 'Shrnutí', ?, ?)`,
      )
      .run("aaaaaaaaaaa", new Date().toISOString(), new Date().toISOString());
    database
      .prepare(`INSERT INTO saved_videos (video_id, note, created_at) VALUES (?, ?, ?)`)
      .run("aaaaaaaaaaa", "později", new Date().toISOString());

    const refreshed = database
      .prepare(`SELECT * FROM channels WHERE channel_id = ?`)
      .get(CHANNEL_ID) as never;
    const secondXml = makeFeed(CHANNEL_ID, "Kanál", [{ id: "aaaaaaaaaaa", title: "Nový název" }]);
    const result = await syncChannel(database, refreshed, { fetchImpl: fakeFetchFor(secondXml) });

    assert.equal(result.updated, 1);
    assert.equal(videos(database)[0].title, "Nový název");
    assert.equal(
      (database.prepare(`SELECT COUNT(*) AS c FROM analyses`).get() as { c: number }).c,
      1,
    );
    assert.equal(
      (database.prepare(`SELECT COUNT(*) AS c FROM saved_videos`).get() as { c: number }).c,
      1,
    );
  });

  it("při nedostupném feedu zapíše chybu a nic neuloží", async () => {
    const database = setup();
    const channel = seedChannel(database, { channelId: CHANNEL_ID });

    const result = await syncChannel(database, channel, { fetchImpl: failingFetch("TimeoutError") });

    assert.equal(result.status, "FAILED");
    assert.match(result.error ?? "", /TIMEOUT/);
    assert.equal(videos(database).length, 0);

    const stored = database
      .prepare(`SELECT last_sync_status, last_sync_error FROM channels WHERE channel_id = ?`)
      .get(CHANNEL_ID) as unknown as { last_sync_status: string; last_sync_error: string };
    assert.equal(stored.last_sync_status, "FAILED");
    assert.match(stored.last_sync_error, /TIMEOUT/);
    assert.equal(lastSyncRun(database)?.status, "FAILED");
  });

  it("odmítne feed s jiným Channel ID, než bylo požadováno", async () => {
    const database = setup();
    const channel = seedChannel(database, { channelId: CHANNEL_ID });
    const xml = makeFeed("UCffffffffffffffffffffff", "Cizí kanál", [
      { id: "aaaaaaaaaaa", title: "Cizí video" },
    ]);

    const result = await syncChannel(database, channel, { fetchImpl: fakeFetchFor(xml) });
    assert.equal(result.status, "FAILED");
    assert.match(result.error ?? "", /jiné Channel ID/);
    assert.equal(videos(database).length, 0);
  });

  it("synchronizuje jen aktivní kanály", async () => {
    const database = setup();
    seedChannel(database, { channelId: CHANNEL_ID, title: "Aktivní" });
    seedChannel(database, { channelId: "UCffffffffffffffffffffff", title: "Pozastavený", isActive: false });
    const xml = makeFeed(CHANNEL_ID, "Aktivní", [{ id: "aaaaaaaaaaa", title: "Video" }]);

    const summary = await syncAllActive(database, { fetchImpl: fakeFetchFor(xml) });
    assert.equal(summary.results.length, 1);
    assert.equal(summary.totalNew, 1);
  });
});
