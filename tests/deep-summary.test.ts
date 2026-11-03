import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { afterEach, describe, it } from "node:test";
import type { Db } from "../src/lib/db/client";
import { saveAnalysis } from "../src/lib/analysis/store";
import { generateDeepSummary } from "../src/lib/analysis/deep-summary";
import { parseAnalysisOutput, PROMPT_VERSION } from "../src/lib/gemini/schema";
import { CHANNEL_ID, openTestDb, seedChannel, seedVideo } from "./helpers";

const raw = readFileSync(path.join(process.cwd(), "tests", "fixtures", "analysis-valid.json"), "utf8");
const parsed = parseAnalysisOutput(raw);
if (!parsed.ok) throw new Error("fixture must parse");

const VIDEO_ID = "aaaaaaaaaaa";
const LONG_TEXT =
  "Video začíná tím, že autor otevírá prázdný repozitář a vysvětluje, proč Skills nejsou jen delší prompt. " +
  "Potom ukazuje, jak založit složku a jak napsat instrukce, které agent načte až ve chvíli potřeby. " +
  "Ve druhé části připojí MCP server a ověří v logu, že agent nástroj skutečně zavolal. " +
  "Na závěr spustí testovací repozitář a porovná výstup s očekáváním. " +
  "Zmiňuje také rizika: bez omezení oprávnění může server sahat na data, která nechceš.";

let db: Db | null = null;

function setup(withAnalysis = true): Db {
  db = openTestDb();
  seedChannel(db, { channelId: CHANNEL_ID, title: "Testovací kanál" });
  seedVideo(db, { videoId: VIDEO_ID, title: "Codex Skills a MCP" });
  if (withAnalysis) {
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
  }
  return db;
}

afterEach(() => {
  db?.close();
  db = null;
});

function completedFetch(text: string, usage = { total_input_tokens: 90000, total_output_tokens: 1400 }) {
  return (async () =>
    new Response(
      JSON.stringify({
        id: "int_deep",
        status: "completed",
        usage,
        steps: [{ type: "model_output", content: [{ type: "text", text }] }],
      }),
      { status: 200, headers: { "content-type": "application/json" } },
    )) as typeof fetch;
}

describe("generateDeepSummary", () => {
  it("uloží podrobné shrnutí a zapíše spotřebu", async () => {
    const database = setup();
    const result = await generateDeepSummary(database, VIDEO_ID, {
      apiKey: "k",
      fetchImpl: completedFetch(LONG_TEXT),
    });

    assert.equal(result.ok, true);
    const row = database
      .prepare(`SELECT summary_deep_cs, deep_generated_at FROM analyses WHERE video_id = ?`)
      .get(VIDEO_ID) as { summary_deep_cs: string; deep_generated_at: string };
    assert.match(row.summary_deep_cs, /MCP server/);
    assert.ok(row.deep_generated_at);

    const usage = database
      .prepare(`SELECT token_input, token_output FROM api_usage WHERE operation = 'interactions.deep_summary'`)
      .get() as { token_input: number; token_output: number };
    assert.equal(usage.token_input, 90000);
    assert.equal(usage.token_output, 1400);
  });

  it("odmítne video bez analýzy", async () => {
    const database = setup(false);
    const result = await generateDeepSummary(database, VIDEO_ID, { apiKey: "k" });
    assert.equal(result.ok === false ? result.code : "", "NO_ANALYSIS");
  });

  it("odmítne volání bez klíče", async () => {
    const database = setup();
    const result = await generateDeepSummary(database, VIDEO_ID, { apiKey: null });
    assert.equal(result.ok === false ? result.code : "", "NO_API_KEY");
  });

  it("krátká odpověď se neuloží jako shrnutí", async () => {
    const database = setup();
    const result = await generateDeepSummary(database, VIDEO_ID, {
      apiKey: "k",
      fetchImpl: completedFetch("Krátké."),
    });
    assert.equal(result.ok === false ? result.code : "", "EMPTY_OUTPUT");
    const row = database.prepare(`SELECT summary_deep_cs FROM analyses WHERE video_id = ?`).get(VIDEO_ID) as {
      summary_deep_cs: string | null;
    };
    assert.equal(row.summary_deep_cs, null);
  });

  it("počká na dokončení přes GET", async () => {
    const database = setup();
    let calls = 0;
    const fetchImpl = (async (_url: string, init?: RequestInit) => {
      calls += 1;
      const running = init?.method === "GET" && calls < 3;
      const body = running
        ? { id: "int_deep", status: "in_progress" }
        : {
            id: "int_deep",
            status: "completed",
            steps: [{ type: "model_output", content: [{ type: "text", text: LONG_TEXT }] }],
          };
      return new Response(JSON.stringify(body), { status: 200, headers: { "content-type": "application/json" } });
    }) as unknown as typeof fetch;

    const result = await generateDeepSummary(database, VIDEO_ID, {
      apiKey: "k",
      fetchImpl,
      pollAttempts: 4,
      pollDelayMs: 0,
      sleep: async () => {},
    });
    assert.equal(result.ok, true);
  });

  it("HTTP 503 vrátí chybu a nic neuloží", async () => {
    const database = setup();
    const failing = (async () =>
      new Response(JSON.stringify({ error: { message: "overloaded" } }), {
        status: 503,
        headers: { "content-type": "application/json" },
      })) as unknown as typeof fetch;

    const result = await generateDeepSummary(database, VIDEO_ID, { apiKey: "k", fetchImpl: failing });
    assert.equal(result.ok === false ? result.code : "", "GEMINI_ERROR");
    const row = database.prepare(`SELECT summary_deep_cs FROM analyses WHERE video_id = ?`).get(VIDEO_ID) as {
      summary_deep_cs: string | null;
    };
    assert.equal(row.summary_deep_cs, null);
  });
});
