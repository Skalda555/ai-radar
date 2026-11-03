import type { Db } from "../db/client";
import { nowIso } from "../shared/time";
import { dbGet, dbRun, type JobRow } from "../types";
import { interactionText, type InteractionResponse } from "../gemini/client";
import { PROMPT_VERSION, parseAnalysisOutput } from "../gemini/schema";
import { saveAnalysis } from "../analysis/store";
import { getJob } from "./service";

export type RecoverResult =
  | { ok: true; job: JobRow; analysisStatus: string; message: string }
  | { ok: false; code: string; message: string; status: number };

/**
 * Re-validates a stored provider response and saves the analysis without any
 * new API request. This is how an already paid result is rescued after a
 * schema or transport bug on our side.
 */
export function recoverJobFromStoredRun(
  db: Db,
  jobId: string,
  options: { now?: () => string } = {},
): RecoverResult {
  const now = options.now ?? nowIso;
  const job = getJob(db, jobId);
  if (!job) return { ok: false, code: "NOT_FOUND", message: "Úloha neexistuje.", status: 404 };

  if (job.status === "COMPLETED" || job.status === "INSUFFICIENT_CONTENT") {
    return {
      ok: false,
      code: "ALREADY_DONE",
      message: "Úloha už má uloženou analýzu.",
      status: 409,
    };
  }

  const run = dbGet<{ id: number; raw_output: string | null; model: string }>(
    db,
    `SELECT id, raw_output, model FROM analysis_runs WHERE job_id = ? ORDER BY id DESC LIMIT 1`,
    jobId,
  );
  if (!run?.raw_output) {
    return {
      ok: false,
      code: "NO_STORED_OUTPUT",
      message: "K úloze není uložená surová odpověď, není co obnovit.",
      status: 404,
    };
  }

  let response: InteractionResponse;
  try {
    response = JSON.parse(run.raw_output) as InteractionResponse;
  } catch {
    return {
      ok: false,
      code: "UNREADABLE_OUTPUT",
      message: "Uložená odpověď není platný JSON.",
      status: 409,
    };
  }

  const text = interactionText(response);
  if (text.trim().length === 0) {
    return {
      ok: false,
      code: "NO_TEXT",
      message: "Uložená odpověď neobsahuje text modelu.",
      status: 409,
    };
  }

  const parsed = parseAnalysisOutput(text);
  if (!parsed.ok) {
    return {
      ok: false,
      code: "INVALID_OUTPUT",
      message: `${parsed.error} ${parsed.issues.slice(0, 5).join("; ")}`.slice(0, 900),
      status: 422,
    };
  }

  const timestamp = now();
  const tokenInput = response.usage?.total_input_tokens ?? null;
  const tokenOutput = response.usage?.total_output_tokens ?? null;

  const saved = saveAnalysis(db, {
    videoId: job.video_id,
    jobId,
    model: job.model,
    promptVersion: PROMPT_VERSION,
    mode: job.mode,
    output: parsed.data,
    rawOutput: run.raw_output,
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
    response.status ?? null,
    tokenInput,
    tokenOutput,
    timestamp,
    timestamp,
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

  return {
    ok: true,
    job: getJob(db, jobId) as JobRow,
    analysisStatus: saved.status,
    message: "Analýza byla obnovena z uložené odpovědi. Žádný nový požadavek se neodeslal.",
  };
}
