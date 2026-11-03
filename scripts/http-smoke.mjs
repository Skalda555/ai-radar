/**
 * End-to-end HTTP smoke test against a running AI Radar server.
 * Verifies real responses, real database writes and the localhost mutation guard.
 *
 *   npm run start        # in another terminal
 *   npm run smoke
 */
import http from "node:http";
import { DatabaseSync } from "node:sqlite";

const BASE = process.env.SMOKE_BASE ?? "http://127.0.0.1:3000";
const DB_PATH = process.env.AI_RADAR_DB_PATH ?? "data/ai-radar.db";

const results = [];
let failed = 0;

function record(name, ok, detail) {
  results.push({ name, ok, detail });
  if (!ok) failed += 1;
}

async function check(name, fn) {
  try {
    const detail = await fn();
    record(name, true, detail);
  } catch (error) {
    record(name, false, error instanceof Error ? error.message : String(error));
  }
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function get(path) {
  const response = await fetch(BASE + path, { signal: AbortSignal.timeout(30000) });
  const text = await response.text();
  return { status: response.status, text, headers: response.headers };
}

async function post(path, body) {
  const response = await fetch(BASE + path, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body ?? {}),
    signal: AbortSignal.timeout(60000),
  });
  const text = await response.text();
  let json = null;
  try {
    json = JSON.parse(text);
  } catch {
    json = null;
  }
  return { status: response.status, text, json };
}

const db = new DatabaseSync(DB_PATH, { readOnly: true });
const realVideo = db.prepare(`SELECT video_id FROM videos LIMIT 1`).get();
const analyzedVideo = db
  .prepare(`SELECT video_id FROM analyses ORDER BY id DESC LIMIT 1`)
  .get();
const item = analyzedVideo
  ? db
      .prepare(
        `SELECT id, verification_status FROM analysis_items WHERE video_id = ? ORDER BY id LIMIT 1`,
      )
      .get(analyzedVideo.video_id)
  : null;
const originalSettings = db.prepare(`SELECT key, value FROM preferences`).all();
db.close();

if (!realVideo) {
  console.error("Databáze neobsahuje reálné video. Spusť nejdřív npm run sync.");
  process.exit(1);
}

await check("GET /api/health → ok + integrita", async () => {
  const { status, text } = await get("/api/health");
  const payload = JSON.parse(text);
  assert(status === 200, `HTTP ${status}`);
  assert(payload.ok === true, "ok není true");
  assert(payload.database.integrity === "ok", `integrita ${payload.database.integrity}`);
  assert(payload.services.automaticAnalysis === false, "automatická analýza musí být vypnutá");
  return `schéma ${payload.database.schema.join(",")} · ${payload.database.counts.videos} videí`;
});

await check("GET / → dashboard s reálnými daty", async () => {
  const { status, text } = await get("/");
  assert(status === 200, `HTTP ${status}`);
  assert(text.includes("Přehled AI novinek"), "chybí nadpis");
  assert(/i\d?\.ytimg\.com/.test(text), "chybí reálné miniatury");
  assert(!/Application error|Internal Server Error/i.test(text), "stránka obsahuje chybu");
  return `${Math.round(text.length / 1024)} kB HTML`;
});

await check("GET /videa → karty a filtry", async () => {
  const { status, text } = await get("/videa");
  assert(status === 200, `HTTP ${status}`);
  const cards = (text.match(/class="video-card[\s"]/g) ?? []).length;
  assert(cards > 0, "žádné karty");
  assert(text.includes("filter-panel") && text.includes("Filtrovat"), "chybí filtry");
  assert(text.includes('name="category"'), "chybí filtr kategorie");
  return `${cards} karet`;
});

await check("GET /videa?q=codex → filtrované hledání", async () => {
  const { status, text } = await get("/videa?q=codex");
  assert(status === 200, `HTTP ${status}`);
  return text.includes("odpovídá filtru") ? "filtr aplikován" : "bez potvrzení filtru";
});

await check("GET /videa?status=SAVED → prázdný stav", async () => {
  const { status, text } = await get("/videa?status=SAVED");
  assert(status === 200, `HTTP ${status}`);
  assert(text.includes("Žádné video neodpovídá filtru") || text.includes("video-card"), "neošetřený stav");
  return "stav vykreslen";
});

