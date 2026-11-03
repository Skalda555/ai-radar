import { randomUUID } from "node:crypto";
import type { Db } from "../db/client";
import { nowIso } from "../shared/time";
import { getConfig } from "../config";
import { dbGet, dbRun, type JobRow } from "../types";
import { recordUsage, countAnalysesToday } from "../usage";
import { getPreferences } from "../preferences";
import { createInteraction, getInteraction, interactionText, type InteractionResponse } from "../gemini/client";
import { GEMINI_JSON_SCHEMA, PROMPT_VERSION, parseAnalysisOutput } from "../gemini/schema";
import { buildPrompt } from "../gemini/prompt";
import { saveAnalysis } from "../analysis/store";

export const ACTIVE_JOB_STATUSES = ["PENDING", "SUBMITTED", "IN_PROGRESS"] as const;
export const TERMINAL_JOB_STATUSES = [
  "COMPLETED",
  "FAILED",
  "UNKNOWN",
  "INSUFFICIENT_CONTENT",
  "CANCELLED",
] as const;

const VIDEO_SELECT = `
  SELECT v.video_id, v.title, v.description, v.url, v.published_at, v.channel_id,
         c.title AS channel_title
    FROM videos v JOIN channels c ON c.channel_id = v.channel_id
   WHERE v.video_id = ?
`;

export type StartAnalysisOptions = {
  confirmed: boolean;
  mode?: "STATIC" | "AGENTIC";
  model?: string;
  allowReanalyze?: boolean;
  fetchImpl?: typeof fetch;
  apiKey?: string | null;
  now?: () => string;
};

export type StartAnalysisResult =
  | { ok: true; job: JobRow; analysisStatus: string | null; message: string }
  | { ok: false; code: string; message: string; job?: JobRow; status?: number };

export function getJob(db: Db, jobId: string): JobRow | undefined {
  return dbGet<JobRow>(db, `SELECT * FROM analysis_jobs WHERE id = ?`, jobId);
}

export function getActiveJob(db: Db, videoId: string): JobRow | undefined {
  return dbGet<JobRow>(
    db,
    `SELECT * FROM analysis_jobs WHERE video_id = ? AND status IN ('PENDING','SUBMITTED','IN_PROGRESS') ORDER BY id DESC LIMIT 1`,
    videoId,
  );
}

export function getLatestJob(db: Db, videoId: string): JobRow | undefined {
  return dbGet<JobRow>(
    db,
    `SELECT * FROM analysis_jobs WHERE video_id = ? ORDER BY created_at DESC LIMIT 1`,
    videoId,
  );
}

