# Nasazení AI Radaru na Synology

Projekt se na Synology spouští jako Docker Compose projekt v aplikaci Container Manager. Docker image se sestaví přímo na NASu a databáze zůstane v trvalé složce `data/`.

## Požadavky

- Synology NAS s DSM 7 a nainstalovaným **Container Managerem**.
- Dostatek volného místa a paměti pro sestavení Node.js image.
- Přístup uživatele k projektu a oprávnění zapisovat do jeho složky.
- Pro přístup mimo NAS: vlastní DNS název a HTTPS certifikát v DSM.

## 1. Nahrajte projekt

Vytvořte například sdílenou složku `/volume1/docker/ai-radar` a nahrajte do ní zdrojové soubory projektu včetně `Dockerfile` a `docker-compose.yml`. Nepřenášejte `node_modules`, `.next` ani lokální databázi z vývojového počítače.

Ve stejné složce vytvořte `.env.local` podle `.env.example`. API klíče jsou volitelné. Pro přístup přes reverzní proxy nastavte také dlouhý náhodný token:

```dotenv
YOUTUBE_API_KEY=
GEMINI_API_KEY=
GEMINI_MODEL=gemini-3.5-flash-lite
GOOGLE_TRANSLATE_API_KEY=
AI_RADAR_ACCESS_TOKEN=vlozte-zde-dlouhy-nahodny-tajny-token
```

Použijte například správce hesel pro vygenerování tokenu. Neuložte `.env.local` do veřejného Git repozitáře ani jej neposílejte v URL.

## 2. Vytvořte Compose projekt

V **Container Manager → Project → Create** zadejte název `ai-radar`, jako cestu vyberte `/volume1/docker/ai-radar` a jako zdroj použijte existující `docker-compose.yml`. Nechte projekt při vytvoření sestavit a spustit.

Compose soubor:

- publikuje port `3000` pouze na loopback NASu (`127.0.0.1`),
- ukládá databázi do `/volume1/docker/ai-radar/data/ai-radar.db`,
- načítá tajné hodnoty z `.env.local`,
- automaticky restartuje kontejner a kontroluje `/api/health`.

Po prvním startu může sestavení trvat několik minut. V Container Manageru ověřte stav projektu a log kontejneru. Lokální kontrola zdraví z NASu je `http://127.0.0.1:3000/api/health`.

## 3. Přístup přes HTTPS reverzní proxy

Bezpečný výchozí přístup z LAN/VPN je přes DSM reverzní proxy. Aplikace vyžaduje token u všech zapisujících API požadavků z ne-lokálního hostitele. Prohlížeč jej sám nepřidává, proto jej přidá reverzní proxy.

1. V DSM nastavte DNS název a platný HTTPS certifikát.
2. V **Ovládací panel → Přihlašovací portál → Pokročilé → Reverzní proxy** vytvořte pravidlo: zdroj `HTTPS` na vašem názvu a portu `443`, cíl `HTTP` na `127.0.0.1:3000`.
3. V pravidle přidejte vlastní požadovaný HTTP header `x-ai-radar-token` se stejnou hodnotou jako `AI_RADAR_ACCESS_TOKEN` v `.env.local`.
4. Pravidlo omezte přes DSM access control profile nebo jinou přihlašovací/VPN vrstvu. Token v hlavičce je sdílené tajemství mezi proxy a aplikací; sám o sobě uživatele nepřihlašuje.
5. Otevřete HTTPS adresu a ověřte načtení dat, přidání kanálu a uložení změny. Zdravotní endpoint lze ověřit přes `/api/health`.

Tím zůstává port aplikace dostupný jen místně na NASu; z LAN a internetu se používá HTTPS proxy. Nevystavujte port `3000` přímo do internetu.

## Aktualizace a zálohy

Pro aktualizaci nahrajte novou verzi zdrojů a v Container Manageru projekt znovu sestavte/redeployujte. Před aktualizací zálohujte složku `data/`; aplikace také vytváří ověřené SQLite zálohy při migraci databáze. Zastavení projektu databázi nemaže. Nevolte akci **Clean/Delete**, pokud nechcete odstranit související Docker projekt/data.

Záloha minimálně musí obsahovat `/volume1/docker/ai-radar/data/`. `.env.local` zálohujte odděleně a důvěrně.

## Poznámky

- Kontejner běží jako neprivilegovaný uživatel. Pokud NAS odmítne zápis do `data/`, nastavte v File Station oprávnění zápisu pro kontejner; nepřepínejte jej na root bez důvodu.
- RSS synchronizaci lze naplánovat přes DSM Task Scheduler. Příkaz v kontejneru je třeba nastavit podle konkrétní verze Container Manageru; plánovaná synchronizace není podmínkou spuštění webové aplikace.
- Nasazení vyžaduje, aby procesor a DSM Docker Engine podporovaly image architekturu. Docker sestaví image na NASu, takže není třeba přenášet image z Windows.
