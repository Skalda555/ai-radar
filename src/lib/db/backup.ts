import fs from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import type { Db } from "./client";

/**
 * Consistent snapshot of the database using VACUUM INTO, then verified by
 * opening the copy and running PRAGMA integrity_check.
 */
export function backupDatabase(db: Db, sourcePath: string, reason = "manual"): string {
  if (sourcePath === ":memory:") {
    throw new Error("In-memory databázi nelze zálohovat na disk.");
  }

  const backupDir = path.join(path.dirname(sourcePath), "..", "backups");
  fs.mkdirSync(backupDir, { recursive: true });

  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const base = path.basename(sourcePath).replace(/\.db$/, "");
  const target = path.resolve(backupDir, `${base}-${stamp}-${reason}.db`);

  db.exec(`VACUUM INTO '${target.replace(/'/g, "''")}'`);

  const copy = new DatabaseSync(target, { readOnly: true });
  try {
    const row = copy.prepare("PRAGMA integrity_check").get() as { integrity_check?: string };
    if (row?.integrity_check !== "ok") {
      throw new Error(`Záloha ${target} neprošla kontrolou integrity: ${row?.integrity_check}`);
    }
  } finally {
    copy.close();
  }

  return target;
}

export function listBackups(sourcePath: string): { name: string; size: number; path: string }[] {
  const backupDir = path.resolve(path.dirname(sourcePath), "..", "backups");
  if (!fs.existsSync(backupDir)) return [];
  return fs
    .readdirSync(backupDir)
    .filter((name) => name.endsWith(".db"))
    .map((name) => {
      const full = path.join(backupDir, name);
      return { name, size: fs.statSync(full).size, path: full };
    })
    .sort((a, b) => b.name.localeCompare(a.name));
}
