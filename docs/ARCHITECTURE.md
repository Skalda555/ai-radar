# AI Radar — architektura a rozhodnutí

Cílem je jednodechý, čitelný a lokálně provozovatelný nástroj pro jednoho uživatele.
Žádný ORM, žádná vektorová DB, žádná cloudová služba.

## 1. Přehled vrstev

```
prohlížeč
  └─ Next.js App Router (server components + route handlers)
       ├─ src/lib/queries/*      čtecí dotazy pro stránky
       ├─ src/lib/*/service.ts   doménová logika (channels, youtube, jobs, analysis…)
       ├─ src/lib/db/*           SQLite klient, forward-only migrace, zálohy
       └─ src/lib/{http,gemini}/*  jediná místa, odkud jde síťový požadavek ven
```

Frontend nikdy nevolá Gemini přímo a nikdy nevidí klíč. Všechny externí požadavky jdou
přes `safeFetchText` (allowlist hostitelů, HTTPS, timeout, limit velikosti, validace
přesměrování) nebo přes `gemini/client.ts` (stejná pravidla + redakce klíče v chybách).

## 2. Proč `node:sqlite`

Node 24 obsahuje `DatabaseSync` a FTS5. Odpadá nativní modul (`better-sqlite3`), který by
vyžadoval build toolchain a přinášel riziko instalace na Windows i v Dockeru.
Synchronní API je pro jednouživatelskou lokální aplikaci dostačující.

- WAL, `foreign_keys = ON`, `busy_timeout = 5000`.
- Transakce přes `withTransaction` (`BEGIN IMMEDIATE` / `COMMIT` / `ROLLBACK`).
- Migrace jsou forward-only, verzované v `schema_migrations`; před migrací existující DB
  vzniká ověřená záloha (`VACUUM INTO` + `PRAGMA integrity_check`).
- `node:sqlite` vrací objekty s `null` prototypem. Na hranici server → client je proto
  každý řádek kopírován helperem `plainRow`/`plainRows`.

## 3. Datový model

| Tabulka | Účel |
|---|---|
| `channels` | sledované kanály, unikátní `channel_id`, priorita, stav, poslední sync |
| `videos` | unikátní `video_id`, metadata z RSS, `search_text`, `prelim_relevance`, `analysis_relevance`, `is_demo` |
| `analyses` | jedna aktuální analýza na video, `status`, model, verze promptu, surový i normalizovaný JSON |
| `analysis_items` | strukturované položky (poznatek, tip, postup, krok, nástroj, prompt, omezení, využití) |
| `analysis_jobs` | stavový automat úloh, Interaction ID, HTTP status, tokeny, chyby |
| `analysis_runs` | auditní historie surových výstupů modelu (i nevalidních) |
| `analysis_questions` | doplňující dotazy k videu, odpovědi a jejich stav (jeden placený požadavek na dotaz) |
| `sync_runs` | každý běh RSS synchronizace |
| `saved_videos` | „Na později“ |
| `preferences` | key/value nastavení |
| `api_usage` | evidence požadavků, tokenů a `cost_status = NOT_VERIFIED` |
| `knowledge_fts` | FTS5 (`unicode61 remove_diacritics 2`) pro knihovnu znalostí |

Klíčová omezení: `UNIQUE(channel_id)`, `UNIQUE(video_id)`, cizí klíče, a parciální unikátní
index `ux_jobs_active` na `(video_id)` pro stavy `PENDING|SUBMITTED|IN_PROGRESS`. Databáze
tak sama zabrání dvěma souběžným analytickým úlohám na totéž video.

## 4. Stavový automat analytické úlohy

`startAnalysis` nejdřív zapíše `PENDING`, pak odešle **jeden** POST. Nikdy neposílá druhý
požadavek na totéž video, dokud je úloha aktivní. `pollJob` umí pouze `GET`.

