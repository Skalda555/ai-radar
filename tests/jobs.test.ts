import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { afterEach, describe, it } from "node:test";
import type { Db } from "../src/lib/db/client";
import { getJob, pollJob, startAnalysis } from "../src/lib/jobs/service";
import { parseAnalysisOutput } from "../src/lib/gemini/schema";
import { interactionText } from "../src/lib/gemini/client";
import { recoverJobFromStoredRun } from "../src/lib/jobs/recover";
import { CHANNEL_ID, countingFetch, jsonFetch, openTestDb, seedChannel, seedVideo } from "./helpers";

const validJson = readFileSync(path.join(process.cwd(), "tests", "fixtures", "analysis-valid.json"), "utf8");
const VIDEO_ID = "aaaaaaaaaaa";

let db: Db | null = null;

function setup(): Db {
  db = openTestDb();
  seedChannel(db, { channelId: CHANNEL_ID, title: "Testovací kanál" });
  seedVideo(db, { videoId: VIDEO_ID });
  return db;
}

afterEach(() => {
  db?.close();
  db = null;
});

const created = { id: "int_123", status: "in_progress" };
const completed = { id: "int_123", status: "completed", output_text: validJson, usage: { total_input_tokens: 900, total_output_tokens: 1200, total_tokens: 2100 } };
const inProgress = { id: "int_123", status: "in_progress" };

describe("parseAnalysisOutput", () => {
  it("přijme platný fixture a odmítne neplatné schéma", () => {
    const ok = parseAnalysisOutput(validJson);
    assert.equal(ok.ok, true);
    const bad = parseAnalysisOutput('{"title_cs": "chybí zbytek"}');
    assert.equal(bad.ok, false);
    assert.ok(bad.ok === false && bad.issues.length > 0);
  });

  it("sněde markdown code fence", () => {
    const fenced = "```json\n" + validJson + "\n```";
    assert.equal(parseAnalysisOutput(fenced).ok, true);
  });
});

