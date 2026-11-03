export type AppConfig = {
  youtubeApiKey: string | null;
  geminiApiKey: string | null;
  googleTranslateApiKey: string | null;
  geminiModel: string;
  accessToken: string | null;
  allowedHosts: string[];
  dbPath: string | null;
};

const DEFAULT_GEMINI_MODEL = "gemini-3.5-flash-lite";

/** Read lazily so tests and long-running processes see current env values. */
export function getConfig(): AppConfig {
  return {
    youtubeApiKey: envValue("YOUTUBE_API_KEY"),
    geminiApiKey: envValue("GEMINI_API_KEY"),
    googleTranslateApiKey: envValue("GOOGLE_TRANSLATE_API_KEY"),
    geminiModel: envValue("GEMINI_MODEL") ?? DEFAULT_GEMINI_MODEL,
    accessToken: envValue("AI_RADAR_ACCESS_TOKEN"),
    allowedHosts: envList("AI_RADAR_ALLOWED_HOSTS"),
    dbPath: envValue("AI_RADAR_DB_PATH"),
  };
}

function envValue(name: string): string | null {
  const raw = process.env[name];
  if (typeof raw !== "string") return null;
  const trimmed = raw.trim();
  return trimmed.length > 0 ? trimmed : null;
}

/** Comma, semicolon or whitespace separated list; empty entries are dropped. */
function envList(name: string): string[] {
  const raw = process.env[name];
  if (typeof raw !== "string") return [];
  return raw
    .split(/[,;\s]+/)
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0);
}

export function hasYouTubeKey(): boolean {
  return getConfig().youtubeApiKey !== null;
}

export function hasGeminiKey(): boolean {
  return getConfig().geminiApiKey !== null;
}
