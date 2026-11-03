import { statSync } from "node:fs";
import path from "node:path";
import { appliedVersions, closeDb, getDb, getDbPath, integrityCheck, tableCounts } from "../src/lib/db/client";

const db = getDb();
const dbPath = getDbPath();
const integrity = integrityCheck(db);

console.log(`Databáze:     ${path.resolve(dbPath)}`);
console.log(`Velikost:     ${statSync(dbPath).size} B`);
console.log(`Migrace:      ${appliedVersions(db).join(", ") || "(žádné)"}`);
console.log(`Integrita:    ${integrity}`);
console.log(`Foreign keys: ${(db.prepare("PRAGMA foreign_keys").get() as { foreign_keys: number }).foreign_keys === 1 ? "ON" : "OFF"}`);

const fts = db
  .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'knowledge_fts'")
  .get();
console.log(`FTS5 tabulka: ${fts ? "přítomna" : "CHYBÍ"}`);

console.log("Počty řádků:");
for (const [table, count] of Object.entries(tableCounts(db))) {
  console.log(`  ${table.padEnd(16)} ${count}`);
}

const fkErrors = db.prepare("PRAGMA foreign_key_check").all();
console.log(`FK chyby:     ${fkErrors.length}`);

closeDb();

if (integrity !== "ok" || fkErrors.length > 0) {
  process.exitCode = 1;
}
