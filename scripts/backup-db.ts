/** Creates a verified snapshot of the live database (VACUUM INTO + integrity check). */
import { closeDb, getDb, getDbPath } from "../src/lib/db/client";
import { backupDatabase, listBackups } from "../src/lib/db/backup";

const db = getDb();
const source = getDbPath();
const target = backupDatabase(db, source, "manual");
console.log(`Záloha vytvořena: ${target}`);
console.log("Kopie prošla kontrolou integrity (PRAGMA integrity_check = ok).");
closeDb();

const backups = listBackups(source);
console.log(`Záloh celkem: ${backups.length}`);
for (const backup of backups.slice(0, 5)) {
  console.log(`  ${backup.name}  ${(backup.size / 1024).toFixed(1)} kB`);
}
