import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import type { Db } from "../src/lib/db/client";
import { filterChannels, hasSearchTokens } from "../src/lib/channels/filter";
import { channelsToCsv, channelsToJson, loadChannelsForExport } from "../src/lib/export/channels";
import { parseImportFile } from "../src/lib/import/parse";
import { openTestDb, seedChannel } from "./helpers";

let db: Db | null = null;

function setup(): Db {
  db = openTestDb();
  return db;
}

afterEach(() => {
  db?.close();
  db = null;
});

/** Inserts a channel with every exported column filled, including awkward text. */
function insertRichChannel(
  database: Db,
  input: {
    channelId: string;
    title: string;
    handle?: string | null;
    category?: string | null;
    priority?: number;
    language?: string | null;
    description?: string | null;
    relevanceScore?: number | null;
    isActive?: boolean;
  },
): void {
  const now = new Date().toISOString();
  database
    .prepare(
      `INSERT INTO channels (
         channel_id, handle, url, title, description, category, priority, language,
         relevance_score, is_active, is_demo, source, created_at, updated_at
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, 'test', ?, ?)`,
    )
    .run(
      input.channelId,
      input.handle ?? null,
      `https://www.youtube.com/channel/${input.channelId}`,
      input.title,
      input.description ?? null,
      input.category ?? null,
      input.priority ?? 3,
      input.language ?? null,
      input.relevanceScore ?? null,
      input.isActive === false ? 0 : 1,
      now,
      now,
    );
}

const HEADER = "channel_id,handle,url,name,category,priority,language,description,relevance_score";

describe("export kanálů do CSV", () => {
  it("hlavička odpovídá sloupcům, kterým rozumí import", () => {
    const csv = channelsToCsv([]);
    const lines = csv.replace(/^\uFEFF/, "").split("\r\n").filter((line) => line.length > 0);
    assert.equal(lines[0], HEADER);
    assert.equal(lines.length, 1, "prázdný export obsahuje jen hlavičku");
  });

  it("začíná BOM, aby Excel zobrazil diakritiku", () => {
    assert.equal(channelsToCsv([]).charCodeAt(0), 0xfeff);
  });

  it("cituje čárku, uvozovky i nový řádek", () => {
    const database = setup();
    insertRichChannel(database, {
      channelId: "UCescapovani000000000000",
      title: 'Kanál, "test"',
      description: "první řádek\ndruhý řádek",
      category: "AI; modely",
      handle: "@test",
      language: "cs",
      relevanceScore: 87.5,
    });

    const csv = channelsToCsv(loadChannelsForExport(database));

    assert.ok(csv.includes('"Kanál, ""test"""'), "uvozovky se zdvojují");
    assert.ok(csv.includes('"první řádek\ndruhý řádek"'), "nový řádek zůstane v jedné buňce");
    assert.ok(csv.includes('"AI; modely"'), "středník se cituje kvůli evropskému Excelu");
    assert.ok(csv.includes("87.5"), "relevance se vypíše jako číslo");
  });

  it("prázdné hodnoty zůstanou prázdnými buňkami", () => {
    const database = setup();
    seedChannel(database, { channelId: "UCprazdne0000000000000", title: "Bez doplňků" });

    const csv = channelsToCsv(loadChannelsForExport(database));
    const cells = csv.replace(/^\uFEFF/, "").split("\r\n")[1].split(",");

    assert.equal(cells.length, 9, "řádek má stejně sloupců jako hlavička");
    assert.deepEqual(cells, [
      "UCprazdne0000000000000",
      "",
      "https://www.youtube.com/channel/UCprazdne0000000000000",
      "Bez doplňků",
      "",
      "3",
      "",
      "",
      "",
    ]);
  });
});