describe("startAnalysis", () => {
  it("odmítne spuštění bez výslovného potvrzení", async () => {
    const database = setup();
    const { fetchImpl, calls } = countingFetch(() => ({ body: created }));
    const result = await startAnalysis(database, VIDEO_ID, {
      confirmed: false,
      apiKey: "test-key",
      fetchImpl,
    });
    assert.equal(result.ok, false);
    assert.equal(result.ok === false ? result.code : "", "CONFIRMATION_REQUIRED");
    assert.equal(calls.length, 0, "bez potvrzení se nesmí odeslat žádný požadavek");
  });

  it("odmítne spuštění bez API klíče", async () => {
    const database = setup();
    const result = await startAnalysis(database, VIDEO_ID, { confirmed: true, apiKey: null });
    assert.equal(result.ok === false ? result.code : "", "NO_API_KEY");
    assert.equal(
      (database.prepare(`SELECT COUNT(*) AS c FROM analysis_jobs`).get() as { c: number }).c,
      0,
    );
  });

  it("odešle právě jeden POST s pozadím, store a JSON schématem", async () => {
    const database = setup();
    const { fetchImpl, calls } = countingFetch(() => ({ body: created }));

    const result = await startAnalysis(database, VIDEO_ID, {
      confirmed: true,
      apiKey: "test-key",
      mode: "AGENTIC",
      fetchImpl,
    });

    assert.equal(result.ok, true);
    assert.equal(calls.length, 1);
    const init = calls[0].init as RequestInit;
    const headers = init.headers as Record<string, string>;
    assert.equal(headers["x-goog-api-key"], "test-key");
    assert.ok(headers["Api-Revision"]);
    const body = JSON.parse(String(init.body)) as {
      model: string;
      background: boolean;
      store: boolean;
      response_format: { mime_type: string; schema: unknown };
      input: { type: string; uri?: string }[];
    };
    assert.equal(body.background, true);
    assert.equal(body.store, true);
    assert.equal(body.response_format.mime_type, "application/json");
    assert.ok(body.response_format.schema);
    assert.ok(body.input.some((part) => part.type === "video" && part.uri?.includes(VIDEO_ID)));

    const job = getJob(database, (result as { job: { id: string } }).job.id);
    assert.equal(job?.status, "SUBMITTED");
    assert.equal(job?.interaction_id, "int_123");
  });

  it("druhý pokus nevytvoří druhý POST", async () => {
    const database = setup();
    const { fetchImpl, calls } = countingFetch(() => ({ body: created }));
    await startAnalysis(database, VIDEO_ID, { confirmed: true, apiKey: "k", fetchImpl });
    const second = await startAnalysis(database, VIDEO_ID, { confirmed: true, apiKey: "k", fetchImpl });

    assert.equal(second.ok === false ? second.code : "", "ALREADY_RUNNING");
    assert.equal(calls.length, 1);
  });

  it("při timeoutu označí UNKNOWN, nezopakuje a vyžádá vědomé opakování", async () => {
    const database = setup();
    let calls = 0;
    const fetchImpl = (async () => {
      calls += 1;
      const error = new Error("timeout");
      error.name = "TimeoutError";
      throw error;
    }) as typeof fetch;

    const result = await startAnalysis(database, VIDEO_ID, { confirmed: true, apiKey: "k", fetchImpl });
    assert.equal(result.ok, false);
    assert.equal(result.ok === false ? result.code : "", "SEND_UNKNOWN");

    const job = database.prepare(`SELECT * FROM analysis_jobs`).get() as { status: string; interaction_id: string | null };
    assert.equal(job.status, "UNKNOWN");
    assert.equal(job.interaction_id, null);

    const retry = await startAnalysis(database, VIDEO_ID, { confirmed: true, apiKey: "k", fetchImpl });
    assert.equal(retry.ok === false ? retry.code : "", "UNKNOWN_PREVIOUS");
    assert.equal(calls, 1, "automatické opakování je zakázané");

    const forced = await startAnalysis(database, VIDEO_ID, {
      confirmed: true,
      apiKey: "k",
      fetchImpl,
      allowReanalyze: true,
    });
    assert.equal(forced.ok, false);
    assert.equal(calls, 2, "vědomé opakování pošle nový požadavek");
  });

  it("HTTP 503 uloží FAILED s diagnostikou", async () => {
    const database = setup();
    const result = await startAnalysis(database, VIDEO_ID, {
      confirmed: true,
      apiKey: "k",
      fetchImpl: jsonFetch({ error: { message: "overloaded" } }, 503),
    });
    assert.equal(result.ok, false);
    const job = database.prepare(`SELECT * FROM analysis_jobs`).get() as {
      status: string;
      http_status: number;
      error_code: string;
    };
    assert.equal(job.status, "FAILED");
    assert.equal(job.http_status, 503);
    assert.equal(job.error_code, "HTTP");
  });

  it("respektuje denní limit analýz", async () => {
    const database = setup();
    const now = new Date().toISOString();
    for (let i = 0; i < 10; i += 1) {
      database
        .prepare(
          `INSERT INTO api_usage (provider, operation, model, request_count, cost_status, created_at)
           VALUES ('gemini','interactions.create','m',1,'NOT_VERIFIED',?)`,
        )
        .run(now);
    }
    const result = await startAnalysis(database, VIDEO_ID, {
      confirmed: true,
      apiKey: "k",
      fetchImpl: jsonFetch(created),
    });
    assert.equal(result.ok === false ? result.code : "", "LIMIT_REACHED");
  });
});

