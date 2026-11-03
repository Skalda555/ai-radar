import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import type { Db } from "../src/lib/db/client";
import { MAX_IMPORT_RECORDS, parseImportFile } from "../src/lib/import/parse";
import { buildPreview, resolveHandles, summarize } from "../src/lib/import/preview";
import { commitImport } from "../src/lib/import/commit";
import { countingFetch, openTestDb, seedChannel } from "./helpers";

const EXISTING = "UCJIfeSCssxSC_Dhc5s7woww";
const NEW_ONE = `UC${"n".repeat(22)}`;
const NEW_TWO = `UC${"m".repeat(22)}`;

let db: Db | null = null;

function setup(): Db {
  db = openTestDb();
  seedChannel(db, { channelId: EXISTING, title: "Existující", isActive: false });
  return db;
}

afterEach(() => {
  db?.close();
  db = null;
});

function count(database: Db): number {
  return Number((database.prepare(`SELECT COUNT(*) AS c FROM channels`).get() as { c: number }).c);
}

describe("parseImportFile – CSV", () => {
  it("přečte CSV s čárkou a hlavičkou", () => {
    const result = parseImportFile(
      "channels.csv",
      `channel_id,name,category,priority\n${NEW_ONE},Nový kanál,AI modely,1\n`,
    );
    assert.equal(result.ok, true);
    if (!result.ok) return;
    assert.equal(result.format, "csv");
    assert.equal(result.records.length, 1);
    assert.equal(result.records[0].channel_id, NEW_ONE);
    assert.equal(result.records[0].category, "AI modely");
  });

  it("pozná středník jako oddělovač", () => {
    const result = parseImportFile(
      "channels.csv",
      `channel_id;handle;name\n${NEW_ONE};@novy;Nový\n`,
    );
    assert.equal(result.ok, true);
    if (!result.ok) return;
    assert.equal(result.delimiter, ";");
    assert.equal(result.records[0].handle, "@novy");
  });

  it("zvládne uvozovky, escapované uvozovky a nový řádek v hodnotě", () => {
    const csv = `channel_id,description\n"${NEW_ONE}","Popis s čárkou, ""uvozovkami""\na novým řádkem"`;
    const result = parseImportFile("channels.csv", csv);
    assert.equal(result.ok, true);
    if (!result.ok) return;
    assert.match(result.records[0].description ?? "", /čárkou, "uvozovkami"/);
    assert.match(result.records[0].description ?? "", /novým řádkem/);
  });

  it("odstraní UTF-8 BOM", () => {
    const result = parseImportFile("channels.csv", `\uFEFFchannel_id,name\n${NEW_ONE},Nový\n`);
    assert.equal(result.ok, true);
    if (!result.ok) return;
    assert.equal(result.records[0].channel_id, NEW_ONE);
  });

  it("odmítne CSV bez rozpoznatelné hlavičky", () => {
    const result = parseImportFile("channels.csv", "foo,bar\n1,2\n");
    assert.equal(result.ok, false);
  });

  it("odmítne příliš mnoho záznamů", () => {
    const rows = Array.from({ length: MAX_IMPORT_RECORDS + 1 }, () => `${NEW_ONE},x`).join("\n");
    const result = parseImportFile("channels.csv", `channel_id,name\n${rows}\n`);
    assert.equal(result.ok, false);
    assert.match(result.ok === false ? result.error : "", /1000/);
  });

  it("odmítne soubor nad 1 MB", () => {
    const big = "channel_id,name\n" + "x".repeat(1_100_000);
    const result = parseImportFile("channels.csv", big);
    assert.equal(result.ok, false);
    assert.match(result.ok === false ? result.error : "", /1 MB/);
  });
});

