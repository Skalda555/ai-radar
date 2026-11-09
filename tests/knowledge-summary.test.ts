import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { afterEach, describe, it } from "node:test";
import type { Db } from "../src/lib/db/client";
import { parseAnalysisOutput, PROMPT_VERSION } from "../src/lib/gemini/schema";
import { saveAnalysis } from "../src/lib/analysis/store";
import {
  addSummaryPointToKnowledge,
  countCurated,
  setItemCurated,
  SUMMARY_POINT_MAX_CHARS,
} from "../src/lib/knowledge/actions";
import { searchKnowledge } from "../src/lib/queries/knowledge";
import { CHANNEL_ID, openTestDb, seedChannel, seedVideo } from "./helpers";

const raw = readFileSync(path.join(process.cwd(), "tests", "fixtures", "analysis-valid.json"), "utf8");
const parsed = parseAnalysisOutput(raw);
if (!parsed.ok) throw new Error("fixture must parse");

const VIDEO_ID = "aaaaaaaaaaa";
const PARAGRAPH =
  "Model Kimi K3.1 Pro stojí polovinu toho co Opus 5.5 a na benchmarcích se drží na špičce.";

let db: Db | null = null;

function setup(): Db {
  db = openTestDb();
  seedChannel(db, { channelId: CHANNEL_ID, title: "Testovací kanál" });
  seedVideo(db, { videoId: VIDEO_ID, title: "Codex Skills a MCP" });
  saveAnalysis(db, {
    videoId: VIDEO_ID,
    jobId: null,
    model: "gemini-3.5-flash-lite",
    promptVersion: PROMPT_VERSION,
    mode: "AGENTIC",
    output: parsed.ok ? parsed.data : ({} as never),
    rawOutput: raw,
    tokenInput: 100,
    tokenOutput: 200,
  });
  return db;
}

afterEach(() => {
  db?.close();
  db = null;
});

describe("poznatek ze shrnutí do databáze znalostí", () => {
  it("uloží odstavec jako kurátorovanou položku", () => {
    const database = setup();
    const before = countCurated(database);

    const result = addSummaryPointToKnowledge(database, {
      videoId: VIDEO_ID,
      text: PARAGRAPH,
      source: "deep",
    });

    assert.equal(result.ok, true);
    if (!result.ok) return;
    assert.equal(result.alreadyStored, false);
    assert.equal(countCurated(database), before + 1);

    const row = database
      .prepare(`SELECT kind, text_cs, curated_at, verification_status, extra_json FROM analysis_items WHERE id = ?`)
      .get(result.itemId) as {
      kind: string;
      text_cs: string;
      curated_at: string | null;
      verification_status: string;
      extra_json: string;
    };

    assert.equal(row.kind, "KEY_POINT");
    assert.equal(row.text_cs, PARAGRAPH);
    assert.ok(row.curated_at, "položka musí být hned v databázi znalostí");
    assert.equal(row.verification_status, "AI_EXTRACTED", "shrnutí není ruční ověření");
    const meta = JSON.parse(row.extra_json) as { source: string; summarySource: string };
    assert.equal(meta.source, "ANALYSIS_SUMMARY");
    assert.equal(meta.summarySource, "deep");
  });

  it("je dohledatelný fulltextem a mezi kurátorovanými", () => {
    const database = setup();
    addSummaryPointToKnowledge(database, { videoId: VIDEO_ID, text: PARAGRAPH, source: "summary" });

    const found = searchKnowledge(database, { q: "benchmarcich", curatedOnly: true });
    assert.ok(found.total > 0, "fulltext musí položku najít");
    assert.ok(found.rows.some((row) => row.text_cs === PARAGRAPH));
  });

  it("druhé uložení nevytvoří duplikát", () => {
    const database = setup();
    const first = addSummaryPointToKnowledge(database, { videoId: VIDEO_ID, text: PARAGRAPH, source: "summary" });
    const second = addSummaryPointToKnowledge(database, { videoId: VIDEO_ID, text: `  ${PARAGRAPH}  `, source: "summary" });

    assert.equal(first.ok, true);
    assert.equal(second.ok, true);
    if (!first.ok || !second.ok) return;
    assert.equal(second.itemId, first.itemId);
    assert.equal(second.alreadyStored, true);

    const count = database
      .prepare(`SELECT COUNT(*) AS c FROM analysis_items WHERE video_id = ? AND text_cs = ?`)
      .get(VIDEO_ID, PARAGRAPH) as { c: number };
    assert.equal(Number(count.c), 1);
  });

  it("vrácený odstavec znovu označí jako kurátorovaný", () => {
    const database = setup();
    const result = addSummaryPointToKnowledge(database, { videoId: VIDEO_ID, text: PARAGRAPH, source: "summary" });
    assert.equal(result.ok, true);
    if (!result.ok) return;

    setItemCurated(database, result.itemId, false);
    const again = addSummaryPointToKnowledge(database, { videoId: VIDEO_ID, text: PARAGRAPH, source: "summary" });

    assert.equal(again.ok, true);
    if (!again.ok) return;
    assert.equal(again.alreadyStored, true);
    assert.equal(again.itemId, result.itemId);
    assert.equal(countCurated(database) >= 1, true);
  });

  it("krátký text odmítne", () => {
    const database = setup();
    const result = addSummaryPointToKnowledge(database, { videoId: VIDEO_ID, text: "krátké", source: "summary" });
    assert.equal(result.ok, false);
    if (result.ok) return;
    assert.equal(result.code, "INVALID_TEXT");
  });

  it("příliš dlouhý text odmítne", () => {
    const database = setup();
    const result = addSummaryPointToKnowledge(database, {
      videoId: VIDEO_ID,
      text: "x".repeat(SUMMARY_POINT_MAX_CHARS + 1),
      source: "summary",
    });
    assert.equal(result.ok, false);
    if (result.ok) return;
    assert.equal(result.code, "TOO_LONG");
  });

  it("video bez analýzy odmítne", () => {
    const database = setup();
    seedVideo(database, { videoId: "bbbbbbbbbbb", title: "Bez analýzy" });
    const result = addSummaryPointToKnowledge(database, {
      videoId: "bbbbbbbbbbb",
      text: PARAGRAPH,
      source: "summary",
    });
    assert.equal(result.ok, false);
    if (result.ok) return;
    assert.equal(result.code, "NO_ANALYSIS");
  });
});