export async function startAnalysis(
  db: Db,
  videoId: string,
  options: StartAnalysisOptions,
): Promise<StartAnalysisResult> {
  const now = options.now ?? nowIso;

  const video = dbGet<{
    video_id: string;
    title: string;
    description: string | null;
    url: string;
    published_at: string;
    channel_title: string;
  }>(db, VIDEO_SELECT, videoId);

  if (!video) {
    return { ok: false, code: "NOT_FOUND", status: 404, message: "Video není v databázi." };
  }

  if (!options.confirmed) {
    return {
      ok: false,
      code: "CONFIRMATION_REQUIRED",
      status: 400,
      message:
        "Analýza se nespustí bez výslovného potvrzení modelu, videa a možného čerpání API kvóty.",
    };
  }

  const config = getConfig();
  const apiKey = options.apiKey ?? config.geminiApiKey;
  if (!apiKey) {
    return {
      ok: false,
      code: "NO_API_KEY",
      status: 409,
      message: "Chybí GEMINI_API_KEY v .env.local. Analýzu nelze odeslat.",
    };
  }

  const model = options.model?.trim() || config.geminiModel;
  const mode = options.mode ?? getPreferences(db).defaultAnalysisMode;

  const existingAnalysis = dbGet<{ id: number; updated_at: string }>(
    db,
    `SELECT id, updated_at FROM analyses WHERE video_id = ?`,
    videoId,
  );
  if (existingAnalysis && !options.allowReanalyze) {
    return {
      ok: false,
      code: "ANALYSIS_EXISTS",
      status: 409,
      message: "Analýza už existuje. Opakované spuštění je samostatná akce s dalším čerpáním API.",
    };
  }

  const active = getActiveJob(db, videoId);
  if (active) {
    return {
      ok: false,
      code: "ALREADY_RUNNING",
      status: 409,
      message: "Pro toto video už běží analytická úloha. Druhý POST se neposílá.",
      job: active,
    };
  }

  const previousUnknown = dbGet<JobRow>(
    db,
    `SELECT * FROM analysis_jobs WHERE video_id = ? AND status = 'UNKNOWN' ORDER BY created_at DESC LIMIT 1`,
    videoId,
  );
  if (previousUnknown && !options.allowReanalyze) {
    return {
      ok: false,
      code: "UNKNOWN_PREVIOUS",
      status: 409,
      message:
        "Poslední pokus skončil stavem UNKNOWN – nevíme, zda Google úlohu přijal. Opakování je možné jen jako vědomá akce s rizikem další spotřeby API.",
      job: previousUnknown,
    };
  }

  const limit = getPreferences(db).analysisDailyLimit;
  const usedToday = countAnalysesToday(db);
  if (limit > 0 && usedToday >= limit) {
    return {
      ok: false,
      code: "LIMIT_REACHED",
      status: 429,
      message: `Denní limit ${limit} nových analýz je vyčerpaný (dnes ${usedToday}). Limit změníš v Nastavení.`,
    };
  }

  const jobId = randomUUID();
  const background = mode === "AGENTIC";
  const startedAt = now();

  dbRun(
    db,
    `INSERT INTO analysis_jobs (id, video_id, model, mode, status, background, created_at, updated_at)
     VALUES (?, ?, ?, ?, 'PENDING', ?, ?, ?)`,
    jobId,
    videoId,
    model,
    mode,
    background ? 1 : 0,
    startedAt,
    startedAt,
  );

  dbRun(
    db,
    `UPDATE analysis_jobs SET request_started_at = ?, updated_at = ? WHERE id = ?`,
    startedAt,
    startedAt,
    jobId,
  );

  const prompt = buildPrompt(
    {
      videoId: video.video_id,
      title: video.title,
      channelTitle: video.channel_title,
      publishedAt: video.published_at,
      description: video.description ?? "",
      url: video.url,
    },
    { profile: getPreferences(db).interestProfile, mode },
  );

  const created = await createInteraction({
    apiKey,
    model,
    prompt,
    videoUrl: video.url,
    jsonSchema: GEMINI_JSON_SCHEMA,
    background,
    fetchImpl: options.fetchImpl,
  });

  const finishedAt = now();

  if (!created.ok) {
    const unknown = created.kind === "TIMEOUT" || created.kind === "NETWORK" || created.kind === "PARSE";
    const status = unknown ? "UNKNOWN" : "FAILED";
    dbRun(
      db,
      `UPDATE analysis_jobs SET status = ?, request_finished_at = ?, http_status = ?,
         error_code = ?, error_message = ?, updated_at = ? WHERE id = ?`,
      status,
      finishedAt,
      created.httpStatus ?? null,
      created.kind,
      created.message.slice(0, 800),
      finishedAt,
      jobId,
    );
    recordUsage(db, {
      provider: "gemini",
      operation: "interactions.create",
      model,
      videoId,
      jobId,
      requestCount: 1,
      httpStatus: created.httpStatus ?? null,
    });
    const job = getJob(db, jobId);
    return {
      ok: false,
      code: unknown ? "SEND_UNKNOWN" : "GEMINI_ERROR",
      status: 502,
      message: created.message,
      ...(job ? { job } : {}),
    };
  }

  const interaction = created.interaction;
  recordUsage(db, {
    provider: "gemini",
    operation: "interactions.create",
    model,
    videoId,
    jobId,
    interactionId: interaction.id,
    requestCount: 1,
    tokenInput: interaction.usage?.total_input_tokens ?? null,
    tokenOutput: interaction.usage?.total_output_tokens ?? null,
    httpStatus: created.httpStatus,
  });

  dbRun(
    db,
    `UPDATE analysis_jobs SET interaction_id = ?, interaction_status = ?,
       request_finished_at = ?, last_checked_at = ?, http_status = ?, updated_at = ?
     WHERE id = ?`,
    interaction.id,
    interaction.status,
    finishedAt,
    finishedAt,
    created.httpStatus,
    finishedAt,
    jobId,
  );

  if (interaction.status === "completed" && interaction.output_text) {
    const finalized = finalizeJob(db, jobId, interaction, created.raw, now);
    return {
      ok: true,
      job: finalized.job,
      analysisStatus: finalized.analysisStatus,
      message: "Analýza byla dokončena v jednom požadavku.",
    };
  }

  if (interaction.status === "failed" || interaction.status === "cancelled") {
    dbRun(
      db,
      `UPDATE analysis_jobs SET status = 'FAILED', error_code = ?, error_message = ?, updated_at = ?
       WHERE id = ?`,
      interaction.status.toUpperCase(),
      interaction.error?.message ?? "Interakce skončila chybou.",
      finishedAt,
      jobId,
    );
    return {
      ok: false,
      code: "GEMINI_FAILED",
      status: 502,
      message: interaction.error?.message ?? "Gemini úloha selhala.",
      ...(getJob(db, jobId) ? { job: getJob(db, jobId) as JobRow } : {}),
    };
  }

  const job = getJob(db, jobId) as JobRow;
  dbRun(
    db,
    `UPDATE analysis_jobs SET status = 'SUBMITTED', updated_at = ? WHERE id = ?`,
    finishedAt,
    jobId,
  );

  return {
    ok: true,
    job: getJob(db, jobId) ?? job,
    analysisStatus: null,
    message: `Úloha odeslána (Interaction ID ${interaction.id}). Výsledek se načte přes GET, bez nového placeného požadavku.`,
  };
}