describe("parseImportFile – JSON", () => {
  it("přečte pole objektů", () => {
    const result = parseImportFile(
      "channels.json",
      JSON.stringify([{ channel_id: NEW_ONE, name: "Nový", priority: 2 }]),
    );
    assert.equal(result.ok, true);
    if (!result.ok) return;
    assert.equal(result.format, "json");
    assert.equal(result.records[0].channel_id, NEW_ONE);
  });

  it("přečte objekt s polem channels", () => {
    const result = parseImportFile(
      "channels.json",
      JSON.stringify({ channels: [{ url: `https://www.youtube.com/channel/${NEW_ONE}` }] }),
    );
    assert.equal(result.ok, true);
    if (!result.ok) return;
    assert.equal(result.records.length, 1);
  });

  it("odmítne neplatný JSON a špatný tvar", () => {
    assert.equal(parseImportFile("channels.json", "{").ok, false);
    assert.equal(parseImportFile("channels.json", JSON.stringify({ foo: 1 })).ok, false);
  });
});

describe("buildPreview", () => {
  it("rozliší NEW, ALREADY_EXISTS, DUPLICATE_IN_FILE, INVALID a HANDLE_UNRESOLVED", () => {
    const database = setup();
    const parsed = parseImportFile(
      "channels.csv",
      [
        "channel_id,handle,url,name",
        `${NEW_ONE},, ,Nový`,
        `${EXISTING},,,Existující`,
        `${NEW_ONE},,,Duplicita`,
        ",,https://example.com/x,Špatná URL",
        ",,@ColeMedin,Handle",
        ",,,Prázdné",
        `${NEW_ONE.slice(0, 10)},,,Krátké ID`,
      ].join("\n"),
    );
    assert.equal(parsed.ok, true);
    if (!parsed.ok) return;

    const rows = buildPreview(database, parsed.records);
    const summary = summarize(rows);
    assert.equal(summary.NEW, 1);
    assert.equal(summary.ALREADY_EXISTS, 1);
    assert.equal(summary.DUPLICATE_IN_FILE, 1);
    assert.equal(summary.HANDLE_UNRESOLVED, 1);
    assert.equal(summary.INVALID, 3);
    assert.equal(summary.total, 7);
  });

  it("náhled nic nezapisuje do databáze", () => {
    const database = setup();
    const before = count(database);
    const parsed = parseImportFile("channels.csv", `channel_id,name\n${NEW_ONE},Nový\n`);
    assert.equal(parsed.ok, true);
    if (!parsed.ok) return;
    buildPreview(database, parsed.records);
    assert.equal(count(database), before);
  });

  it("normalizuje prioritu a relevanci", () => {
    const database = setup();
    const parsed = parseImportFile(
      "channels.csv",
      `channel_id,priority,relevance_score\n${NEW_ONE},9,150\n`,
    );
    assert.equal(parsed.ok, true);
    if (!parsed.ok) return;
    const rows = buildPreview(database, parsed.records);
    assert.equal(rows[0].priority, 5);
    assert.equal(rows[0].relevanceScore, 100);
  });
});

