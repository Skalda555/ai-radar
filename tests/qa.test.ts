import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { afterEach, describe, it } from "node:test";
import type { Db } from "../src/lib/db/client";
import { saveAnalysis } from "../src/lib/analysis/store";
import { parseAnalysisOutput, PROMPT_VERSION } from "../src/lib/gemini/schema";
import { askQuestion, listQuestions, refreshQuestion } from "../src/lib/qa/service";
import { CHANNEL_ID, openTestDb, seedChannel, seedVideo } from "./helpers";

const raw = readFileSync(path.join(process.cwd(), "tests", "fixtures", "analysis-valid.json"), "utf8");
const parsed = parseAnalysisOutput(raw);
if (!parsed.ok) throw new Error("fixture must parse");

const VIDEO_ID = "aaaaaaaaaaa";
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

function answerFetch(text: string, usage = { total_input_tokens: 5000, total_output_tokens: 120 }) {
  return (async () =>
    new Response(
      JSON.stringify({
        id: "int_q1",
        status: "completed",
        usage,
        steps: [
          { type: "thought", signature: "x" },
          { type: "model_output", content: [{ type: "text", text }] },
        ],
      }),
      { status: 200, headers: { "content-type": "application/json" } },
    )) as typeof fetch;
}

describe("askQuestion", () => {
  it("odmítne dotaz bez analýzy", async () => {
    const database = setup(false);
    const result = await askQuestion(database, VIDEO_ID, "Co je MCP?", { apiKey: "k" });
    assert.equal(result.ok, false);
    assert.equal(result.ok === false ? result.code : "", "NO_ANALYSIS");
    assert.equal(listQuestions(database, VIDEO_ID).length, 0);
  });

  it("odmítne příliš krátký a příliš dlouhý dotaz", async () => {
    const database = setup();
    const short = await askQuestion(database, VIDEO_ID, "?", { apiKey: "k" });
    assert.equal(short.ok === false ? short.code : "", "QUESTION_TOO_SHORT");
    const long = await askQuestion(database, VIDEO_ID, "x".repeat(1001), { apiKey: "k" });
    assert.equal(long.ok === false ? long.code : "", "QUESTION_TOO_LONG");
  });

  it("bez API klíče nic neodešle ani neuloží", async () => {
    const database = setup();
    const result = await askQuestion(database, VIDEO_ID, "Jak autor nastavil MCP?", { apiKey: null });
    assert.equal(result.ok === false ? result.code : "", "NO_API_KEY");
    assert.equal(listQuestions(database, VIDEO_ID).length, 0);
  });

  it("uloží odpověď ze steps tvaru a zapíše spotřebu", async () => {
    const database = setup();
    const result = await askQuestion(database, VIDEO_ID, "Jak autor nastavil MCP server?", {
      apiKey: "k",
      fetchImpl: answerFetch("Autor připojil MCP server a ověřil volání nástroje v logu."),
    });
    assert.equal(result.ok, true);
    const rows = listQuestions(database, VIDEO_ID);
    assert.equal(rows.length, 1);
    assert.equal(rows[0].status, "COMPLETED");
    assert.match(rows[0].answer_text ?? "", /MCP server/);
    assert.equal(rows[0].token_input, 5000);

    const usage = database
      .prepare(`SELECT COUNT(*) AS c FROM api_usage WHERE operation = 'interactions.ask'`)
      .get() as { c: number };
    assert.equal(usage.c, 1);
  });

  it("počká na dokončení přes GET, když první odpověď běží", async () => {
    const database = setup();
    let calls = 0;
    const fetchImpl = (async (_url: string, init?: RequestInit) => {
      calls += 1;
      const running = init?.method === "GET" && calls < 3;
      const body = running
        ? { id: "int_q1", status: "in_progress" }
        : {
            id: "int_q1",
            status: "completed",
            steps: [{ type: "model_output", content: [{ type: "text", text: "Odpověď po čekání." }] }],
          };
      return new Response(JSON.stringify(body), { status: 200, headers: { "content-type": "application/json" } });
    }) as unknown as typeof fetch;

    const result = await askQuestion(database, VIDEO_ID, "Jaký nástroj autor použil?", {
      apiKey: "k",
      fetchImpl,
      pollAttempts: 4,
      pollDelayMs: 0,
      sleep: async () => {},
    });
    assert.equal(result.ok, true);
    assert.equal(result.ok === true ? result.row.status : "", "COMPLETED");
    assert.match(result.ok === true ? (result.row.answer_text ?? "") : "", /Odpověď po čekání/);
  });

  it("nedokončený dotaz nechá ve stavu IN_PROGRESS a jde obnovit", async () => {
    const database = setup();
    const running = (async () =>
      new Response(JSON.stringify({ id: "int_q1", status: "in_progress" }), {
        status: 200,
        headers: { "content-type": "application/json" },
      })) as unknown as typeof fetch;

    const first = await askQuestion(database, VIDEO_ID, "Co bylo v deváté minutě?", {
      apiKey: "k",
      fetchImpl: running,
      pollAttempts: 2,
      pollDelayMs: 0,
      sleep: async () => {},
    });
    assert.equal(first.ok, true);
    assert.equal(first.ok === true ? first.row.status : "", "IN_PROGRESS");

    const refreshed = await refreshQuestion(database, (first as { row: { id: number } }).row.id, {
      apiKey: "k",
      fetchImpl: answerFetch("V deváté minutě autor spustil test."),
    });
    assert.equal(refreshed.ok, true);
    assert.equal(refreshed.ok === true ? refreshed.row.status : "", "COMPLETED");
    assert.match(refreshed.ok === true ? (refreshed.row.answer_text ?? "") : "", /deváté minutě/);
  });

  it("HTTP chyba uloží FAILED s diagnostikou", async () => {
    const database = setup();
    const failing = (async () =>
      new Response(JSON.stringify({ error: { message: "overloaded" } }), {
        status: 503,
        headers: { "content-type": "application/json" },
      })) as unknown as typeof fetch;

    const result = await askQuestion(database, VIDEO_ID, "Jak to funguje?", { apiKey: "k", fetchImpl: failing });
    assert.equal(result.ok, false);
    const rows = listQuestions(database, VIDEO_ID);
    assert.equal(rows[0].status, "FAILED");
    assert.match(rows[0].error_message ?? "", /HTTP 503/);
  });

  it("prázdná odpověď skončí FAILED EMPTY_ANSWER", async () => {
    const database = setup();
    const empty = (async () =>
      new Response(
        JSON.stringify({ id: "int_q1", status: "completed", steps: [{ type: "thought", signature: "x" }] }),
        { status: 200, headers: { "content-type": "application/json" } },
      )) as unknown as typeof fetch;

    const result = await askQuestion(database, VIDEO_ID, "Něco k videu?", { apiKey: "k", fetchImpl: empty });
    assert.equal(result.ok, true);
    assert.equal(result.ok === true ? result.row.status : "", "FAILED");
    assert.equal(result.ok === true ? result.row.error_code : "", "EMPTY_ANSWER");
  });
});
