import type { Db } from "./db/client";

export type ChannelRow = {
  id: number;
  channel_id: string;
  handle: string | null;
  url: string | null;
  title: string;
  description: string | null;
  thumbnail_url: string | null;
  category: string | null;
  priority: number;
  language: string | null;
  relevance_score: number | null;
  is_active: number;
  is_demo: number;
  source: string;
  last_synced_at: string | null;
  last_sync_status: string | null;
  last_sync_error: string | null;
  last_sync_new_videos: number | null;
  created_at: string;
  updated_at: string;
};

export type VideoRow = {
  id: number;
  video_id: string;
  channel_id: string;
  title: string;
  title_cs_google: string | null;
  title_cs_google_source: string | null;
  description: string | null;
  published_at: string;
  source_updated_at: string | null;
  thumbnail_url: string | null;
  url: string;
  duration_seconds: number | null;
  source: string;
  is_demo: number;
  topics: string | null;
  knowledge_hidden_at: string | null;
  search_text: string;
  prelim_relevance: number | null;
  prelim_relevance_detail: string | null;
  analysis_relevance: number | null;
  first_seen_at: string;
  last_seen_at: string;
  created_at: string;
  updated_at: string;
};

export type AnalysisRow = {
  id: number;
  video_id: string;
  job_id: string | null;
  model: string;
  prompt_version: string;
  mode: string;
  status: string;
  schema_version: number;
  title_original: string | null;
  title_cs: string | null;
  summary_short_cs: string | null;
  summary_long_cs: string | null;
  summary_deep_cs: string | null;
  deep_generated_at: string | null;
  main_topic: string | null;
  category: string | null;
  constraints_cs: string | null;
  relevance_score: number | null;
  relevance_explanation_cs: string | null;
  interpretation_cs: string | null;
  tools_json: string | null;
  raw_output: string | null;
  normalized_json: string | null;
  token_input: number | null;
  token_output: number | null;
  is_demo: number;
  search_text: string;
  created_at: string;
  updated_at: string;
};

export type AnalysisItemRow = {
  id: number;
  analysis_id: number;
  video_id: string;
  kind: string;
  ordinal: number;
  group_key: string | null;
  text_cs: string;
  detail_cs: string | null;
  timestamp_seconds: number | null;
  timestamp_url: string | null;
  evidence_quote: string | null;
  evidence_kind: string | null;
  confidence: string | null;
  verification_status: string;
  user_note: string | null;
  user_verdict_at: string | null;
  tool_name: string | null;
  tool_url: string | null;
  prompt_kind: string | null;
  prompt_text: string | null;
  extra_json: string | null;
  curated_at: string | null;
  is_demo: number;
  created_at: string;
};

export type JobRow = {
  id: string;
  video_id: string;
  model: string;
  mode: string;
  status: string;
  background: number;
  interaction_id: string | null;
  interaction_status: string | null;
  request_started_at: string | null;
  request_finished_at: string | null;
  last_checked_at: string | null;
  completed_at: string | null;
  http_status: number | null;
  error_code: string | null;
  error_message: string | null;
  attempts: number;
  token_input: number | null;
  token_output: number | null;
  is_demo: number;
  created_at: string;
  updated_at: string;
};

export type SyncRunRow = {
  id: number;
  trigger: string;
  channel_id: string | null;
  channel_row_id: number | null;
  started_at: string;
  finished_at: string | null;
  status: string;
  videos_found: number;
  videos_new: number;
  videos_updated: number;
  error: string | null;
};

export type SavedVideoRow = {
  video_id: string;
  note: string | null;
  created_at: string;
};

export type UsageRow = {
  id: number;
  provider: string;
  operation: string;
  model: string | null;
  video_id: string | null;
  job_id: string | null;
  interaction_id: string | null;
  request_count: number;
  token_input: number | null;
  token_output: number | null;
  token_total: number | null;
  cost_status: string;
  http_status: number | null;
  created_at: string;
};

export type ChannelStats = ChannelRow & {
  video_count: number;
  saved_count: number;
  analyzed_count: number;
};

export type VideoListRow = VideoRow & {
  channel_title: string;
  channel_category: string | null;
  analysis_status: string;
  is_saved: number;
  analysis_id: number | null;
  analysis_title_cs: string | null;
  analysis_score: number | null;
  job_status: string | null;
  job_id: string | null;
  job_error: string | null;
};

export function asRows<T>(rows: unknown[]): T[] {
  return rows as T[];
}

export function asRow<T>(row: unknown): T | undefined {
  return row as T | undefined;
}

/** node:sqlite returns null-prototype objects; React client props need plain ones. */
export function plainRow<T>(row: unknown): T {
  return { ...(row as Record<string, unknown>) } as T;
}

export function plainRows<T>(rows: unknown[]): T[] {
  return rows.map((row) => ({ ...(row as Record<string, unknown>) }) as T);
}

export function dbAll<T>(db: Db, sql: string, ...params: (string | number | null)[]): T[] {
  return db.prepare(sql).all(...params) as unknown as T[];
}

export function dbGet<T>(db: Db, sql: string, ...params: (string | number | null)[]): T | undefined {
  return db.prepare(sql).get(...params) as unknown as T | undefined;
}

export function dbRun(
  db: Db,
  sql: string,
  ...params: (string | number | null)[]
): { changes: number; lastInsertRowid: number } {
  const result = db.prepare(sql).run(...params);
  return {
    changes: Number(result.changes),
    lastInsertRowid: Number(result.lastInsertRowid),
  };
}
