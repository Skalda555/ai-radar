import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { afterEach, describe, it } from "node:test";
import type { Db } from "../src/lib/db/client";
import { saveAnalysis } from "../src/lib/analysis/store";
import { parseAnalysisOutput, PROMPT_VERSION } from "../src/lib/gemini/schema";
import { countCurated, setItemCurated, setVideoKnowledgeHidden } from "../src/lib/knowledge/actions";
import { searchKnowledge } from "../src/lib/queries/knowledge";
import { CHANNEL_ID, openTestDb, seedChannel, seedVideo } from "./helpers";

const raw = readFileSync(path.join(process.cwd(), "tests", "fixtures", "analysis-valid.json"), "utf8");
const parsed = parseAnalysisOutput(raw);
if (!parsed.ok) throw new Error("fixture must parse");

const VIDEO_ID = "aaaaaaaaaaa";
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
    tokenInput: null,
    tokenOutput: null,
  });
  return db;
}

afterEach(() => {
  db?.close();
  db = null;
});

describe("skrytí videa v knihovně", () => {
  it("skryje všechna tvrzení videa a zobrazí je jen s filtrem", () => {
    const database = setup();
    const visible = searchKnowledge(database, { perPage: 50 });
    assert.ok(visible.total > 0);

    const hidden = setVideoKnowledgeHidden(database, VIDEO_ID, true);
    assert.equal(hidden.ok, true);
    assert.equal(searchKnowledge(database, { perPage: 50 }).total, 0);
    assert.equal(searchKnowledge(database, { perPage: 50, includeHidden: true }).total, visible.total);
  });

  it("zrušení skrytí vrátí položky zpět", () => {
    const database = setup();
    const total = searchKnowledge(database, { perPage: 50 }).total;
    setVideoKnowledgeHidden(database, VIDEO_ID, true);
    setVideoKnowledgeHidden(database, VIDEO_ID, false);
    assert.equal(searchKnowledge(database, { perPage: 50 }).total, total);
  });

  it("neexistující video vrátí ok: false", () => {
    const database = setup();
    assert.equal(setVideoKnowledgeHidden(database, "UCnicnicnicnicnicnicnic", true).ok, false);
  });
});

describe("ukládání do databáze znalostí", () => {
  it("označí položku a zobrazí ji jen v databázi", () => {
    const database = setup();
    const first = searchKnowledge(database, { perPage: 1 }).rows[0];
    assert.equal(countCurated(database), 0);

    const result = setItemCurated(database, first.id, true);
    assert.equal(result.ok, true);
    assert.equal(countCurated(database), 1);
    assert.equal(searchKnowledge(database, { curatedOnly: true }).total, 1);
    assert.equal(searchKnowledge(database, { perPage: 50 }).total > 1, true, "knihovna zůstává plná");
  });

  it("odebrání z databáze položku vrátí do běžného stavu", () => {
    const database = setup();
    const first = searchKnowledge(database, { perPage: 1 }).rows[0];
    setItemCurated(database, first.id, true);
    setItemCurated(database, first.id, false);
    assert.equal(countCurated(database), 0);
    assert.equal(searchKnowledge(database, { curatedOnly: true }).total, 0);
  });

  it("uložená znalost zůstane v databázi i po skrytí videa", () => {
    const database = setup();
    const first = searchKnowledge(database, { perPage: 1 }).rows[0];
    setItemCurated(database, first.id, true);
    setVideoKnowledgeHidden(database, VIDEO_ID, true);

    assert.equal(searchKnowledge(database, { curatedOnly: true }).total, 0, "bez includeHidden je skrytá");
    assert.equal(
      searchKnowledge(database, { curatedOnly: true, includeHidden: true }).total,
      1,
      "databáze používá includeHidden",
    );
  });

  it("neexistující položka vrátí ok: false", () => {
    const database = setup();
    assert.equal(setItemCurated(database, 999999, true).ok, false);
  });
});
