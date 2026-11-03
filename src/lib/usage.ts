import type { Db } from "./db/client";
import { nowIso } from "./shared/time";
import { dbGet, dbRun, type UsageRow } from "./types";

export type UsageInput = {
  provider: "youtube" | "gemini" | "google_translate";
  operation: string;
  model?: string | null;
  videoId?: string | null;
  jobId?: string | null;
  interactionId?: string | null;
  requestCount?: number;
  tokenInput?: number | null;
  tokenOutput?: number | null;
  httpStatus?: number | null;
  costStatus?: string;
};

export function recordUsage(db: Db, input: UsageInput): void {
  const tokenInput = input.tokenInput ?? null;
  const tokenOutput = input.tokenOutput ?? null;
  const tokenTotal =
    tokenInput === null && tokenOutput === null ? null : (tokenInput ?? 0) + (tokenOutput ?? 0);

  dbRun(
    db,
    `INSERT INTO api_usage (
       provider, operation, model, video_id, job_id, interaction_id,
       request_count, token_input, token_output, token_total, cost_status, http_status, created_at
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    input.provider,
    input.operation,
    input.model ?? null,
    input.videoId ?? null,
    input.jobId ?? null,
    input.interactionId ?? null,
    Math.max(1, input.requestCount ?? 1),
    tokenInput,
    tokenOutput,
    tokenTotal,
    input.costStatus ?? "NOT_VERIFIED",
    input.httpStatus ?? null,
    nowIso(),
  );
}

export type UsageSummary = {
  totalRequests: number;
  geminiCreateRequests: number;
  geminiStatusRequests: number;
  youtubeRequests: number;
  tokenInput: number;
  tokenOutput: number;
  todayRequests: number;
  todayAnalyses: number;
  costStatus: string;
};

export function getUsageSummary(db: Db): UsageSummary {
  const totals = dbGet<{
    total: number;
    create_count: number;
    status_count: number;
    youtube_count: number;
    token_in: number;
    token_out: number;
  }>(
    db,
    `SELECT
       COALESCE(SUM(request_count), 0) AS total,
       COALESCE(SUM(CASE WHEN operation = 'interactions.create' THEN request_count ELSE 0 END), 0) AS create_count,
       COALESCE(SUM(CASE WHEN operation = 'interactions.get' THEN request_count ELSE 0 END), 0) AS status_count,
       COALESCE(SUM(CASE WHEN provider = 'youtube' THEN request_count ELSE 0 END), 0) AS youtube_count,
       COALESCE(SUM(token_input), 0) AS token_in,
       COALESCE(SUM(token_output), 0) AS token_out
     FROM api_usage`,
  );

  const today = dbGet<{ today_requests: number; today_analyses: number }>(
    db,
    `SELECT
       COALESCE(SUM(request_count), 0) AS today_requests,
       COALESCE(SUM(CASE WHEN operation = 'interactions.create' THEN request_count ELSE 0 END), 0) AS today_analyses
     FROM api_usage
     WHERE created_at >= ?`,
    startOfTodayIso(),
  );

  return {
    totalRequests: Number(totals?.total ?? 0),
    geminiCreateRequests: Number(totals?.create_count ?? 0),
    geminiStatusRequests: Number(totals?.status_count ?? 0),
    youtubeRequests: Number(totals?.youtube_count ?? 0),
    tokenInput: Number(totals?.token_in ?? 0),
    tokenOutput: Number(totals?.token_out ?? 0),
    todayRequests: Number(today?.today_requests ?? 0),
    todayAnalyses: Number(today?.today_analyses ?? 0),
    costStatus: "NOT_VERIFIED",
  };
}

export function startOfTodayIso(now = new Date()): string {
  const start = new Date(now);
  start.setHours(0, 0, 0, 0);
  return start.toISOString();
}

export function countAnalysesToday(db: Db): number {
  const row = dbGet<{ c: number }>(
    db,
    `SELECT COUNT(*) AS c FROM api_usage
      WHERE provider = 'gemini' AND operation = 'interactions.create' AND created_at >= ?`,
    startOfTodayIso(),
  );
  return Number(row?.c ?? 0);
}

export function recentUsage(db: Db, limit = 50): UsageRow[] {
  return db
    .prepare(`SELECT * FROM api_usage ORDER BY id DESC LIMIT ?`)
    .all(limit) as unknown as UsageRow[];
}