describe("resolveHandles", () => {
  it("bez API klíče vrátí vysvětlení a nic nezmění", async () => {
    const database = setup();
    const parsed = parseImportFile("channels.csv", "handle,name\n@ColeMedin,Cole\n");
    assert.equal(parsed.ok, true);
    if (!parsed.ok) return;
    const rows = buildPreview(database, parsed.records);

    const result = await resolveHandles(database, rows, { apiKey: null });
    assert.equal(result.resolved, 0);
    assert.equal(result.rows[0].status, "HANDLE_UNRESOLVED");
    assert.match(result.errors[0] ?? "", /YOUTUBE_API_KEY/);
  });

  it("převede handle přes API a respektuje limit", async () => {
    const database = setup();
    const parsed = parseImportFile(
      "channels.csv",
      `handle,name\n@novy,Nový kanál\n@druhy,Druhý kanál\n`,
    );
    assert.equal(parsed.ok, true);
    if (!parsed.ok) return;
    const rows = buildPreview(database, parsed.records);

    let calls = 0;
    const fetchImpl = (async (input: string | URL | Request) => {
      calls += 1;
      const url = String(input);
      const handle = /forHandle=%40([^&]+)/.exec(url)?.[1] ?? "neznamy";
      const id = handle === "novy" ? NEW_ONE : NEW_TWO;
      return new Response(
        JSON.stringify({
          items: [{ id, snippet: { title: `Kanál ${handle}`, customUrl: `@${handle}` } }],
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      );
    }) as typeof fetch;

    const result = await resolveHandles(database, rows, { apiKey: "k", fetchImpl, limit: 1 });
    assert.equal(calls, 1, "limit musí omezit počet požadavků");
    assert.equal(result.resolved, 1);
    assert.equal(result.remaining, 1);
    assert.equal(result.rows[0].status, "NEW");
    assert.equal(result.rows[0].channelId, NEW_ONE);
  });

  it("stejný handle neřeší dvakrát", async () => {
    const database = setup();
    const parsed = parseImportFile("channels.csv", "handle,name\n@novy,A\n@novy,B\n");
    assert.equal(parsed.ok, true);
    if (!parsed.ok) return;
    const rows = buildPreview(database, parsed.records);

    const { fetchImpl, calls } = countingFetch(() => ({
      body: { items: [{ id: NEW_ONE, snippet: { title: "Nový" } }] },
    }));
    await resolveHandles(database, rows, { apiKey: "k", fetchImpl });
    assert.equal(calls.length, 1);
  });
});

describe("commitImport", () => {
  it("vloží jen NEW, je idempotentní a zachová existující stav", () => {
    const database = setup();
    const parsed = parseImportFile(
      "channels.csv",
      [
        "channel_id,name,category,priority",
        `${NEW_ONE},Nový,AI modely,1`,
        `${NEW_TWO},Druhý,Nástroje,2`,
        `${EXISTING},Existující,Přepis,1`,
      ].join("\n"),
    );
    assert.equal(parsed.ok, true);
    if (!parsed.ok) return;
    const rows = buildPreview(database, parsed.records);

    const first = commitImport(database, rows);
    assert.equal(first.ok, true);
    assert.equal(first.inserted, 2);
    assert.equal(count(database), 3);

    const stored = database
      .prepare(`SELECT title, source, is_active FROM channels WHERE channel_id = ?`)
      .get(NEW_ONE) as { title: string; source: string; is_active: number };
    assert.equal(stored.title, "Nový");
    assert.equal(stored.source, "import");
    assert.equal(stored.is_active, 1);

    const existing = database
      .prepare(`SELECT title, is_active FROM channels WHERE channel_id = ?`)
      .get(EXISTING) as { title: string; is_active: number };
    assert.equal(existing.title, "Existující", "existující kanál se nepřepisuje");
    assert.equal(existing.is_active, 0, "stav pozastavení zůstává");

    const second = commitImport(database, buildPreview(database, parsed.records));
    assert.equal(second.inserted, 0);
    assert.equal(count(database), 3);
  });

  it("ignoruje podvržené řádky označené jako NEW s neplatným ID", () => {
    const database = setup();
    const before = count(database);
    const result = commitImport(database, [
      {
        line: 1,
        input: "podvrh",
        channelId: "nesmysl",
        handle: null,
        url: null,
        name: "Podvrh",
        category: null,
        priority: 3,
        language: null,
        description: null,
        relevanceScore: null,
        status: "NEW",
        reason: null,
      },
    ]);
    assert.equal(result.inserted, 0);
    assert.equal(count(database), before);
  });

  it("nezaloží synchronizaci ani analýzu", () => {
    const database = setup();
    const parsed = parseImportFile("channels.csv", `channel_id,name\n${NEW_ONE},Nový\n`);
    assert.equal(parsed.ok, true);
    if (!parsed.ok) return;
    commitImport(database, buildPreview(database, parsed.records));
    const syncs = database.prepare(`SELECT COUNT(*) AS c FROM sync_runs`).get() as { c: number };
    const jobs = database.prepare(`SELECT COUNT(*) AS c FROM analysis_jobs`).get() as { c: number };
    assert.equal(syncs.c, 0);
    assert.equal(jobs.c, 0);
  });
});
