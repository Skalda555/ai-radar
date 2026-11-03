import type { Db } from "../db/client";
import { nowIso } from "../shared/time";
import { getConfig } from "../config";
import { dbAll, dbGet, dbRun, plainRows, type AnalysisRow } from "../types";
import { createInteraction, getInteraction, interactionText } from "../gemini/client";
import { recordUsage } from "../usage";
import { buildQuestionPrompt, QUESTION_PROMPT_VERSION } from "./prompt";

export type QuestionRow = {
  id: number;
  analysis_id: number;
  video_id: string;
  question: string;
  answer_text: string | null;
  status: string;
  interaction_id: string | null;
  model: string;
  prompt_version: string;
  token_input: number | null;
  token_output: number | null;
  error_code: string | null;
  error_message: string | null;
  is_demo: number;
  created_at: string;
  answered_at: string | null;
};

export function listQuestions(db: Db, videoId: string): QuestionRow[] {
  return plainRows<QuestionRow>(
    dbAll<QuestionRow>(
      db,
      `SELECT * FROM analysis_questions WHERE video_id = ? ORDER BY created_at ASC, id ASC`,
      videoId,
    ),
  );
}

function videoRow(db: Db, videoId: string) {
  return dbGet<{
    video_id: string;
    title: string;
    url: string;
    published_at: string;
    description: string | null;
    channel_title: string;
  }>(
    db,
    `SELECT v.video_id, v.title, v.url, v.published_at, v.description, c.title AS channel_title
       FROM videos v JOIN channels c ON c.channel_id = v.channel_id
      WHERE v.video_id = ?`,
    videoId,
  );
}

export type AskOptions = {
  apiKey?: string | null;
  model?: string;
  fetchImpl?: typeof fetch;
  now?: () => string;
  pollAttempts?: number;
  pollDelayMs?: number;
  sleep?: (ms: number) => Promise<void>;
};

export type AskResult =
  | { ok: true; row: QuestionRow; message: string }
  | { ok: false; code: string; message: string; status: number; row?: QuestionRow };

const defaultSleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/**
 * One deliberate, user-triggered question per call. The video is sent by URL,
 * the answer is stored next to the analysis, and nothing is retried blindly.
 */
