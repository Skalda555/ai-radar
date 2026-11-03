import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { afterEach, describe, it } from "node:test";
import type { Db } from "../src/lib/db/client";
import { parseAnalysisOutput, PROMPT_VERSION } from "../src/lib/gemini/schema";
import { saveAnalysis } from "../src/lib/analysis/store";
import { knowledgeFacets, knowledgeStats, searchKnowledge } from "../src/lib/queries/knowledge";
import { analysisToJson, analysisToMarkdown } from "../src/lib/export/analysis";
import { knowledgeToJson, knowledgeToMarkdown, loadKnowledgeItems } from "../src/lib/export/knowledge";
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
    tokenInput: 100,
    tokenOutput: 200,
  });
  return db;
}

afterEach(() => {
  db?.close();
  db = null;
});

describe("searchKnowledge", () => {
  it("najde poznatek přes FTS5 bez Gemini", () => {
    const database = setup();
    const result = searchKnowledge(database, { q: "codex" });
    assert.ok(result.total > 0);
    assert.equal(result.usedFts, true);
    assert.ok(result.rows[0].video_title.includes("Codex"));
  });

  it("ignoruje diakritiku v dotazu", () => {
    const database = setup();
    const withDiacritics = searchKnowledge(database, { q: "repozitář" });
    const withoutDiacritics = searchKnowledge(database, { q: "repozitar" });
    assert.ok(withDiacritics.total > 0, "diakritický dotaz musí něco najít");
    assert.equal(withDiacritics.total, withoutDiacritics.total);
  });

  it("filtruje podle typu a ověření", () => {
    const database = setup();
    const tools = searchKnowledge(database, { kind: "TOOL" });
    assert.ok(tools.total > 0);
    assert.ok(tools.rows.every((row) => row.kind === "TOOL"));

    const verified = searchKnowledge(database, { verification: "USER_VERIFIED" });
    assert.equal(verified.total, 0);

    const extracted = searchKnowledge(database, { verification: "AI_EXTRACTED" });
    assert.ok(extracted.total > 0);
  });

  it("nenajde nesouvisející dotaz", () => {
    const database = setup();
    assert.equal(searchKnowledge(database, { q: "svíčková" }).total, 0);
  });

  it("poskytne facety a statistiky", () => {
    const database = setup();
    const facets = knowledgeFacets(database);
    assert.ok(facets.kinds.some((kind) => kind.value === "KEY_POINT"));
    assert.ok(facets.channels.some((channel) => channel.value === CHANNEL_ID));
    const stats = knowledgeStats(database);
    assert.ok(stats.items > 0);
    assert.equal(stats.verified, 0, "model sám nic neoznačí jako ověřené");
  });
});

describe("export analýzy", () => {
  it("Markdown obsahuje zdroj, časové odkazy a stav ověření", () => {
    const database = setup();
    const markdown = analysisToMarkdown(database, VIDEO_ID);
    assert.ok(markdown);
    assert.match(markdown ?? "", /^# Codex Skills v praxi/);
    assert.match(markdown ?? "", /https:\/\/www\.youtube\.com\/watch\?v=aaaaaaaaaaa/);
    assert.match(markdown ?? "", /Ověření: \*\*AI extrakce\*\*/);
    assert.match(markdown ?? "", /neznamenají nezávislé ověření/i);
    assert.match(markdown ?? "", /Doporučení AI Radaru/);
  });

  it("JSON obsahuje položky a metadata modelu", () => {
    const database = setup();
    const payload = analysisToJson(database, VIDEO_ID) as {
      analysis: { model: string; prompt_version: string; relevance: { score: number } };
      items: { verification_status: string; timestamp_url: string | null }[];
      video: { url: string };
    };
    assert.equal(payload.analysis.model, "gemini-3.5-flash-lite");
    assert.equal(payload.analysis.relevance.score, 92);
    assert.ok(payload.items.length >= 8);
    assert.ok(payload.items.every((item) => item.verification_status === "AI_EXTRACTED"));
    assert.ok(payload.items.some((item) => item.timestamp_url));
    assert.match(payload.video.url, /youtube\.com/);
  });

  it("vrátí null pro video bez analýzy", () => {
    const database = setup();
    seedVideo(database, { videoId: "bbbbbbbbbbb" });
    assert.equal(analysisToMarkdown(database, "bbbbbbbbbbb"), null);
    assert.equal(analysisToJson(database, "bbbbbbbbbbb"), null);
  });
});

describe("export vybraných poznatků", () => {
  it("seskupí poznatky podle videa a zachová ověření", () => {
    const database = setup();
    const all = searchKnowledge(database, { perPage: 50 });
    const ids = all.rows.slice(0, 3).map((row) => row.id);
    const rows = loadKnowledgeItems(database, ids);
    assert.equal(rows.length, 3);

    const markdown = knowledgeToMarkdown(rows);
    assert.match(markdown, /AI Radar — vybrané poznatky/);
    assert.match(markdown, /Stav ověření/);

    const json = knowledgeToJson(rows);
    assert.equal(json.items.length, 3);
    assert.ok(json.items.every((item) => item.video.url.includes("youtube.com")));
  });

  it("prázdný výběr nevyhodí chybu", () => {
    const database = setup();
    assert.deepEqual(loadKnowledgeItems(database, []), []);
  });
});

describe("re-analýza", () => {
  it("přepíše analýzu bez duplicit v FTS", () => {
    const database = setup();
    const before = searchKnowledge(database, { perPage: 50 });
    const fts = database.prepare(`SELECT COUNT(*) AS c FROM knowledge_fts`).get() as { c: number };
    const items = database.prepare(`SELECT COUNT(*) AS c FROM analysis_items`).get() as { c: number };
    assert.equal(fts.c, items.c, "FTS musí odpovídat položkám");

    saveAnalysis(database, {
      videoId: VIDEO_ID,
      jobId: null,
      model: "gemini-3.5-flash-lite",
      promptVersion: PROMPT_VERSION,
      mode: "AGENTIC",
      output: parsed.ok ? parsed.data : ({} as never),
      rawOutput: raw,
      tokenInput: 10,
      tokenOutput: 20,
    });

    const after = searchKnowledge(database, { perPage: 50 });
    assert.equal(after.total, before.total, "po re-analýze nesmí být duplicity");
    const ftsAfter = database.prepare(`SELECT COUNT(*) AS c FROM knowledge_fts`).get() as { c: number };
    const itemsAfter = database.prepare(`SELECT COUNT(*) AS c FROM analysis_items`).get() as { c: number };
    assert.equal(ftsAfter.c, itemsAfter.c);
    assert.equal(
      (database.prepare(`SELECT COUNT(*) AS c FROM analysis_runs`).get() as { c: number }).c,
      2,
      "historie surových výstupů zůstává",
    );
  });
});