await check("GET /video/:id → detail reálného videa", async () => {
  const { status, text } = await get(`/video/${realVideo.video_id}`);
  assert(status === 200, `HTTP ${status}`);
  assert(text.includes("Otevřít YouTube"), "chybí akce");
  assert(text.includes("Odhad relevance z metadat"), "chybí panel odhadu");
  return realVideo.video_id;
});

await check("GET /video/neexistuje → 404", async () => {
  const { status } = await get("/video/neexistuje");
  assert(status === 404, `čekáno 404, přišlo ${status}`);
  return "404";
});

if (analyzedVideo) {
  await check("GET /video/:id → analýza se záložkami a doporučeními", async () => {
    const { status, text } = await get(`/video/${analyzedVideo.video_id}`);
    assert(status === 200, `HTTP ${status}`);
    assert((text.match(/role="tab"/g) ?? []).length === 7, "očekávám 7 záložek");
    assert(text.includes("Jak to mohu využít?"), "chybí sekce doporučení");
    assert(text.includes("Doporučení AI Radaru"), "chybí oddělení interpretace");
    assert(text.includes("Metadata videa"), "chybí metadata videa");
    return "7 záložek";
  });
}

await check("POST save → uloženo a zpět", async () => {
  const target = realVideo;
  const on = await post(`/api/videos/${target.video_id}/save`, { saved: true });
  assert(on.status === 200 && on.json?.saved === true, `uložení selhalo: ${on.status}`);
  const off = await post(`/api/videos/${target.video_id}/save`, { saved: false });
  assert(off.status === 200 && off.json?.saved === false, `odebrání selhalo: ${off.status}`);
  return target.video_id;
});

if (item) {
  await check("POST verify → ruční ověření a návrat", async () => {
    const verified = await post(`/api/analysis-items/${item.id}/verify`, { status: "USER_VERIFIED" });
    assert(verified.status === 200 && verified.json?.status === "USER_VERIFIED", "ověření selhalo");
    const restored = await post(`/api/analysis-items/${item.id}/verify`, {
      status: item.verification_status,
    });
    assert(restored.status === 200, "návrat selhal");
    return `item ${item.id}`;
  });
}

if (analyzedVideo) {
  await check("GET export analýzy (md + json)", async () => {
    const md = await get(`/api/export/analysis/${analyzedVideo.video_id}?format=md`);
    assert(md.status === 200, `md HTTP ${md.status}`);
    assert(md.text.startsWith("# "), "markdown nezačíná nadpisem");
    assert(md.text.includes("Ověření"), "chybí stav ověření");
    const json = await get(`/api/export/analysis/${analyzedVideo.video_id}?format=json`);
    const payload = JSON.parse(json.text);
    assert(Array.isArray(payload.items) && payload.items.length > 0, "json bez položek");
    return `${payload.items.length} položek`;
  });
}

if (item) {
  await check("GET export poznatků (md + json)", async () => {
    const md = await get(`/api/export/knowledge?ids=${item.id}&format=md`);
    assert(md.status === 200 && md.text.includes("vybrané poznatky"), "md export selhal");
    const json = await get(`/api/export/knowledge?ids=${item.id}&format=json`);
    assert(JSON.parse(json.text).items.length === 1, "json export selhal");
    return `ids=${item.id}`;
  });
}

await check("POST /api/settings → roundtrip", async () => {
  const before = await get("/api/settings");
  const current = JSON.parse(before.text).preferences;
  const changed = await post("/api/settings", { ...current, analysisDailyLimit: 7 });
  assert(changed.status === 200 && changed.json?.preferences?.analysisDailyLimit === 7, "změna selhala");
  const restored = await post("/api/settings", current);
  assert(restored.json?.preferences?.analysisDailyLimit === current.analysisDailyLimit, "návrat selhal");
  return `limit ${current.analysisDailyLimit}`;
});