export async function askQuestion(
  db: Db,
  videoId: string,
  rawQuestion: string,
  options: AskOptions = {},
): Promise<AskResult> {
  const now = options.now ?? nowIso;
  const question = rawQuestion.trim();
  if (question.length < 3) {
    return { ok: false, code: "QUESTION_TOO_SHORT", message: "Napiš prosím konkrétní dotaz.", status: 400 };
  }
  if (question.length > 1000) {
    return {
      ok: false,
      code: "QUESTION_TOO_LONG",
      message: "Dotaz je delší než 1 000 znaků.",
      status: 400,
    };
  }

  const analysis = dbGet<AnalysisRow>(db, `SELECT * FROM analyses WHERE video_id = ?`, videoId);
  if (!analysis) {
    return {
      ok: false,
      code: "NO_ANALYSIS",
      message: "Nejdřív musí existovat analýza videa, ke které se dotaz ukládá.",
      status: 409,
    };
  }

  const video = videoRow(db, videoId);
  if (!video) {
    return { ok: false, code: "NOT_FOUND", message: "Video není v databázi.", status: 404 };
  }

  const config = getConfig();
  const apiKey = options.apiKey ?? config.geminiApiKey;
  if (!apiKey) {
    return {
      ok: false,
      code: "NO_API_KEY",
      message: "Chybí GEMINI_API_KEY. Dotaz nelze odeslat.",
      status: 409,
    };
  }

  const model = options.model?.trim() || config.geminiModel;
  const timestamp = now();

  const keyPoints = dbAll<{ text_cs: string }>(
    db,
    `SELECT text_cs FROM analysis_items WHERE analysis_id = ? AND kind = 'KEY_POINT' ORDER BY ordinal LIMIT 15`,
    analysis.id,
  ).map((item) => item.text_cs);

  const prompt = buildQuestionPrompt({
    videoTitle: video.title,
    channelTitle: video.channel_title,
    publishedAt: video.published_at,
    summaryShort: analysis.summary_short_cs ?? "",
    summaryLong: analysis.summary_long_cs ?? "",
    keyPoints,
    question,
  });

  const questionId = dbRun(
    db,
    `INSERT INTO analysis_questions (analysis_id, video_id, question, status, model, prompt_version, is_demo, created_at)
     VALUES (?, ?, ?, 'PENDING', ?, ?, ?, ?)`,
    analysis.id,
    videoId,
    question,
    model,
    QUESTION_PROMPT_VERSION,
    analysis.is_demo,
    timestamp,
  ).lastInsertRowid;

  const created = await createInteraction({
    apiKey,
    model,
    prompt,
    videoUrl: video.url,
    background: false,
    fetchImpl: options.fetchImpl,
    timeoutMs: 120_000,
  });

  recordUsage(db, {
    provider: "gemini",
    operation: "interactions.ask",
    model,
    videoId,
    jobId: null,
    interactionId: created.ok ? created.interaction.id : null,
    requestCount: 1,
    httpStatus: created.ok ? created.httpStatus : (created.httpStatus ?? null),
  });

  if (!created.ok) {
    dbRun(
      db,
      `UPDATE analysis_questions SET status = 'FAILED', error_code = ?, error_message = ? WHERE id = ?`,
      created.kind,
      created.message.slice(0, 800),
      questionId,
    );
    const row = dbGet<QuestionRow>(db, `SELECT * FROM analysis_questions WHERE id = ?`, questionId);
    return {
      ok: false,
      code: "GEMINI_ERROR",
      message: created.message,
      status: 502,
      ...(row ? { row: plainRows<QuestionRow>([row])[0] } : {}),
    };
  }

  dbRun(
    db,
    `UPDATE analysis_questions SET interaction_id = ? WHERE id = ?`,
    created.interaction.id,
    questionId,
  );

  if (created.interaction.status === "completed") {
    const finished = finalizeAnswer(db, questionId, created.interaction, now);
    return {
      ok: true,
      row: finished,
      message:
        finished.status === "COMPLETED"
          ? "Odpověď je uložená u analýzy."
          : "Google odpověď nedodal.",
    };
  }

  if (created.interaction.status === "failed" || created.interaction.status === "cancelled") {
    dbRun(
      db,
      `UPDATE analysis_questions SET status = 'FAILED', error_code = ?, error_message = ? WHERE id = ?`,
      created.interaction.status.toUpperCase(),
      created.interaction.error?.message ?? "Interakce skončila chybou.",
      questionId,
    );
    return {
      ok: false,
      code: "GEMINI_FAILED",
      message: created.interaction.error?.message ?? "Gemini úloha selhala.",
      status: 502,
    };
  }

  // Still running: poll a bounded number of times with GET only.
  const attempts = Math.min(30, Math.max(1, options.pollAttempts ?? 12));
  const delay = Math.max(0, options.pollDelayMs ?? 5000);
  const sleep = options.sleep ?? defaultSleep;

  for (let attempt = 0; attempt < attempts; attempt += 1) {
    await sleep(delay);
    const status = await getInteraction({
      apiKey,
      interactionId: created.interaction.id,
      fetchImpl: options.fetchImpl,
    });
    if (!status.ok) continue;

    recordUsage(db, {
      provider: "gemini",
      operation: "interactions.get",
      model,
      videoId,
      interactionId: created.interaction.id,
      requestCount: 1,
      httpStatus: status.httpStatus,
    });

    if (status.interaction.status === "completed") {
      const finished = finalizeAnswer(db, questionId, status.interaction, now);
      return { ok: true, row: finished, message: "Odpověď je uložená u analýzy." };
    }
    if (status.interaction.status === "failed" || status.interaction.status === "cancelled") {
      dbRun(
        db,
        `UPDATE analysis_questions SET status = 'FAILED', error_code = ?, error_message = ? WHERE id = ?`,
        status.interaction.status.toUpperCase(),
        status.interaction.error?.message ?? "Interakce skončila chybou.",
        questionId,
      );
      return {
        ok: false,
        code: "GEMINI_FAILED",
        message: status.interaction.error?.message ?? "Gemini úloha selhala.",
        status: 502,
      };
    }
  }

  dbRun(
    db,
    `UPDATE analysis_questions SET status = 'IN_PROGRESS', error_code = 'STILL_RUNNING',
       error_message = ? WHERE id = ?`,
    "Google odpověď ještě zpracovává. Obnov ji tlačítkem, nový požadavek se neposílá.",
    questionId,
  );
  const row = dbGet<QuestionRow>(db, `SELECT * FROM analysis_questions WHERE id = ?`, questionId);
  return {
    ok: true,
    row: row as QuestionRow,
    message: "Odpověď se ještě zpracovává. Obnov ji později.",
  };
}