describe("pollJob", () => {
  async function submit(database: Db): Promise<string> {
    const result = await startAnalysis(database, VIDEO_ID, {
      confirmed: true,
      apiKey: "k",
      mode: "AGENTIC",
      fetchImpl: jsonFetch(created),
    });
    assert.equal(result.ok, true);
    return (result as { job: { id: string } }).job.id;
  }

  it("přechod in_progress → COMPLETED uloží analýzu, položky a FTS", async () => {
    const database = setup();
    const jobId = await submit(database);

    const progress = await pollJob(database, jobId, { apiKey: "k", fetchImpl: jsonFetch(inProgress) });
    assert.equal(progress.job?.status, "IN_PROGRESS");

    const done = await pollJob(database, jobId, { apiKey: "k", fetchImpl: jsonFetch(completed) });
    assert.equal(done.job?.status, "COMPLETED");
    assert.equal(done.job?.token_input, 900);

    const analysis = database.prepare(`SELECT * FROM analyses WHERE video_id = ?`).get(VIDEO_ID) as {
      status: string;
      relevance_score: number;
      title_cs: string;
      model: string;
      prompt_version: string;
    };
    assert.equal(analysis.status, "COMPLETED");
    assert.equal(analysis.relevance_score, 92);
    assert.equal(analysis.title_cs, "Codex Skills v praxi: vlastní MCP workflow");

    const items = database.prepare(`SELECT * FROM analysis_items WHERE video_id = ?`).all(VIDEO_ID) as unknown as {
      kind: string;
      verification_status: string;
      timestamp_url: string | null;
    }[];
    assert.ok(items.length >= 8);
    assert.ok(items.every((item) => item.verification_status === "AI_EXTRACTED"));
    const withTime = items.find((item) => item.timestamp_url);
    assert.match(withTime?.timestamp_url ?? "", /^https:\/\/www\.youtube\.com\/watch\?v=aaaaaaaaaaa&t=\d+s$/);

    const fts = database.prepare(`SELECT COUNT(*) AS c FROM knowledge_fts`).get() as { c: number };
    assert.ok(fts.c > 0);

    const video = database.prepare(`SELECT analysis_relevance FROM videos WHERE video_id = ?`).get(VIDEO_ID) as {
      analysis_relevance: number;
    };
    assert.equal(video.analysis_relevance, 92);

    const usage = database
      .prepare(`SELECT operation, COUNT(*) AS c FROM api_usage GROUP BY operation`)
      .all() as unknown as { operation: string; c: number }[];
    assert.ok(usage.some((row) => row.operation === "interactions.get"));
  });

  it("neplatné schéma uloží FAILED a zachová surový výstup", async () => {
    const database = setup();
    const jobId = await submit(database);
    const broken = { id: "int_123", status: "completed", output_text: '{"title_cs":"jen kus"}' };
    const result = await pollJob(database, jobId, { apiKey: "k", fetchImpl: jsonFetch(broken) });

    assert.equal(result.job?.status, "FAILED");
    assert.equal(result.job?.error_code, "SCHEMA_INVALID");
    const run = database.prepare(`SELECT * FROM analysis_runs`).get() as { parse_ok: number; raw_output: string };
    assert.equal(run.parse_ok, 0);
    assert.match(run.raw_output, /title_cs/);
    assert.equal(
      (database.prepare(`SELECT COUNT(*) AS c FROM analyses`).get() as { c: number }).c,
      0,
    );
  });

  it("expirace interakce (404) → UNKNOWN, ne FAILED", async () => {
    const database = setup();
    const jobId = await submit(database);
    const result = await pollJob(database, jobId, { apiKey: "k", fetchImpl: jsonFetch({}, 404) });
    assert.equal(result.job?.status, "UNKNOWN");
    assert.equal(result.job?.error_code, "INTERACTION_GONE");
  });

  it("selhání sítě při dotazu nemění stav úlohy", async () => {
    const database = setup();
    const jobId = await submit(database);
    const failing = (async () => {
      throw new Error("network down");
    }) as typeof fetch;
    const result = await pollJob(database, jobId, { apiKey: "k", fetchImpl: failing });
    assert.equal(result.job?.status, "SUBMITTED");
    assert.ok(result.job?.last_checked_at);
  });

  it("obnoví úlohu po restartu pouze z databáze", async () => {
    const database = setup();
    const jobId = await submit(database);

    // Simulate a restart: only DB state survives, no in-memory job.
    const reloaded = getJob(database, jobId);
    assert.equal(reloaded?.status, "SUBMITTED");

    const result = await pollJob(database, jobId, { apiKey: "k", fetchImpl: jsonFetch(completed) });
    assert.equal(result.job?.status, "COMPLETED");
    assert.equal(
      (database.prepare(`SELECT COUNT(*) AS c FROM analyses`).get() as { c: number }).c,
      1,
    );
  });

  it("INSUFFICIENT_CONTENT nic nevymýšlí", async () => {
    const database = setup();
    const jobId = await submit(database);
    const insufficient = JSON.parse(validJson) as Record<string, unknown>;
    insufficient.insufficient_content = true;
    insufficient.insufficiency_reason_cs = "Video je jen upoutávka bez obsahu.";
    const payload = { id: "int_123", status: "completed", output_text: JSON.stringify(insufficient) };

    const result = await pollJob(database, jobId, { apiKey: "k", fetchImpl: jsonFetch(payload) });
    assert.equal(result.job?.status, "INSUFFICIENT_CONTENT");
    const analysis = database.prepare(`SELECT status FROM analyses`).get() as { status: string };
    assert.equal(analysis.status, "INSUFFICIENT_CONTENT");
    assert.equal(
      (database.prepare(`SELECT COUNT(*) AS c FROM analysis_items`).get() as { c: number }).c,
      0,
    );
  });

  it("existující analýza blokuje nový POST bez vědomého opakování", async () => {
    const database = setup();
    await submit(database);
    const done = await pollJob(database, getJob(database, "x")?.id ?? "", { apiKey: "k" });
    assert.equal(done.ok, false);

    const job = database.prepare(`SELECT id FROM analysis_jobs LIMIT 1`).get() as { id: string };
    await pollJob(database, job.id, { apiKey: "k", fetchImpl: jsonFetch(completed) });

    const again = await startAnalysis(database, VIDEO_ID, {
      confirmed: true,
      apiKey: "k",
      fetchImpl: jsonFetch(created),
    });
    assert.equal(again.ok === false ? again.code : "", "ANALYSIS_EXISTS");
  });
});

