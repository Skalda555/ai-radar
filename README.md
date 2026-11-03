# AI Radar

Osobní inteligentní radar AI novinek z YouTube. Sleduje kanály přes veřejný Atom feed,
ukládá videa do lokální SQLite, počítá levný odhad relevance z metadat a po výslovném
potvrzení umí nechat video analyzovat Gemini. Výstupem jsou česká shrnutí, podložené
poznatky, tipy, postupy, nástroje a prompty — s časovými značkami a přiznaným stavem ověření.

Motto: **Méně šumu. Více podstaty.**

---

## 1. Požadavky

- **Node.js 24 LTS** nebo novější (používá vestavěné `node:sqlite`; na starší verzi aplikace nenaběhne).
- Windows 11, macOS nebo Linux. Cílové prostředí je Windows 11 + prohlížeč.
- Žádná databázová služba, Redis, Supabase ani cloudový hosting.

Ověření verze:

```powershell
node --version   # musí být >= 24
```

## 2. Instalace a spuštění

### Windows (doporučeno)

Dvojklik na **`START.cmd`** v kořeni projektu. Skript:

- přepne se do své složky (funguje i v cestě s mezerami),
- zkontroluje Node.js (>= 24) a existenci `node_modules`,
- při chybějících závislostech spustí `npm install` (žádné globální instalace),
- při chybějícím buildu spustí `npm run build`,
- nastartuje aplikaci na `http://127.0.0.1:3000`,
- při chybě vypíše diagnostiku a počká na stisk klávesy.

### Ručně (vývoj)

```powershell
npm install
npm run dev        # vývojový server s HMR
# nebo
npm run build
npm run start      # produkční server na http://127.0.0.1:3000
npm run start:lan  # naslouchá na všech rozhraních (přístup z LAN/telefonu)
```

### Přístup z LAN nebo telefonu

Server ve výchozím stavu poslouchá jen na `127.0.0.1`, takže se z jiného zařízení vůbec
nepřipojíš. Pro přístup z LAN:

1. Spusť `npm run start:lan` (nebo `START.cmd lan`) — server poslouchá na `0.0.0.0:3000`.
2. Doplň do `.env.local` adresu, na které aplikaci otevíráš:

   ```dotenv
   AI_RADAR_ALLOWED_HOSTS=192.168.3.241,100.86.138.22
   ```

   Bez toho se stránky načtou, ale každé tlačítko vrátí 403: prohlížeč neumí poslat
   `x-ai-radar-token`, takže měnící endpointy pouští jen hostitele z tohoto seznamu.
3. Na telefonu otevři `http://<IP-počítače>:3000` (IP zjistíš přes `ipconfig`).

Co to znamená bezpečnostně: kdokoli na stejné síti (nebo v tvém tailnetu) může měnit data.
Pro vzdálený přístup mimo domov je proto lepší Tailscale než veřejné IP a port forwarding;
pro veřejnou doménu zůstává správná cesta reverzní proxy s tokenem (viz [docs/SYNOLOGY.md](docs/SYNOLOGY.md)).
Windows se při prvním startu může zeptat firewallu — povol přístup jen pro privátní sítě.

## 3. Konfigurace `.env.local`

Zkopíruj `.env.example` na `.env.local` v kořeni projektu a doplň hodnoty. Soubor je
v `.gitignore` a nikdy se necommituje.

```dotenv
YOUTUBE_API_KEY=
GEMINI_API_KEY=
GEMINI_MODEL=gemini-3.5-flash-lite
```

| Proměnná | Význam | Povinné |
|---|---|---|
| `YOUTUBE_API_KEY` | Převod `@handle` → stabilní Channel ID přes `channels.list?forHandle` | ne |
| `GEMINI_API_KEY` | Analýza videí přes Gemini Interactions API | ne |
| `GOOGLE_TRANSLATE_API_KEY` | Překlad názvů videí přes Google Cloud Translation v2 | ne |
| `GEMINI_MODEL` | Model, výchozí `gemini-3.5-flash-lite` | ne |
| `AI_RADAR_DB_PATH` | Jiná cesta k SQLite (výchozí `data/ai-radar.db`) | ne |
| `AI_RADAR_ACCESS_TOKEN` | Vyžaduje hlavičku `x-ai-radar-token` u všech mutací (pro reverzní proxy) | ne |
| `AI_RADAR_ALLOWED_HOSTS` | Hostitelé (IP/názvy), kteří smí měnit data i bez tokenu — pro LAN a Tailscale | ne |