function finalizeJob(
  db: Db,
  jobId: string,
  interaction: InteractionResponse,
  raw: string,
  now: () => string,
): { job: JobRow; analysisStatus: string | null } {
  const job = getJob(db, jobId);
  if (!job) throw new Error(`Úloha ${jobId} neexistuje.`);

  const timestamp = now();
  const outputText = interactionText(interaction);
  const tokenInput = interaction.usage?.total_input_tokens ?? null;
  const tokenOutput = interaction.usage?.total_output_tokens ?? null;

  // Usage is real even when the answer cannot be used, so it is stored before
  // any validation branch can return.
  const persistUsage = () => {
    dbRun(
      db,
      `UPDATE analysis_jobs SET token_input = COALESCE(?, token_input),
         token_output = COALESCE(?, token_output), interaction_status = ?, updated_at = ?
       WHERE id = ?`,
      tokenInput,
      tokenOutput,
      interaction.status,
      timestamp,
      jobId,
    );
    dbRun(
      db,
      `UPDATE api_usage SET token_input = COALESCE(?, token_input),
         token_output = COALESCE(?, token_output),
         token_total = COALESCE(?, token_total)
       WHERE job_id = ? AND operation = 'interactions.create'`,
      tokenInput,
      tokenOutput,
      tokenInput !== null || tokenOutput !== null ? (tokenInput ?? 0) + (tokenOutput ?? 0) : null,
      jobId,
    );
  };

  const storeFailedRun = () => {
    dbRun(
      db,
      `INSERT INTO analysis_runs (video_id, job_id, model, prompt_version, raw_output, parse_ok, is_demo, created_at)
       VALUES (?, ?, ?, ?, ?, 0, ?, ?)`,
      job.video_id,
      jobId,
      job.model,
      PROMPT_VERSION,
      raw.slice(0, 200_000),
      job.is_demo,
      timestamp,
    );
  };

  if (outputText.trim().length === 0) {
    persistUsage();
    storeFailedRun();
    dbRun(
      db,
      `UPDATE analysis_jobs SET status = 'FAILED', error_code = 'EMPTY_OUTPUT',
         error_message = ?, last_checked_at = ?, completed_at = ?, updated_at = ? WHERE id = ?`,
      "Gemini dokončil interakci, ale nevrátil žádný text (prázdný model_output). Surová odpověď je uložená.",
      timestamp,
      timestamp,
      timestamp,
      jobId,
    );
    return { job: getJob(db, jobId) as JobRow, analysisStatus: null };
  }

  const parsed = parseAnalysisOutput(outputText);

  if (!parsed.ok) {
    persistUsage();
    storeFailedRun();
    dbRun(
      db,
      `UPDATE analysis_jobs SET status = 'FAILED', error_code = 'SCHEMA_INVALID',
         error_message = ?, last_checked_at = ?, completed_at = ?, updated_at = ? WHERE id = ?`,
      `${parsed.error} ${parsed.issues.slice(0, 5).join("; ")}`.slice(0, 900),
      timestamp,
      timestamp,
      timestamp,
      jobId,
    );
    return { job: getJob(db, jobId) as JobRow, analysisStatus: null };
  }

  persistUsage();

  const saved = saveAnalysis(db, {
    videoId: job.video_id,
    jobId,
    model: job.model,
    promptVersion: PROMPT_VERSION,
    mode: job.mode,
    output: parsed.data,
    rawOutput: raw,
    tokenInput,
    tokenOutput,
    isDemo: Boolean(job.is_demo),
    now,
  });

  dbRun(
    db,
    `UPDATE analysis_jobs SET status = ?, error_code = NULL, error_message = NULL,
       interaction_status = ?, token_input = ?, token_output = ?,
       last_checked_at = ?, completed_at = ?, updated_at = ? WHERE id = ?`,
    saved.status === "INSUFFICIENT_CONTENT" ? "INSUFFICIENT_CONTENT" : "COMPLETED",
    interaction.status,
    tokenInput,
    tokenOutput,
    timestamp,
    timestamp,
    timestamp,
    jobId,
  );

  return { job: getJob(db, jobId) as JobRow, analysisStatus: saved.status };
}