describe("resume of UNKNOWN jobs", () => {
  it("UNKNOWN s Interaction ID lze bezpečně dočíst přes GET", async () => {
    const database = setup();
    const now = new Date().toISOString();
    database
      .prepare(
        `INSERT INTO analysis_jobs (id, video_id, model, mode, status, background, interaction_id,
           request_started_at, attempts, is_demo, created_at, updated_at)
         VALUES ('job-unknown-1', ?, 'gemini-3.5-flash-lite', 'AGENTIC', 'UNKNOWN', 1, 'int_123', ?, 1, 0, ?, ?)`,
      )
      .run(VIDEO_ID, now, now, now);

    const result = await pollJob(database, "job-unknown-1", {
      apiKey: "k",
      fetchImpl: jsonFetch(completed),
    });

    assert.equal(result.job?.status, "COMPLETED");
    assert.equal(
      (database.prepare(`SELECT COUNT(*) AS c FROM analyses`).get() as { c: number }).c,
      1,
    );
  });

  it("UNKNOWN bez Interaction ID zůstává koncový a neposílá GET", async () => {
    const database = setup();
    const now = new Date().toISOString();
    database
      .prepare(
        `INSERT INTO analysis_jobs (id, video_id, model, mode, status, background, interaction_id,
           request_started_at, attempts, is_demo, created_at, updated_at)
         VALUES ('job-unknown-2', ?, 'm', 'AGENTIC', 'UNKNOWN', 1, NULL, ?, 1, 0, ?, ?)`,
      )
      .run(VIDEO_ID, now, now, now);

    const { fetchImpl, calls } = countingFetch(() => ({ body: completed }));
    const result = await pollJob(database, "job-unknown-2", { apiKey: "k", fetchImpl });
    assert.equal(result.job?.status, "UNKNOWN");
    assert.equal(calls.length, 0, "bez ID se nesmí volat API");
  });
});

describe("extrakce textu z reálné odpovědi Interactions API", () => {
  const stepsShape = {
    id: "int_123",
    status: "completed",
    usage: { total_input_tokens: 81365, total_output_tokens: 1224, total_tokens: 82589 },
    steps: [
      { type: "user_input", content: [{ type: "text", text: "prompt" }, { type: "video", uri: "https://youtu.be/x" }] },
      { type: "thought", signature: "abc" },
      { type: "model_output", content: [{ type: "text", text: validJson }] },
    ],
  };

  it("interactionText přečte text ze steps (REST neposílá output_text)", () => {
    assert.equal(interactionText({ id: "x", status: "completed", steps: [{ type: "model_output", content: [{ type: "text", text: "ahoj" }] }] }), "ahoj");
    assert.equal(interactionText({ id: "x", status: "completed", output_text: "primarni", steps: [{ type: "model_output", content: [{ type: "text", text: "vedlejsi" }] }] }), "primarni");
    assert.equal(interactionText({ id: "x", status: "completed", steps: [{ type: "thought", signature: "s" }] }), "");
    assert.equal(interactionText({ id: "x", status: "completed", outputs: [{ type: "model_output", content: [{ type: "text", text: "z outputs" }] }] }), "z outputs");
  });

  it("pollJob uloží analýzu i ze steps tvaru a eviduje tokeny", async () => {
    const database = setup();
    const started = await startAnalysis(database, VIDEO_ID, {
      confirmed: true, apiKey: "k", mode: "AGENTIC", fetchImpl: jsonFetch(created),
    });
    const jobId = (started as { job: { id: string } }).job.id;

    const result = await pollJob(database, jobId, { apiKey: "k", fetchImpl: jsonFetch(stepsShape) });
    assert.equal(result.job?.status, "COMPLETED");
    assert.equal(result.job?.token_input, 81365);
    assert.equal(result.job?.token_output, 1224);

    const analysis = database.prepare(`SELECT title_cs, relevance_score FROM analyses WHERE video_id = ?`).get(VIDEO_ID) as { title_cs: string; relevance_score: number };
    assert.match(analysis.title_cs, /Codex Skills/);
    assert.equal(analysis.relevance_score, 92);

    const usage = database.prepare(`SELECT token_input, token_output, token_total FROM api_usage WHERE job_id = ? AND operation = 'interactions.create'`).get(jobId) as { token_input: number; token_output: number; token_total: number };
    assert.equal(usage.token_input, 81365);
    assert.equal(usage.token_total, 82589);
  });

  it("prázdný model_output → EMPTY_OUTPUT, tokeny i surová odpověď se uloží", async () => {
    const database = setup();
    const started = await startAnalysis(database, VIDEO_ID, {
      confirmed: true, apiKey: "k", mode: "AGENTIC", fetchImpl: jsonFetch(created),
    });
    const jobId = (started as { job: { id: string } }).job.id;
    const empty = { id: "int_123", status: "completed", usage: { total_input_tokens: 10, total_output_tokens: 0 }, steps: [{ type: "thought", signature: "x" }] };

    const result = await pollJob(database, jobId, { apiKey: "k", fetchImpl: jsonFetch(empty) });
    assert.equal(result.job?.status, "FAILED");
    assert.equal(result.job?.error_code, "EMPTY_OUTPUT");
    assert.equal(result.job?.token_input, 10);
    const run = database.prepare(`SELECT parse_ok FROM analysis_runs`).get() as { parse_ok: number };
    assert.equal(run.parse_ok, 0);
  });
});