**Aplikace je plně použitelná i bez jediného klíče:** RSS synchronizace, filtry, ukládání,
import i export kanálů, knihovna i export fungují. Bez `YOUTUBE_API_KEY` vkládej rovnou Channel ID
(`UC…` + 22 znaků), bez `GEMINI_API_KEY` se analýza neodešle.

### Získání YouTube API klíče

1. Google Cloud Console → nový projekt.
2. APIs & Services → Library → **YouTube Data API v3** → Enable.
3. Credentials → Create credentials → **API key**.
4. Klíč vlož do `.env.local` jako `YOUTUBE_API_KEY`.

Klíč se používá jen pro `channels.list` (převod handle). RSS feed klíč nepotřebuje.

### Získání Gemini API klíče

1. <https://aistudio.google.com/apikey> → Create API key.
2. Klíč vlož do `.env.local` jako `GEMINI_API_KEY`.
3. Volitelně změň `GEMINI_MODEL` (musí to být model, který existuje a podporuje video vstup).

## 4. Free / Paid režim — co je ověřené a co ne

- Aplikace **nikdy neodesílá** analytický požadavek bez výslovného potvrzení v dialogu.
- Automatická AI analýza je **trvale vypnutá** a nedá se zapnout v UI.
- Po odeslání se ukládá Interaction ID; stav se čte pouze přes `GET`.
- Neexistuje automatický retry placeného POSTu. Stav `UNKNOWN` znamená „nevíme, zda Google
  úlohu přijal“ a opakování je jen vědomá akce s upozorněním.
- Cena a tarif se **neověřují**: API nevrací fakturovanou cenu a `serviceTier` není doklad
  o tarifu. V UI je proto vždy `NOT_VERIFIED`, nikdy „zdarma“.
- Dokumentace Gemini uvádí, že vstup přes YouTube URL je v preview režimu. Dostupnost
  a podmínky se mohou změnit; před spoléháním na produkci si ověř oficiální ceník.

## 5. Jak funguje analýza (stavový automat)

```
NOT_ANALYZED → PENDING → SUBMITTED → IN_PROGRESS → COMPLETED
                                   ↘ FAILED
                                   ↘ UNKNOWN (nejisté odeslání / expirace)
                                   ↘ INSUFFICIENT_CONTENT
```

- `PENDING` = lokální záznam vznikl **před** odesláním POSTu.
- `SUBMITTED` = Google vrátil Interaction ID.
- `IN_PROGRESS` = server Google video zpracovává; dotaz je jen `GET`.
- `UNKNOWN` = odpověď se ztratila (timeout, výpadek sítě) nebo interakce vypršela.
  Aplikace v tomto stavu **nezopakuje** POST sama.
- `FAILED` = jednoznačná chyba (HTTP chyba, neplatné schéma). Diagnostika zůstává v DB.
- `INSUFFICIENT_CONTENT` = model uvedl, že video nemá dost obsahu; nic se nedomýšlí.
- Úloha přežije restart: stav i Interaction ID jsou v SQLite. Tlačítko „Obnovit stav úloh“
  nebo detail videa znovu načte výsledek, dokud ho Google uchovává.

### Doplňující dotazy k videu

U českého shrnutí jsou dvě akce. **Přečíst** přečte shrnutí nahlas hlasem nainstalovaným
v systému (na Windows hlasy Microsoft SAPI) přes Web Speech API – text nikam neodchází.
**Podrobnější shrnutí** nechá Gemini vygenerovat delší české shrnutí videa; výsledek se uloží
k analýze (`analyses.summary_deep_cs`), takže se negeneruje znovu při každém otevření.

Pod českým shrnutím je karta **„Něco ve videu není jasné?"**. Každý dotaz je jeden vědomě
potvrzený placený požadavek na Gemini: video se posílá jako odkaz, odpověď se ukládá
k analýze (`analysis_questions`) a zobrazí se i po restartu. Model dostane shrnutí a klíčové
poznatky jen jako orientaci a má odpovídat pouze z videa; když něco ve videu nezaznělo, musí
to říct. Dotaz se automaticky neopakuje – když Google ještě zpracovává, použij „Obnovit odpověď".

### Knihovna znalostí a databáze znalostí