await check("POST /api/backup → ověřená záloha", async () => {
  const response = await post("/api/backup", {});
  assert(response.status === 200 && response.json?.ok === true, `HTTP ${response.status}`);
  assert(String(response.json.path).endsWith(".db"), "neplatná cesta zálohy");
  return response.json.path.split(/[\\/]/).pop();
});

await check("POST analyze bez potvrzení → 400, žádný placený požadavek", async () => {
  const response = await post(`/api/videos/${realVideo.video_id}/analyze`, { confirm: false });
  assert(response.status === 400, `čekáno 400, přišlo ${response.status}`);
  assert(response.json?.code === "CONFIRMATION_REQUIRED", `kód ${response.json?.code}`);
  return "odmítnuto";
});

await check("GET /api/jobs → seznam úloh", async () => {
  const { status, text } = await get("/api/jobs");
  const payload = JSON.parse(text);
  assert(status === 200 && Array.isArray(payload.jobs), "neplatná odpověď");
  return `${payload.jobs.length} úloh`;
});

for (const [path, marker] of [
  ["/kanaly", "Sledované kanály"],
  ["/na-pozdeji", "Na později"],
  ["/zpracovani", "Zpracování"],
  ["/znalosti", "Knihovna znalostí"],
  ["/databaze", "Databáze znalostí"],
  ["/nastaveni", "Nastavení"],
  ["/api-spotreba", "API a spotřeba"],
]) {
  await check(`GET ${path} → 200 se obsahem`, async () => {
    const { status, text } = await get(path);
    assert(status === 200, `HTTP ${status}`);
    assert(text.includes(marker), `chybí „${marker}“`);
    assert(!/Application error|Internal Server Error/i.test(text), "stránka obsahuje chybu");
    return `${Math.round(text.length / 1024)} kB`;
  });
}

await check("GET /kanaly → formulář s kategorií", async () => {
  const { status, text } = await get("/kanaly");
  assert(status === 200, `HTTP ${status}`);
  assert(text.includes('id="channel-category"'), "chybí pole Kategorie");
  assert(text.includes('channel-category-options'), "chybí našeptávač kategorií");
  assert(text.includes("Upravit kategorii"), "chybí úprava kategorie u kanálu");
  assert(text.includes("Přidat kanál"), "chybí formulář");
  return "kategorie přítomná";
});

await check("GET /kanaly?q= → hledání v kanálech", async () => {
  const all = await (await fetch(BASE + "/api/channels")).json();
  const target = all.channels[0];
  assert(target, "v DB není žádný kanál");
  const hit = await get(`/kanaly?q=${encodeURIComponent(target.title.slice(0, 6))}`);
  assert(hit.status === 200, `HTTP ${hit.status}`);
  assert(hit.text.includes("Kanály ("), "chybí seznam");
  const miss = await get("/kanaly?q=zzzzneexistuje");
  assert(miss.text.includes("Žádný kanál neodpovídá hledání"), "chybí prázdný stav hledání");
  return `hledání funguje (${all.channels.length} kanálů)`;
});

await check("POST kategorie kanálu → sjednocení", async () => {
  const list = await (await fetch(BASE + "/api/channels")).json();
  const channel = list.channels[0];
  assert(channel, "v DB není žádný kanál");
  const current = channel.category ?? "AI modely";
  const response = await post(`/api/channels/${channel.channel_id}/category`, {
    category: current.toUpperCase(),
  });
  assert(response.status === 200 && response.json?.ok === true, `HTTP ${response.status}`);
  assert(response.json.category === current, `kategorie se nesjednotila: ${response.json.category}`);
  return `kategorie ${response.json.category}`;
});

await check("GET /na-pozdeji → filtry fronty", async () => {
  const { status, text } = await get("/na-pozdeji");
  assert(status === 200, `HTTP ${status}`);
  assert(
    text.includes("filter-panel") || text.includes("Zatím nic odloženo"),
    "chybí filtry i prázdný stav",
  );
  return text.includes("filter-panel") ? "filtry přítomné" : "prázdný stav";
});