export async function refreshQuestion(
  db: Db,
  questionId: number,
  options: { apiKey?: string | null; fetchImpl?: typeof fetch; now?: () => string } = {},
): Promise<AskResult> {
  const row = dbGet<QuestionRow>(db, `SELECT * FROM analysis_questions WHERE id = ?`, questionId);
  if (!row) return { ok: false, code: "NOT_FOUND", message: "Dotaz neexistuje.", status: 404 };
  if (row.status === "COMPLETED") {
    return { ok: false, code: "ALREADY_DONE", message: "Odpověď už je uložená.", status: 409 };
  }
  if (!row.interaction_id) {
    return {
      ok: false,
      code: "NO_INTERACTION",
      message: "Dotaz nemá Interaction ID, není co obnovit.",
      status: 409,
    };
  }

  const config = getConfig();
  const apiKey = options.apiKey ?? config.geminiApiKey;
  if (!apiKey) {
    return { ok: false, code: "NO_API_KEY", message: "Chybí GEMINI_API_KEY.", status: 409 };
  }

  const status = await getInteraction({
    apiKey,
    interactionId: row.interaction_id,
    fetchImpl: options.fetchImpl,
  });

  if (!status.ok) {
    return { ok: false, code: status.kind, message: status.message, status: 502 };
  }

  recordUsage(db, {
    provider: "gemini",
    operation: "interactions.get",
    model: row.model,
    videoId: row.video_id,
    interactionId: row.interaction_id,
    requestCount: 1,
    httpStatus: status.httpStatus,
  });

  if (status.interaction.status === "completed") {
    const finished = finalizeAnswer(db, questionId, status.interaction, options.now ?? nowIso);
    return { ok: true, row: finished, message: "Odpověď je uložená u analýzy." };
  }

  if (status.interaction.status === "failed" || status.interaction.status === "cancelled") {
    dbRun(
      db,
      `UPDATE analysis_questions SET status = 'FAILED', error_code = ?, error_message = ? WHERE id = ?`,
      status.interaction.status.toUpperCase(),
      status.interaction.error?.message ?? "Interakce skončila chybou.",
      questionId,
    );
    return { ok: false, code: "GEMINI_FAILED", message: "Gemini úloha selhala.", status: 502 };
  }

  return {
    ok: true,
    row: row,
    message: "Google odpověď stále zpracovává.",
  };
}

function finalizeAnswer(
  db: Db,
  questionId: number,
  interaction: { status?: string; usage?: { total_input_tokens?: number; total_output_tokens?: number } },
  now: () => string,
): QuestionRow {
  const text = interactionText(interaction as never).trim();
  const timestamp = now();
  const tokenInput = interaction.usage?.total_input_tokens ?? null;
  const tokenOutput = interaction.usage?.total_output_tokens ?? null;

  if (text.length === 0) {
    dbRun(
      db,
      `UPDATE analysis_questions SET status = 'FAILED', error_code = 'EMPTY_ANSWER',
         error_message = 'Gemini nevrátil žádný text.', answered_at = ? WHERE id = ?`,
      timestamp,
      questionId,
    );
  } else {
    dbRun(
      db,
      `UPDATE analysis_questions SET status = 'COMPLETED', answer_text = ?, error_code = NULL,
         error_message = NULL, token_input = ?, token_output = ?, answered_at = ? WHERE id = ?`,
      text,
      tokenInput,
      tokenOutput,
      timestamp,
      questionId,
    );
  }

  return dbGet<QuestionRow>(db, `SELECT * FROM analysis_questions WHERE id = ?`, questionId) as QuestionRow;
}
