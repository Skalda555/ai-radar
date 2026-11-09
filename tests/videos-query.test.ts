import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import type { Db } from "../src/lib/db/client";
import { getVideoDetail, listTopics, listVideos } from "../src/lib/queries/videos";
import { CHANNEL_ID, openTestDb, seedChannel, seedVideo } from "./helpers";

let db: Db | null = null;

function setup(): Db {
  db = openTestDb();
  seedChannel(db, { channelId: CHANNEL_ID, title: "Kanál AI" });
  seedVideo(db, {
    videoId: "aaaaaaaaaaa",
    title: "Codex Skills a MCP",
    description: "Praktický postup s MCP serverem",
    publishedAt: "2026-10-25T10:00:00+00:00",
  });
  seedVideo(db, {
    videoId: "bbbbbbbbbbb",
    title: "Vaření svíčkové",
    description: "Recept bez AI",
    publishedAt: "2026-09-01T10:00:00+00:00",
  });
  db.prepare(
    `INSERT INTO saved_videos (video_id, created_at) VALUES ('bbbbbbbbbbb', ?)`,
  ).run(new Date().toISOString());
  return db;
}

afterEach(() => {
  db?.close();
  db = null;
});

describe("listVideos", () => {
  it("hledá v uložených datech a ignoruje diakritiku", () => {
    const database = setup();
    const result = listVideos(database, { q: "codex mcp" });
    assert.equal(result.total, 1);
    assert.equal(result.rows[0].video_id, "aaaaaaaaaaa");

    const czech = listVideos(database, { q: "svíčkové" });
    assert.equal(czech.total, 1);
    assert.equal(czech.rows[0].video_id, "bbbbbbbbbbb");
  });

  it("filtruje podle kanálu i podle uložení", () => {
    const database = setup();
    assert.equal(listVideos(database, { channel: CHANNEL_ID }).total, 2);
    assert.equal(listVideos(database, { channel: "UCother0000000000000000" }).total, 0);
    const saved = listVideos(database, { savedOnly: true });
    assert.equal(saved.total, 1);
    assert.equal(saved.rows[0].is_saved, 1);
    assert.equal(listVideos(database, { status: "SAVED" }).total, 1);
  });

  it("filtruje podle stavu analýzy a data", () => {
    const database = setup();
    assert.equal(listVideos(database, { status: "NOT_ANALYZED" }).total, 2);
    assert.equal(listVideos(database, { status: "COMPLETED" }).total, 0);
    assert.equal(listVideos(database, { status: "UNKNOWN" }).total, 0);
    assert.equal(listVideos(database, { date: "30" }).total, 1);
    assert.equal(listVideos(database, { date: "all" }).total, 2);
  });

  it("řadí podle data a relevance a stránkuje", () => {
    const database = setup();
    const newest = listVideos(database, { sort: "newest" });
    assert.equal(newest.rows[0].video_id, "aaaaaaaaaaa");

    const oldest = listVideos(database, { sort: "oldest" });
    assert.equal(oldest.rows[0].video_id, "bbbbbbbbbbb");

    const paged = listVideos(database, { perPage: 1, page: 2 });
    assert.equal(paged.rows.length, 1);
    assert.equal(paged.pages, 2);

    const byRelevance = listVideos(database, { sort: "prelim", minRelevance: 1 });
    assert.ok(byRelevance.total >= 1);
  });

  it("bez parametru řadí podle odhadu relevance, ne podle data", () => {
    const database = setup();
    // Starší video dostane vyšší odhad, novější nižší.
    database.prepare(`UPDATE videos SET prelim_relevance = 90 WHERE video_id = 'bbbbbbbbbbb'`).run();
    database.prepare(`UPDATE videos SET prelim_relevance = 10 WHERE video_id = 'aaaaaaaaaaa'`).run();

    const result = listVideos(database, {});

    assert.equal(result.rows[0].video_id, "bbbbbbbbbbb", "starší video s vyšším odhadem je první");
    assert.equal(result.rows[1].video_id, "aaaaaaaaaaa");

    const explicitNewest = listVideos(database, { sort: "newest" });
    assert.equal(explicitNewest.rows[0].video_id, "aaaaaaaaaaa", "Nejnovější musí jít vybrat dál");
  });


  it("poskytne témata pro filtr", () => {
    const database = setup();
    const topics = listTopics(database);
    assert.ok(Array.isArray(topics));
  });
});

describe("getVideoDetail", () => {
  it("vrátí video i s prázdnou analýzou a plain objekty", () => {
    const database = setup();
    const detail = getVideoDetail(database, "aaaaaaaaaaa");
    assert.ok(detail);
    assert.equal(detail?.video.title, "Codex Skills a MCP");
    assert.equal(detail?.analysis, undefined);
    assert.deepEqual(detail?.items, []);
    assert.equal(Object.getPrototypeOf(detail?.video), Object.prototype, "řádek musí být plain objekt");
  });

  it("vrátí null pro neexistující video", () => {
    const database = setup();
    assert.equal(getVideoDetail(database, "neexistuje1"), null);
  });
});