describe("export kanálů do JSON", () => {
  it("má obal s polem channels a počtem", () => {
    const database = setup();
    insertRichChannel(database, {
      channelId: "UCjson00000000000000000",
      title: "JSON kanál",
      handle: "@json",
      priority: 2,
      language: "en",
      relevanceScore: 70,
    });

    const bundle = channelsToJson(loadChannelsForExport(database));

    assert.equal(bundle.count, 1);
    assert.equal(bundle.channels.length, 1);
    assert.equal(bundle.channels[0].channel_id, "UCjson00000000000000000");
    assert.equal(bundle.channels[0].name, "JSON kanál");
    assert.equal(bundle.channels[0].priority, 2);
    assert.equal(bundle.channels[0].relevance_score, 70);
    assert.match(bundle.exported_at, /^\d{4}-\d{2}-\d{2}T/);
  });
});

describe("export jde naimportovat zpět", () => {
  it("CSV projde stejnou cestou jako ručně připravený soubor", () => {
    const database = setup();
    insertRichChannel(database, {
      channelId: "UCroundtrip00000000000a",
      title: "Karpathy",
      handle: "@karpathy",
      category: "AI modely",
      priority: 1,
      language: "en",
      relevanceScore: 95,
    });
    insertRichChannel(database, {
      channelId: "UCroundtrip00000000000b",
      title: "Druhý kanál",
      priority: 4,
    });

    const rows = loadChannelsForExport(database);
    const parsed = parseImportFile("export-kanaly.csv", channelsToCsv(rows));

    assert.equal(parsed.ok, true);
    if (!parsed.ok) return;
    assert.equal(parsed.records.length, 2);
    assert.deepEqual(
      parsed.records.map((record) => record.channel_id),
      rows.map((row) => row.channel_id),
    );
    assert.equal(parsed.records[0].name, "Karpathy");
    assert.equal(parsed.records[0].handle, "@karpathy");
    assert.equal(parsed.records[0].priority, "1");
    assert.equal(parsed.records[0].relevance_score, "95");
  });

  it("JSON projde stejnou cestou jako ručně připravený soubor", () => {
    const database = setup();
    seedChannel(database, { channelId: "UCjsonround000000000000c", title: "JSON round" });

    const rows = loadChannelsForExport(database);
    const parsed = parseImportFile("export-kanaly.json", JSON.stringify(channelsToJson(rows)));

    assert.equal(parsed.ok, true);
    if (!parsed.ok) return;
    assert.equal(parsed.records.length, 1);
    assert.equal(parsed.records[0].channel_id, "UCjsonround000000000000c");
    assert.equal(parsed.records[0].name, "JSON round");
  });
});

describe("výběr kanálů pro export", () => {
  it("řadí aktivní první, pak podle priority a názvu", () => {
    const database = setup();
    insertRichChannel(database, { channelId: "UCradek0000000000000001", title: "Beta", priority: 2 });
    insertRichChannel(database, {
      channelId: "UCradek0000000000000002",
      title: "Alfa",
      priority: 1,
      isActive: false,
    });
    insertRichChannel(database, { channelId: "UCradek0000000000000003", title: "Ceta", priority: 1 });

    const titles = loadChannelsForExport(database).map((row) => row.title);
    assert.deepEqual(titles, ["Ceta", "Beta", "Alfa"]);
  });

  it("filtr q vybere stejné kanály jako hledání na stránce", () => {
    const database = setup();
    insertRichChannel(database, {
      channelId: "UCfiltr000000000000001",
      title: "Andrej Karpathy",
      handle: "@karpathy",
      category: "AI modely",
    });
    insertRichChannel(database, {
      channelId: "UCfiltr000000000000002",
      title: "Vibe coding",
      category: "Vývoj",
    });

    const all = loadChannelsForExport(database);

    assert.deepEqual(
      filterChannels(all, "karpathy").map((row) => row.title),
      ["Andrej Karpathy"],
    );
    assert.deepEqual(
      filterChannels(all, "vyvoj").map((row) => row.title),
      ["Vibe coding"],
      "hledání ignoruje diakritiku",
    );
    assert.equal(filterChannels(all, "").length, 2);
    assert.equal(hasSearchTokens("a"), false, "jednopísmenný dotaz se ignoruje");
    assert.equal(hasSearchTokens("ai"), true);
  });
});