U každého poznatku v knihovně jsou dvě akce. **Skrýt video** schová všechna tvrzení z daného videa
(přepínačem „Zobrazit i skrytá videa" je vrátíš); data se přitom nesmažou. **Uložit do databáze**
přidá poznatek do samostatné sekce **Databáze znalostí** (`/databaze`), která zůstává i po skrytí
videa a umí export do Markdownu a JSON se zdrojem a stavem ověření.

### Překlad názvů videí

Názvy se překládají do češtiny přes **Google Cloud Translation v2** (`GOOGLE_TRANSLATE_API_KEY`).
Překlad se ukládá k videu (`videos.title_cs_google`) a znovu se posílá jen tehdy, když se změní
původní název. Spouští se po synchronizaci (nové a změněné názvy) a ručně tlačítkem
„Přeložit názvy" na stránce Videa, které se zobrazí, jen když něco chybí. Deset přeložených názvů
stojí zlomek centu, ale cena není v aplikaci ověřená (`NOT_VERIFIED`).

Pořadí zobrazení: **český název z Gemini analýzy → překlad Google Translate → původní název**.
Po analýze tedy zůstává název od Gemini a google překlad se nepoužije.

### Použití a metadata

V záložce Shrnutí je sekce **„Jak to mohu využít?"** s výslovným popisem, že jde o doporučení
AI Radaru, nikoli o tvrzení autora videa. Úplně dole na detailu videa je panel **Metadata videa**
(YouTube ID, kanál, publikováno, aktualizováno, délka, zdroj) s rozbalitelným popisem a původními
hodnotami. Demo režim byl odstraněn; aplikace pracuje jen s reálnými daty z RSS.

## 6. Data a zálohy

- Databáze: `data/ai-radar.db` (SQLite, WAL, cizí klíče zapnuté).
- Zálohy: `backups/` — `VACUUM INTO` + ověření `PRAGMA integrity_check`.
- Záloha se vytváří **před každou migrací** existující databáze a **před smazáním kanálu**
  (soubor `…-pre-delete-channel.db`). Smazání kanálu v UI je nevratné: odstraní kanál,
  jeho videa, analýzy, poznatky, dotazy i uložené položky, a proto chce výslovné potvrzení.
- Ruční záloha: tlačítko v Nastavení nebo `npm run db:backup`.
- Seznam kanálů jde kdykoli vyexportovat z `/kanaly` jako CSV nebo JSON
  (`/api/export/channels?format=csv|json`). Formát je shodný s importem, takže soubor lze
  naimportovat zpět nebo do jiné instance. Export respektuje aktivní hledání (`q`) a stav
  (`active=1|0`); pozastavené kanály se exportují také, ale import je vrací jako aktivní.
- Kontrola: `npm run db:check` (integrita, cizí klíče, počty, verze schématu).
- Migrace nikdy nemažou videa, analýzy ani nastavení.
- Testy používají výhradně izolované in-memory databáze.

## 7. Limity, které je potřeba znát

**YouTube RSS**

- Feed vrací přibližně posledních 15 videí na kanál, není to historický archiv.
- Feed neobsahuje délku videa ani statistiky. Délka proto zůstává neznámá (`NULL`), nikdy se neodhaduje.
- Kanál se přidává přes `@handle` (potřebuje API klíč) nebo přímo Channel ID (bez klíče).
- Adresy `/c/` a `/user/` nelze oficiálně převést — aplikace to řekne a nenabídne odhad.

**Gemini**

- Model musí podporovat video vstup; výchozí `gemini-3.5-flash-lite` jej podle dokumentace podporuje.
- Dlouhá videa: režim `AGENTIC` používá background execution (`background: true`, `store: true`).
- Free tier má limity (např. hodiny videa denně); tarif se v aplikaci neověřuje.
- Výsledek interakce je u Google uložen omezenou dobu (řádově dny). Po expiraci se stav
  označí `UNKNOWN`, ne „neexistuje“.

## 8. Automatizace (bez otevřeného prohlížeče)

RSS synchronizace je samostatné CLI, které pracuje se stejnou databází:

```powershell
npm run sync                          # všechny aktivní kanály
npm run sync -- --channel UCxxxx      # jeden kanál
```

**Windows Task Scheduler** — nová úloha, spouštět `cmd.exe` s argumenty:

```
/c cd /d "C:\cesta\k\projektu" && npm run sync
```

**cron / Synology**

```
17 */6 * * * cd /volume1/docker/ai-radar && /usr/local/bin/npm run sync >> /var/log/ai-radar-sync.log 2>&1
```

Frekvenci lze uložit v Nastavení (3/6/12/24 h) — je to jen preference pro plánovač;
aplikace sama na pozadí nic nespouští. Automatická AI analýza se nikdy nespouští.

## 9. Docker a Synology NAS

```bash
docker compose build
docker compose up -d
```

- Image neobsahuje `.env.local`, klíče ani produkční SQLite.
- Data jsou na volume `./data:/data` (`AI_RADAR_DB_PATH=/data/ai-radar.db`).
- Port je vázaný na `127.0.0.1`; pro vzdálený přístup použij HTTPS reverzní proxy.
- Postup pro Synology Container Manager, proxy a ochranu tokenem je v [docs/SYNOLOGY.md](docs/SYNOLOGY.md).
- Nasazení na konkrétní NAS je nutné provést samostatně; tento repozitář neobsahuje přístupové údaje k zařízení.

## 10. Bezpečnost

- Klíče pouze server-side; nikdy v klientském bundlu, DB ani logu. Chybové zprávy klíč redagují.
- Všechny externí požadavky jdou přes allowlist hostitelů, HTTPS, timeout a limit velikosti;
  přesměrování se validují.
- Měnící endpointy (`POST`) jsou povolené jen z localhostu, z hostitele v
  `AI_RADAR_ALLOWED_HOSTS`, nebo s hlavičkou `x-ai-radar-token`. Kontroluje se hlavička `Host`,
  kterou cizí web u požadavku na tento server nesfalšuje.
- Externí obsah (video, popis, titulky) je **nedůvěryhodný vstup**. Prompt výslovně zakazuje
  řídit se instrukcemi z videa; aplikace externí text nikdy nevykonává.
- Analytický endpoint přijímá jen video ID existující v databázi.
- `npm audit` je součástí kontrol; `npm audit fix --force` se nepoužívá.

## 11. Testy a kontrola kvality

```powershell
npm run typecheck     # tsc --noEmit
npm test              # node:test, izolované in-memory DB
npm run build         # produkční build
npm run db:check      # integrita SQLite
npm run db:backup     # záloha + ověření
```

Poznámky k testovacímu běhu:

- Testy **nikdy** neodesílají živé Gemini požadavky; pracují s mockovaným `fetch`.
- Živé YouTube RSS ověření je jen omezený počet read-only GETů, ne test celé aplikace.
- Testy běží přes `node --test` (projekt nemá Vitest, protože jeho Vite loader v tomto
  sandboxu volá `child_process` a prostředí ho blokuje; `node:test` je ekvivalent).

## 12. Známá omezení a co nebylo živě ověřeno

- **Živá Gemini analýza** nebyla odeslána (chybí klíč a nebylo uděleno schválení). Kontrakt
  je ověřený z oficiální dokumentace a pokrytý mockovanými testy. Stav: `LIVE_NOT_VERIFIED`.
- **Vizuální kontrola v prohlížeči** nebyla v prostředí agenta možná: Chrome/Edge v sandboxu
  nenaběhnou (blokace named pipes / Mojo IPC). Postup ruční kontroly je v
  `docs/MANUAL_VISUAL_CHECK.md`. Stav: `BROWSER_NOT_VERIFIED`.
- Délka videa zůstává neznámá, dokud ji zdroj neposkytne (RSS ji neobsahuje).
- Převod `@handle` vyžaduje YouTube API klíč; bez něj je potřeba vložit Channel ID.
- `npm install` v sandboxu vyžadoval `--ignore-scripts`; na běžném Windows se instaluje normálně.
- Aplikace je určená pro jednoho uživatele na localhostu, bez registrace a platební brány.

## 13. Struktura projektu

```
app/                     Next.js App Router (stránky + API route handlers)
  (app)/                 Přehled, Videa, Detail, Kanály, Na později, Zpracování, Znalosti…
  api/                   channels, sync, analyze, jobs, import, export, settings, backup, health
src/lib/
  db/                    SQLite klient, migrace, zálohy
  youtube/               normalizace vstupu, Atom parser, resolver, synchronizace
  gemini/                kontrakt, prompt, schéma, HTTP klient
  jobs/                  stavový automat analytických úloh
  analysis/              normalizace a uložení analýzy
  relevance/             odhad relevance z metadat
  import/                CSV/JSON parse, preview, commit
  export/                Markdown, JSON a CSV (analýza, poznatky, kanály)
  queries/               čtecí dotazy pro stránky
  api/                   guard měnících endpointů
scripts/                 sync-rss, db-check, db-backup, http-smoke
tests/                   node:test sady + fixtures
docs/                    manuální kontrola, architektura
```

## 14. Dokumentace

- `AI_RADAR_SPEC.md` — závazná produktová a technická specifikace.
- `docs/MANUAL_VISUAL_CHECK.md` — ruční vizuální kontrola na Windows (1440/1200/768/390 px).
- `docs/ARCHITECTURE.md` — rozhodnutí, datový model, stavový automat, bezpečnostní hranice.
- `PROGRESS.md` — průběh implementace a acceptance checks.
- `.ds-ledger.tsv` — rozhodovací ledger s důkazy.
