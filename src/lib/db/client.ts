import fs from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { MIGRATIONS } from "./schema";
import { backupDatabase } from "./backup";

export type Db = DatabaseSync;

const DEFAULT_DB_PATH = path.join(process.cwd(), "data", "ai-radar.db");

let cached: { db: Db; path: string } | null = null;

export function getDbPath(): string {
  const fromEnv = process.env.AI_RADAR_DB_PATH?.trim();
  return fromEnv && fromEnv.length > 0 ? fromEnv : DEFAULT_DB_PATH;
}

export function openDatabase(filePath: string): Db {
  if (filePath !== ":memory:") {
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
  }
  const db = new DatabaseSync(filePath);
  db.exec("PRAGMA foreign_keys = ON");
  db.exec("PRAGMA busy_timeout = 5000");
  if (filePath !== ":memory:") {
    db.exec("PRAGMA journal_mode = WAL");
    db.exec("PRAGMA synchronous = NORMAL");
  }
  migrate(db, filePath);
  return db;
}

export function getDb(): Db {
  const filePath = getDbPath();
  if (cached && cached.path === filePath) {
    return cached.db;
  }
  if (cached) {
    cached.db.close();
  }
  cached = { db: openDatabase(filePath), path: filePath };
  return cached.db;
}

export function closeDb(): void {
  if (cached) {
    cached.db.close();
    cached = null;
  }
}

export function appliedVersions(db: Db): number[] {
  const exists = db
    .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'schema_migrations'")
    .get();
  if (!exists) return [];
  const rows = db.prepare("SELECT version FROM schema_migrations ORDER BY version").all() as {
    version: number;
  }[];
  return rows.map((r) => Number(r.version));
}

export function migrate(db: Db, filePath: string): void {
  const applied = appliedVersions(db);
  const pending = MIGRATIONS.filter((m) => !applied.includes(m.version));
  if (pending.length === 0) return;

  // Existing data always gets a verified snapshot before any schema change.
  if (applied.length > 0) {
    backupDatabase(db, filePath, `pre-migration-v${pending[0].version}`);
  }

  db.exec(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version INTEGER PRIMARY KEY,
      name TEXT NOT NULL,
      applied_at TEXT NOT NULL
    )
  `);

  for (const migration of pending) {
    db.exec("BEGIN IMMEDIATE");
    try {
      db.exec(migration.sql);
      db.prepare("INSERT INTO schema_migrations (version, name, applied_at) VALUES (?, ?, ?)").run(
        migration.version,
        migration.name,
        new Date().toISOString(),
      );
      db.exec("COMMIT");
    } catch (error) {
      db.exec("ROLLBACK");
      throw new Error(
        `Migrace ${migration.version} (${migration.name}) selhala: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
  }
}

export function withTransaction<T>(db: Db, fn: () => T): T {
  db.exec("BEGIN IMMEDIATE");
  try {
    const result = fn();
    db.exec("COMMIT");
    return result;
  } catch (error) {
    try {
      db.exec("ROLLBACK");
    } catch {
      // transaction already rolled back by SQLite
    }
    throw error;
  }
}

export function integrityCheck(db: Db): string {
  const row = db.prepare("PRAGMA integrity_check").get() as { integrity_check?: string } | undefined;
  return row?.integrity_check ?? "unknown";
}

export function tableCounts(db: Db): Record<string, number> {
  const tables = [
    "channels",
    "videos",
    "analyses",
    "analysis_items",
    "analysis_jobs",
    "analysis_runs",
    "analysis_questions",
    "sync_runs",
    "saved_videos",
    "preferences",
    "api_usage",
  ];
  const counts: Record<string, number> = {};
  for (const table of tables) {
    const row = db.prepare(`SELECT COUNT(*) AS c FROM ${table}`).get() as { c: number };
    counts[table] = Number(row.c);
  }
  return counts;
}