describe("obnova z uložené odpovědi", () => {
  async function failedJobWithRun(database: Db, raw: string): Promise<string> {
    const started = await startAnalysis(database, VIDEO_ID, {
      confirmed: true, apiKey: "k", mode: "AGENTIC", fetchImpl: jsonFetch(created),
    });
    const jobId = (started as { job: { id: string } }).job.id;
    const now = new Date().toISOString();
    database.prepare(`INSERT INTO analysis_runs (video_id, job_id, model, prompt_version, raw_output, parse_ok, is_demo, created_at)
                      VALUES (?, ?, 'gemini-3.5-flash-lite', '2026-11-v1', ?, 0, 0, ?)`).run(VIDEO_ID, jobId, raw, now);
    database.prepare(`UPDATE analysis_jobs SET status = 'FAILED', error_code = 'EMPTY_OUTPUT' WHERE id = ?`).run(jobId);
    return jobId;
  }

  it("ze steps tvaru obnoví analýzu bez nového API požadavku", async () => {
    const database = setup();
    const raw = JSON.stringify({
      id: "int_123", status: "completed",
      usage: { total_input_tokens: 81365, total_output_tokens: 1224 },
      steps: [{ type: "thought", signature: "x" }, { type: "model_output", content: [{ type: "text", text: validJson }] }],
    });
    const jobId = await failedJobWithRun(database, raw);
    const before = (database.prepare(`SELECT COUNT(*) AS c FROM api_usage`).get() as { c: number }).c;

    const result = recoverJobFromStoredRun(database, jobId);
    assert.equal(result.ok, true);
    assert.equal(result.ok === true ? result.job.status : "", "COMPLETED");
    const analysis = database.prepare(`SELECT title_cs, relevance_score FROM analyses`).get() as { title_cs: string; relevance_score: number };
    assert.match(analysis.title_cs, /Codex Skills/);
    assert.equal(analysis.relevance_score, 92);

    const after = (database.prepare(`SELECT COUNT(*) AS c FROM api_usage`).get() as { c: number }).c;
    assert.equal(after, before, "obnova nesmí zapsat nový API požadavek");
    const job = database.prepare(`SELECT token_input FROM analysis_jobs WHERE id = ?`).get(jobId) as { token_input: number };
    assert.equal(job.token_input, 81365);
  });

  it("bez uložené odpovědi vrátí NO_STORED_OUTPUT", async () => {
    const database = setup();
    const started = await startAnalysis(database, VIDEO_ID, {
      confirmed: true, apiKey: "k", fetchImpl: jsonFetch(created),
    });
    const jobId = (started as { job: { id: string } }).job.id;
    const result = recoverJobFromStoredRun(database, jobId);
    assert.equal(result.ok === false ? result.code : "", "NO_STORED_OUTPUT");
  });

  it("neplatný JSON v uložené odpovědi vrátí UNREADABLE_OUTPUT", async () => {
    const database = setup();
    const jobId = await failedJobWithRun(database, "{neplatny json");
    const result = recoverJobFromStoredRun(database, jobId);
    assert.equal(result.ok === false ? result.code : "", "UNREADABLE_OUTPUT");
  });

  it("už dokončenou úlohu neobnovuje", async () => {
    const database = setup();
    const jobId = await failedJobWithRun(database, JSON.stringify({
      id: "int_123", status: "completed",
      steps: [{ type: "model_output", content: [{ type: "text", text: validJson }] }],
    }));
    assert.equal(recoverJobFromStoredRun(database, jobId).ok, true);
    const second = recoverJobFromStoredRun(database, jobId);
    assert.equal(second.ok === false ? second.code : "", "ALREADY_DONE");
  });
});
