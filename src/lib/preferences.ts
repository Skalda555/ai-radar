import type { Db } from "./db/client";
import { nowIso } from "./shared/time";
import { dbGet, dbRun } from "./types";

export const PREFERENCE_KEYS = [
  "analysis_daily_limit",
  "auto_analysis_enabled",
  "sync_interval_hours",
  "default_analysis_mode",
  "interest_profile",
] as const;

export type PreferenceKey = (typeof PREFERENCE_KEYS)[number];

export const DEFAULT_INTEREST_PROFILE = [
  "Codex",
  "Claude Code",
  "Vibe coding",
  "Skills a MCP",
  "Vlastní webové aplikace",
  "Automatizace",
  "AI agenti",
  "Open-source vývojářské nástroje",
];

export const DEFAULT_PREFERENCES: Record<PreferenceKey, string> = {
  analysis_daily_limit: "10",
  auto_analysis_enabled: "false",
  sync_interval_hours: "0",
  default_analysis_mode: "AGENTIC",
  interest_profile: JSON.stringify(DEFAULT_INTEREST_PROFILE),
};

export type Preferences = {
  analysisDailyLimit: number;
  autoAnalysisEnabled: boolean;
  syncIntervalHours: number;
  defaultAnalysisMode: "STATIC" | "AGENTIC";
  interestProfile: string[];
};

function readRaw(db: Db): Record<string, string> {
  const rows = db.prepare(`SELECT key, value FROM preferences`).all() as unknown as {
    key: string;
    value: string;
  }[];
  const map: Record<string, string> = {};
  for (const row of rows) map[row.key] = row.value;
  return map;
}

export function getPreferences(db: Db): Preferences {
  const raw = readRaw(db);
  const limit = Number.parseInt(raw.analysis_daily_limit ?? DEFAULT_PREFERENCES.analysis_daily_limit, 10);
  const interval = Number.parseInt(raw.sync_interval_hours ?? DEFAULT_PREFERENCES.sync_interval_hours, 10);
  const mode = raw.default_analysis_mode === "STATIC" ? "STATIC" : "AGENTIC";

  let profile: string[] = DEFAULT_INTEREST_PROFILE;
  if (raw.interest_profile) {
    try {
      const parsed = JSON.parse(raw.interest_profile) as unknown;
      if (Array.isArray(parsed) && parsed.every((item) => typeof item === "string")) {
        profile = parsed as string[];
      }
    } catch {
      profile = DEFAULT_INTEREST_PROFILE;
    }
  }

  return {
    analysisDailyLimit: Number.isFinite(limit) ? Math.max(0, Math.min(200, limit)) : 10,
    autoAnalysisEnabled: raw.auto_analysis_enabled === "true",
    syncIntervalHours: Number.isFinite(interval) ? Math.max(0, Math.min(168, interval)) : 0,
    defaultAnalysisMode: mode,
    interestProfile: profile,
  };
}

export function setPreference(db: Db, key: PreferenceKey, value: string): void {
  dbRun(
    db,
    `INSERT INTO preferences (key, value, updated_at) VALUES (?, ?, ?)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,
    key,
    value,
    nowIso(),
  );
}

export function updatePreferences(db: Db, patch: Partial<Preferences>): Preferences {
  if (patch.analysisDailyLimit !== undefined) {
    setPreference(db, "analysis_daily_limit", String(Math.max(0, Math.min(200, patch.analysisDailyLimit))));
  }
  if (patch.autoAnalysisEnabled !== undefined) {
    setPreference(db, "auto_analysis_enabled", patch.autoAnalysisEnabled ? "true" : "false");
  }
  if (patch.syncIntervalHours !== undefined) {
    setPreference(db, "sync_interval_hours", String(Math.max(0, Math.min(168, patch.syncIntervalHours))));
  }
  if (patch.defaultAnalysisMode !== undefined) {
    setPreference(db, "default_analysis_mode", patch.defaultAnalysisMode);
  }
  if (patch.interestProfile !== undefined) {
    const clean = patch.interestProfile.map((item) => item.trim()).filter(Boolean).slice(0, 30);
    setPreference(db, "interest_profile", JSON.stringify(clean));
  }
  return getPreferences(db);
}

export function getPreferenceValue(db: Db, key: string): string | undefined {
  return dbGet<{ value: string }>(db, `SELECT value FROM preferences WHERE key = ?`, key)?.value;
}