| Stav | Význam | Automatická akce |
|---|---|---|
| `PENDING` | lokální záznam existuje, POST ještě neproběhl | žádná |
| `SUBMITTED` | Google přijal, Interaction ID uloženo | polling GET |
| `IN_PROGRESS` | Google zpracovává | polling GET |
| `COMPLETED` | výsledek validován a uložen | — |
| `FAILED` | HTTP chyba / neplatné schéma | žádný retry |
| `UNKNOWN` | odpověď se ztratila nebo interakce expirovala | žádný retry |
| `INSUFFICIENT_CONTENT` | málo obsahu, nic se nedomýšlí | — |

Obnova po restartu je čistě z DB: stav i Interaction ID přežijí pád procesu.

## 5. Důvěryhodnost a ověření

- Každá položka vzniká jako `AI_EXTRACTED`. Model nikdy sám nepovýší tvrzení na
  `SOURCE_SUPPORTED`; to by vyžadovalo nezávislé ověření proti zdroji.
- Uživatel může ručně označit `USER_VERIFIED` / `DISPUTED`, stav se ukládá a exportuje.
- Relevance je doporučovací metrika, ne důkaz pravdivosti.
- `INSUFFICIENT_CONTENT` zahazuje extrahované položky místo jejich zobrazení.

## 6. Bezpečnostní hranice

- Allowlist hostitelů: `www.youtube.com`, `www.googleapis.com`,
  `generativelanguage.googleapis.com` (jen přes Gemini klienta).
- Maximální velikost odpovědi, timeout, žádné neomezené retry, kontrola přesměrování.
- `guardMutation`: mutující endpointy jsou jen z localhostu, jinak vyžadují
  `x-ai-radar-token`. Analytický endpoint ověřuje, že video ID existuje v DB.
- API klíče se nikdy nezapisují do DB, logu ani odpovědi; chybové zprávy je redagují.
- Externí text (video, popis, titulky) je nedůvěryhodný vstup. Prompt zakazuje řídit se
  instrukcemi z videa; aplikace externí text nikdy nevykonává.

## 7. Ověřené kontrakty (listopad 2026)

- **YouTube Atom feed** `https://www.youtube.com/feeds/videos.xml?channel_id=…` — živě
  ověřeno, 15 položek, `media:group`, miniatury z `iN.ytimg.com`, bez délky videa.
  Pozor: `yt:channelId` v hlavičce feedu může být bez prefixu `UC`; parser proto bere
  kanonické ID z `<link rel="alternate" href="…/channel/UC…">` nebo z položky.
- **YouTube Data API v3** `channels.list?part=snippet&forHandle=@handle` — klíč server-side.
- **Gemini Interactions API** `POST /v1beta/interactions` (hlavičky `x-goog-api-key`,
  `Api-Revision: 2026-05-20`), tělo `{model,input,background,store,response_format}`;
  `GET /v1beta/interactions/{id}` vrací `status` a `output_text`;
  stavy `in_progress | requires_action | completed | failed | cancelled`;
  `background:true` vyžaduje `store:true`.
- **Model** `gemini-3.5-flash-lite`: vstupy text/obraz/video/audio/PDF, kontext 1 048 576,
  výstup 65 536, structured outputs podporovány.

## 8. Testovací strategie

- `node:test` + `tsc -p tsconfig.build.json` (Vitest nejde: jeho Vite loader v sandboxu
  volá `child_process`, což prostředí blokuje).
- Každý test má vlastní in-memory SQLite; produkční `data/ai-radar.db` se testů neúčastní.
- Gemini je vždy mockovaný (`fetchImpl`), žádné živé placené volání.
- HTTP vrstva se ověřuje reálným během produkčního serveru (`curl`/`fetch`).

## 9. Co je záměrně mimo rozsah

- Registrace, role, platební brána.
- Vektorová databáze (FTS5 stačí pro tento objem).
- Automatické spouštění AI analýzy.
- Scraping YouTube HTML pro převod handle (neověřený a křehký mechanismus).
- Nasazení na Synology (připraveno v Dockerfile, neprovedeno).
