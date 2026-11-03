import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { afterEach, describe, it } from "node:test";
import type { Db } from "../src/lib/db/client";
import { saveAnalysis } from "../src/lib/analysis/store";
import { parseAnalysisOutput, PROMPT_VERSION } from "../src/lib/gemini/schema";
import { deleteChannel, getChannelDeletionImpact } from "../src/lib/channels/service";
import { CHANNEL_ID, openTestDb, seedChannel, seedVideo } from "./helpers";

const raw = readFileSync(path.join(process.cwd(), "tests", "fixtures", "analysis-valid.json"), "utf8");
const parsed = parseAnalysisOutput(raw);
if (!parsed.ok) throw new Error("fixture must parse");

const OTHER_CHANNEL = "UCffffffffffffffffffffff";
const VIDEO_ID = "aaaaaaaaaaa";

let db: Db | null = null;

function setup(): Db {
  db = openTestDb();
  seedChannel(db, { channelId: CHANNEL_ID, title: "Ke smazání" });
  seedChannel(db, { channelId: OTHER_CHANNEL, title: "Zůstává" });
  seedVideo(db, { videoId: VIDEO_ID, channelId: CHANNEL_ID, title: "Video ke smazání" });
  seedVideo(db, { videoId: "bbbbbbbbbbb", channelId: OTHER_CHANNEL, title: "Video, které zůstává" });

  saveAnalysis(db, {
    videoId: VIDEO_ID,
    jobId: null,
    model: "gemini-3.5-flash-lite",
    promptVersion: PROMPT_VERSION,
    mode: "AGENTIC",
    output: parsed.ok ? parsed.data : ({} as never),
    rawOutput: raw,
    tokenInput: null,
    tokenOutput: null,
  });

  const now = new Date().toISOString();
  db.prepare(`INSERT INTO saved_videos (video_id, created_at) VALUES (?, ?)`).run(VIDEO_ID, now);
  db.prepare(
    `INSERT INTO analysis_jobs (id, video_id, model, mode, status, background, created_at, updated_at)
     VALUES ('job-del-1', ?, 'gemini-3.5-flash-lite', 'AGENTIC', 'FAILED', 1, ?, ?)`,
  ).run(VIDEO_ID, now, now);

  const analysis = db.prepare(`SELECT id FROM analyses WHERE video_id = ?`).get(VIDEO_ID) as { id: number };
  db.prepare(
    `INSERT INTO analysis_questions (analysis_id, video_id, question, status, model, prompt_version, is_demo, created_at)
     VALUES (?, ?, 'Testovací dotaz?', 'FAILED', 'm', 'v', 0, ?)`,
  ).run(analysis.id, VIDEO_ID, now);

  return db;
}

afterEach(() => {
  db?.close();
  db = null;
});

function count(database: Db, sql: string): number {
  return Number((database.prepare(sql).get() as { c: number }).c);
}

describe("smazání kanálu", () => {
  it("spočítá, co se smaže", () => {
    const database = setup();
    const impact = getChannelDeletionImpact(database, CHANNEL_ID);
    assert.ok(impact);
    assert.equal(impact?.videos, 1);
    assert.equal(impact?.analyses, 1);
    assert.equal(impact?.saved, 1);
    assert.equal(impact?.questions, 1);
    assert.equal(impact?.jobs, 1);
    assert.ok((impact?.items ?? 0) > 0);
  });

  it("smaže kanál včetně videí, analýz, FTS a auditních běhů", () => {
    const database = setup();
    assert.ok(count(database, `SELECT COUNT(*) AS c FROM knowledge_fts`) > 0);

    const result = deleteChannel(database, CHANNEL_ID);
    assert.equal(result.ok, true);
    assert.equal(result.ok === true ? result.backupPath : "x", null, "u in-memory DB se záloha nedělá");

    assert.equal(count(database, `SELECT COUNT(*) AS c FROM channels WHERE channel_id = '${CHANNEL_ID}'`), 0);
    assert.equal(count(database, `SELECT COUNT(*) AS c FROM videos WHERE channel_id = '${CHANNEL_ID}'`), 0);
    assert.equal(count(database, `SELECT COUNT(*) AS c FROM analyses`), 0);
    assert.equal(count(database, `SELECT COUNT(*) AS c FROM analysis_items`), 0);
    assert.equal(count(database, `SELECT COUNT(*) AS c FROM saved_videos`), 0);
    assert.equal(count(database, `SELECT COUNT(*) AS c FROM analysis_questions`), 0);
    assert.equal(count(database, `SELECT COUNT(*) AS c FROM analysis_jobs`), 0);
    assert.equal(count(database, `SELECT COUNT(*) AS c FROM analysis_runs`), 0);
    assert.equal(count(database, `SELECT COUNT(*) AS c FROM knowledge_fts`), 0);
  });

  it("druhý kanál zůstane nedotčený", () => {
    const database = setup();
    deleteChannel(database, CHANNEL_ID);
    assert.equal(count(database, `SELECT COUNT(*) AS c FROM channels`), 1);
    assert.equal(count(database, `SELECT COUNT(*) AS c FROM videos`), 1);
    const remaining = database.prepare(`SELECT video_id FROM videos`).get() as { video_id: string };
    assert.equal(remaining.video_id, "bbbbbbbbbbb");
  });

  it("neexistující kanál vrátí NOT_FOUND a nic nesmaže", () => {
    const database = setup();
    const result = deleteChannel(database, "UCnicnicnicnicnicnicnic");
    assert.equal(result.ok === false ? result.code : "", "NOT_FOUND");
    assert.equal(count(database, `SELECT COUNT(*) AS c FROM channels`), 2);
  });

  it("opakované smazání vrátí NOT_FOUND", () => {
    const database = setup();
    assert.equal(deleteChannel(database, CHANNEL_ID).ok, true);
    const again = deleteChannel(database, CHANNEL_ID);
    assert.equal(again.ok === false ? again.code : "", "NOT_FOUND");
  });
});