if (analyzedVideo) {
  await check("POST skrytí videa v knihovně a zpět", async () => {
    const hide = await post(`/api/videos/${analyzedVideo.video_id}/knowledge-visibility`, { hidden: true });
    assert(hide.status === 200 && hide.json?.hidden === true, `skrytí selhalo: ${hide.status}`);
    const show = await post(`/api/videos/${analyzedVideo.video_id}/knowledge-visibility`, { hidden: false });
    assert(show.status === 200 && show.json?.hidden === false, `zobrazení selhalo: ${show.status}`);
    return "skryto a vráceno";
  });
}

if (item) {
  await check("POST uložení znalosti do databáze a odebrání", async () => {
    const add = await post(`/api/analysis-items/${item.id}/curate`, { curated: true });
    assert(add.status === 200 && add.json?.curated === true, `uložení selhalo: ${add.status}`);
    const remove = await post(`/api/analysis-items/${item.id}/curate`, { curated: false });
    assert(remove.status === 200 && remove.json?.curated === false, `odebrání selhalo: ${remove.status}`);
    return `item ${item.id}`;
  });
}

await check("POST import preview → náhled bez zápisu", async () => {
  const sample = await get("/samples/channels.csv");
  assert(sample.status === 200, `vzor CSV HTTP ${sample.status}`);
  const before = await get("/api/health");
  const beforeCount = JSON.parse(before.text).database.counts.channels;
  const preview = await post("/api/import/preview", {
    filename: "channels.csv",
    content: sample.text,
  });
  assert(preview.status === 200, `HTTP ${preview.status}`);
  const summary = preview.json.summary;
  assert(summary.total === 5, `očekávám 5 řádků, je ${summary.total}`);
  assert(summary.HANDLE_UNRESOLVED === 1, "handle má být k převodu");
  assert(summary.INVALID === 1, "neplatný řádek má být odmítnut");
  assert(
    summary.NEW + summary.ALREADY_EXISTS === 3,
    `tři platné řádky, je ${summary.NEW + summary.ALREADY_EXISTS}`,
  );
  const after = await get("/api/health");
  const afterCount = JSON.parse(after.text).database.counts.channels;
  assert(beforeCount === afterCount, "náhled nesmí zapisovat do databáze");
  return `${preview.json.rows.length} řádků`;
});

await check("POST import commit → idempotentní (0 nových)", async () => {
  // Vychází z kanálů, které v DB skutečně jsou, takže test nic nezaloží.
  const channels = (await (await fetch(BASE + "/api/channels")).json()).channels.slice(0, 2);
  assert(channels.length === 2, "pro test jsou potřeba aspoň dva kanály");
  const content = JSON.stringify({
    channels: channels.map((channel) => ({ channel_id: channel.channel_id, name: channel.title })),
  });
  const preview = await post("/api/import/preview", { filename: "channels.json", content });
  assert(preview.status === 200, `preview HTTP ${preview.status}`);
  assert(preview.json.summary.ALREADY_EXISTS === 2, "oba kanály už musí existovat");

  const commit = await post("/api/import/commit", { rows: preview.json.rows });
  assert(commit.status === 200 && commit.json?.ok === true, `HTTP ${commit.status}`);
  assert(commit.json.inserted === 0, `nemělo vložit nic, vložilo ${commit.json.inserted}`);
  return "0 vloženo, idempotentní";
});

await check("POST z cizího Host → 403 (guard)", async () => {
  const status = await new Promise((resolve, reject) => {
    const request = http.request(
      {
        host: "127.0.0.1",
        port: Number(new URL(BASE).port || 3000),
        path: "/api/sync",
        method: "POST",
        headers: { host: "radar.example.com", "content-type": "application/json" },
      },
      (response) => {
        response.resume();
        resolve(response.statusCode);
      },
    );
    request.on("error", reject);
    request.end("{}");
  });
  assert(status === 403, `čekáno 403, přišlo ${status}`);
  return "403";
});

const width = Math.max(...results.map((r) => r.name.length));
for (const result of results) {
  console.log(`${result.ok ? "PASS" : "FAIL"}  ${result.name.padEnd(width)}  ${result.detail ?? ""}`);
}
console.log(`\n${results.length - failed}/${results.length} kontrol prošlo.`);
process.exit(failed === 0 ? 0 : 1);