export type PollResult = {
  ok: boolean;
  job: JobRow | null;
  message: string;
  changed: boolean;
};

export async function pollJob(
  db: Db,
  jobId: string,
  options: { fetchImpl?: typeof fetch; apiKey?: string | null; now?: () => string } = {},
): Promise<PollResult> {
  const now = options.now ?? nowIso;
  const job = getJob(db, jobId);
  if (!job) return { ok: false, job: null, message: "Úloha neexistuje.", changed: false };

  const terminal = (TERMINAL_JOB_STATUSES as readonly string[]).includes(job.status);
  // UNKNOWN with a stored Interaction ID is still resumable: the spec requires
  // continuing a known task through its ID. Only an UNKNOWN without ID is final.
  const resumableUnknown = job.status === "UNKNOWN" && Boolean(job.interaction_id);
  if (terminal && !resumableUnknown) {
    return { ok: true, job, message: "Úloha je už v koncovém stavu.", changed: false };
  }

  if (!job.interaction_id) {
    dbRun(
      db,
      `UPDATE analysis_jobs SET status = 'UNKNOWN', error_code = 'NO_INTERACTION_ID',
         error_message = ?, last_checked_at = ?, updated_at = ? WHERE id = ?`,
      "Lokální úloha nemá Interaction ID – nelze zjistit, zda Google požadavek přijal.",
      now(),
      now(),
      jobId,
    );
    return {
      ok: false,
      job: getJob(db, jobId) ?? null,
      message: "Úloha nemá Interaction ID. Stav je UNKNOWN, nový požadavek se neposílá.",
      changed: true,
    };
  }

  const config = getConfig();
  const apiKey = options.apiKey ?? config.geminiApiKey;
  if (!apiKey) {
    return { ok: false, job, message: "Chybí GEMINI_API_KEY pro zjištění stavu.", changed: false };
  }

  const response = await getInteraction({
    apiKey,
    interactionId: job.interaction_id,
    fetchImpl: options.fetchImpl,
  });

  const timestamp = now();

  if (!response.ok) {
    if (response.httpStatus === 404) {
      dbRun(
        db,
        `UPDATE analysis_jobs SET status = 'UNKNOWN', error_code = 'INTERACTION_GONE',
           error_message = ?, last_checked_at = ?, updated_at = ? WHERE id = ?`,
        response.message,
        timestamp,
        timestamp,
        jobId,
      );
      return {
        ok: false,
        job: getJob(db, jobId) ?? null,
        message: response.message,
        changed: true,
      };
    }

    dbRun(
      db,
      `UPDATE analysis_jobs SET last_checked_at = ?, error_code = ?, error_message = ?, updated_at = ?
       WHERE id = ?`,
      timestamp,
      response.kind,
      response.message.slice(0, 800),
      timestamp,
      jobId,
    );
    return {
      ok: false,
      job: getJob(db, jobId) ?? null,
      message: response.message,
      changed: false,
    };
  }

  recordUsage(db, {
    provider: "gemini",
    operation: "interactions.get",
    model: job.model,
    videoId: job.video_id,
    jobId,
    interactionId: job.interaction_id,
    requestCount: 1,
    httpStatus: response.httpStatus,
  });

  const interaction = response.interaction;

  if (interaction.status === "completed") {
    const finalized = finalizeJob(db, jobId, interaction, response.raw, now);
    return {
      ok: true,
      job: finalized.job,
      message:
        finalized.analysisStatus === "INSUFFICIENT_CONTENT"
          ? "Analýza dokončena, ale video nemá dost obsahu."
          : "Analýza je hotová a uložená.",
      changed: true,
    };
  }

  if (interaction.status === "failed" || interaction.status === "cancelled") {
    dbRun(
      db,
      `UPDATE analysis_jobs SET status = 'FAILED', interaction_status = ?,
         error_code = ?, error_message = ?, last_checked_at = ?, completed_at = ?, updated_at = ?
       WHERE id = ?`,
      interaction.status,
      interaction.status.toUpperCase(),
      interaction.error?.message?.slice(0, 800) ?? "Interakce skončila chybou.",
      timestamp,
      timestamp,
      timestamp,
      jobId,
    );
    return {
      ok: false,
      job: getJob(db, jobId) ?? null,
      message: interaction.error?.message ?? "Gemini úloha selhala.",
      changed: true,
    };
  }

  dbRun(
    db,
    `UPDATE analysis_jobs SET status = 'IN_PROGRESS', interaction_status = ?,
       last_checked_at = ?, updated_at = ? WHERE id = ?`,
    interaction.status,
    timestamp,
    timestamp,
    jobId,
  );

  return {
    ok: true,
    job: getJob(db, jobId) ?? null,
    message:
      interaction.status === "requires_action"
        ? "Interakce čeká na doplnění vstupu od klienta."
        : "Google video stále zpracovává.",
    changed: true,
  };
}

export async function resumePendingJobs(
  db: Db,
  options: { fetchImpl?: typeof fetch; now?: () => string; apiKey?: string | null } = {},
): Promise<{ polled: number; completed: number; failed: number }> {
  const jobs = db
    .prepare(
      `SELECT id FROM analysis_jobs WHERE status IN ('SUBMITTED','IN_PROGRESS') ORDER BY updated_at ASC LIMIT 10`,
    )
    .all() as unknown as { id: string }[];

  let completed = 0;
  let failed = 0;
  for (const job of jobs) {
    const result = await pollJob(db, job.id, options);
    if (result.job?.status === "COMPLETED" || result.job?.status === "INSUFFICIENT_CONTENT") {
      completed += 1;
    } else if (result.job?.status === "FAILED") {
      failed += 1;
    }
  }

  return { polled: jobs.length, completed, failed };
}

export type JobListRow = JobRow & {
  video_title: string;
  channel_title: string;
  video_is_demo: number;
};
