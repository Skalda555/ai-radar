/**
 * RSS synchronisation for the Windows Task Scheduler / cron / Synology.
 * Reads and writes the same SQLite database as the web app, no browser needed.
 *
 *   npm run sync
 *   npm run sync -- --channel UCxxxx
 */
import { closeDb, getDb, getDbPath } from "../src/lib/db/client";
import { countChannels } from "../src/lib/channels/service";
import { syncAllActive, syncChannel } from "../src/lib/youtube/sync";
import { translatePendingTitles } from "../src/lib/translate/titles";
import { dbGet, type ChannelRow } from "../src/lib/types";

function formatLine(label: string, value: string | number): string {
  return `  ${label.padEnd(22)} ${value}`;
}

async function main(): Promise<number> {
  const db = getDb();
  const argIndex = process.argv.indexOf("--channel");
  const only = argIndex >= 0 ? process.argv[argIndex + 1] : null;

  console.log(`AI Radar – RSS synchronizace`);
  console.log(formatLine("Databáze:", getDbPath()));
  console.log(formatLine("Start:", new Date().toISOString()));

  if (only) {
    const channel = dbGet<ChannelRow>(db, `SELECT * FROM channels WHERE channel_id = ?`, only);
    if (!channel) {
      console.error(`Kanál ${only} není v databázi.`);
      return 1;
    }
    const result = await syncChannel(db, channel, { trigger: "cli" });
    console.log(formatLine("Kanál:", `${result.title} (${result.channelId})`));
    console.log(formatLine("Stav:", result.status));
    console.log(formatLine("Nalezeno videí:", result.found));
    console.log(formatLine("Nová videa:", result.created));
    console.log(formatLine("Aktualizováno:", result.updated));
    if (result.error) console.log(formatLine("Chyba:", result.error));
    const translation = await translatePendingTitles(db, { limit: 30 }).catch(() => null);
    if (translation?.ok && translation.translated > 0) {
      console.log(formatLine("Přeloženo názvů:", translation.translated));
    } else if (translation && !translation.ok) {
      console.log(formatLine("Překlad:", translation.error ?? "neznámá chyba"));
    }
    return result.status === "OK" ? 0 : 1;
  }

  const counts = countChannels(db);
  if (counts.active === 0) {
    console.error(
      counts.total === 0
        ? "Nejsou přidány žádné kanály. Přidej je v UI na stránce Sledované kanály."
        : "Všechny kanály jsou pozastavené. Synchronizace nemá co dělat.",
    );
    return 1;
  }

  const summary = await syncAllActive(db, { trigger: "cli" });
  for (const result of summary.results) {
    const status = result.status === "OK" ? "OK  " : "FAIL";
    console.log(
      `  [${status}] ${result.title.slice(0, 40).padEnd(40)} nová: ${String(result.created).padStart(2)}  celkem: ${String(result.found).padStart(2)}${result.error ? `  chyba: ${result.error}` : ""}`,
    );
  }

  console.log(formatLine("Kanálů celkem:", summary.results.length));
  console.log(formatLine("Nových videí:", summary.totalNew));
  console.log(formatLine("Selhání:", summary.failures));
  const translation = await translatePendingTitles(db, { limit: 50 }).catch(() => null);
  if (translation?.ok) {
    console.log(formatLine("Přeloženo názvů:", translation.translated));
    console.log(formatLine("Zbývá přeložit:", translation.remaining));
  } else if (translation) {
    console.log(formatLine("Překlad:", translation.error ?? "neznámá chyba"));
  }
  console.log(formatLine("Konec:", new Date().toISOString()));

  return summary.failures > 0 ? 1 : 0;
}

main()
  .then((code) => {
    closeDb();
    process.exitCode = code;
  })
  .catch((error: unknown) => {
    console.error("Synchronizace selhala:", error instanceof Error ? error.message : error);
    closeDb();
    process.exitCode = 1;
  });
