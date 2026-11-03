/**
 * Database schema, versioned as forward-only migrations.
 * Statements are plain SQL so they can also be inspected with any SQLite tool.
 */

export type Migration = {
  version: number;
  name: string;
  sql: string;
};

export const MIGRATIONS: Migration[] = [
  {
    version: 1,
    name: "initial schema",
    sql: `
CREATE TABLE channels (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  channel_id TEXT NOT NULL UNIQUE,
  handle TEXT,
  url TEXT,
  title TEXT NOT NULL,
  description TEXT,
  thumbnail_url TEXT,
  category TEXT,
  priority INTEGER NOT NULL DEFAULT 3,
  language TEXT,
  relevance_score REAL,
  is_active INTEGER NOT NULL DEFAULT 1,
  is_demo INTEGER NOT NULL DEFAULT 0,
  source TEXT NOT NULL DEFAULT 'manual',
  last_synced_at TEXT,
  last_sync_status TEXT,
  last_sync_error TEXT,
  last_sync_new_videos INTEGER,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE videos (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  video_id TEXT NOT NULL UNIQUE,
  channel_id TEXT NOT NULL REFERENCES channels(channel_id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT,
  published_at TEXT NOT NULL,
  source_updated_at TEXT,
  thumbnail_url TEXT,
  url TEXT NOT NULL,
  duration_seconds INTEGER,
  source TEXT NOT NULL DEFAULT 'rss',
  is_demo INTEGER NOT NULL DEFAULT 0,
  topics TEXT,
  search_text TEXT NOT NULL DEFAULT '',
  prelim_relevance REAL,
  prelim_relevance_detail TEXT,
  analysis_relevance REAL,
  first_seen_at TEXT NOT NULL,
  last_seen_at TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX idx_videos_channel ON videos(channel_id);
CREATE INDEX idx_videos_published ON videos(published_at DESC);
CREATE INDEX idx_videos_prelim ON videos(prelim_relevance DESC);

CREATE TABLE analyses (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  video_id TEXT NOT NULL UNIQUE REFERENCES videos(video_id) ON DELETE CASCADE,
  job_id TEXT,
  model TEXT NOT NULL,
  prompt_version TEXT NOT NULL,
  mode TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'COMPLETED',
  schema_version INTEGER NOT NULL DEFAULT 1,
  title_original TEXT,
  title_cs TEXT,
  summary_short_cs TEXT,
  summary_long_cs TEXT,
  main_topic TEXT,
  category TEXT,
  constraints_cs TEXT,
  relevance_score REAL,
  relevance_explanation_cs TEXT,
  interpretation_cs TEXT,
  tools_json TEXT,
  raw_output TEXT,
  normalized_json TEXT,
  token_input INTEGER,
  token_output INTEGER,
  is_demo INTEGER NOT NULL DEFAULT 0,
  search_text TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE analysis_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  analysis_id INTEGER NOT NULL REFERENCES analyses(id) ON DELETE CASCADE,
  video_id TEXT NOT NULL,
  kind TEXT NOT NULL,
  ordinal INTEGER NOT NULL DEFAULT 0,
  group_key TEXT,
  text_cs TEXT NOT NULL,
  detail_cs TEXT,
  timestamp_seconds INTEGER,
  timestamp_url TEXT,
  evidence_quote TEXT,
  evidence_kind TEXT,
  confidence TEXT,
  verification_status TEXT NOT NULL DEFAULT 'AI_EXTRACTED',
  user_note TEXT,
  user_verdict_at TEXT,
  tool_name TEXT,
  tool_url TEXT,
  prompt_kind TEXT,
  prompt_text TEXT,
  extra_json TEXT,
  is_demo INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL
);
CREATE INDEX idx_items_analysis ON analysis_items(analysis_id);
CREATE INDEX idx_items_video ON analysis_items(video_id);
CREATE INDEX idx_items_kind ON analysis_items(kind);
CREATE INDEX idx_items_verification ON analysis_items(verification_status);

CREATE TABLE analysis_jobs (
  id TEXT PRIMARY KEY,
  video_id TEXT NOT NULL REFERENCES videos(video_id) ON DELETE CASCADE,
  model TEXT NOT NULL,
  mode TEXT NOT NULL,
  status TEXT NOT NULL,
  background INTEGER NOT NULL DEFAULT 1,
  interaction_id TEXT,
  interaction_status TEXT,
  request_started_at TEXT,
  request_finished_at TEXT,
  last_checked_at TEXT,
  completed_at TEXT,
  http_status INTEGER,
  error_code TEXT,
  error_message TEXT,
  attempts INTEGER NOT NULL DEFAULT 1,
  token_input INTEGER,
  token_output INTEGER,
  is_demo INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX idx_jobs_video ON analysis_jobs(video_id);
CREATE INDEX idx_jobs_status ON analysis_jobs(status);
CREATE UNIQUE INDEX ux_jobs_active ON analysis_jobs(video_id)
  WHERE status IN ('PENDING', 'SUBMITTED', 'IN_PROGRESS');

CREATE TABLE analysis_runs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  video_id TEXT NOT NULL,
  job_id TEXT,
  model TEXT NOT NULL,
  prompt_version TEXT NOT NULL,
  raw_output TEXT,
  parse_ok INTEGER NOT NULL DEFAULT 0,
  is_demo INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL
);
CREATE INDEX idx_runs_video ON analysis_runs(video_id);

CREATE TABLE sync_runs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  trigger TEXT NOT NULL,
  channel_id TEXT,
  channel_row_id INTEGER,
  started_at TEXT NOT NULL,
  finished_at TEXT,
  status TEXT NOT NULL,
  videos_found INTEGER NOT NULL DEFAULT 0,
  videos_new INTEGER NOT NULL DEFAULT 0,
  videos_updated INTEGER NOT NULL DEFAULT 0,
  error TEXT
);
CREATE INDEX idx_sync_started ON sync_runs(started_at DESC);

CREATE TABLE saved_videos (
  video_id TEXT PRIMARY KEY REFERENCES videos(video_id) ON DELETE CASCADE,
  note TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE preferences (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE api_usage (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  provider TEXT NOT NULL,
  operation TEXT NOT NULL,
  model TEXT,
  video_id TEXT,
  job_id TEXT,
  interaction_id TEXT,
  request_count INTEGER NOT NULL DEFAULT 1,
  token_input INTEGER,
  token_output INTEGER,
  token_total INTEGER,
  cost_status TEXT NOT NULL DEFAULT 'NOT_VERIFIED',
  http_status INTEGER,
  created_at TEXT NOT NULL
);
CREATE INDEX idx_usage_created ON api_usage(created_at DESC);

CREATE VIRTUAL TABLE knowledge_fts USING fts5(
  text_cs,
  detail_cs,
  tool_name,
  video_title,
  channel_title,
  tokenize = 'unicode61 remove_diacritics 2'
);
`,
  },
  {
    version: 2,
    name: "analysis questions",
    sql: `
CREATE TABLE analysis_questions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  analysis_id INTEGER NOT NULL REFERENCES analyses(id) ON DELETE CASCADE,
  video_id TEXT NOT NULL,
  question TEXT NOT NULL,
  answer_text TEXT,
  status TEXT NOT NULL DEFAULT 'PENDING',
  interaction_id TEXT,
  model TEXT NOT NULL,
  prompt_version TEXT NOT NULL,
  token_input INTEGER,
  token_output INTEGER,
  error_code TEXT,
  error_message TEXT,
  is_demo INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  answered_at TEXT
);
CREATE INDEX idx_questions_analysis ON analysis_questions(analysis_id);
CREATE INDEX idx_questions_video ON analysis_questions(video_id);
`,
  },
  {
    version: 3,
    name: "deeper summary",
    sql: `
ALTER TABLE analyses ADD COLUMN summary_deep_cs TEXT;
ALTER TABLE analyses ADD COLUMN deep_generated_at TEXT;
`,
  },
  {
    version: 4,
    name: "knowledge visibility and curation",
    sql: `
ALTER TABLE videos ADD COLUMN knowledge_hidden_at TEXT;
ALTER TABLE analysis_items ADD COLUMN curated_at TEXT;
CREATE INDEX idx_items_curated ON analysis_items(curated_at);
`,
  },
  {
    version: 5,
    name: "google title translation",
    sql: `
ALTER TABLE videos ADD COLUMN title_cs_google TEXT;
ALTER TABLE videos ADD COLUMN title_cs_google_source TEXT;
`,
  },
];
