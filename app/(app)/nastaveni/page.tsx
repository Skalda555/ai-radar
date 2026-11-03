import fs from "node:fs";
import Link from "next/link";
import type { Metadata } from "next";
import { Icon } from "@/components/ui/Icon";
import { BackupButton, SettingsForm } from "@/components/settings/SettingsForm";
import { getDb, getDbPath, appliedVersions, integrityCheck } from "@/lib/db/client";
import { listBackups } from "@/lib/db/backup";
import { getPreferences } from "@/lib/preferences";
import { getConfig } from "@/lib/config";
import { countAnalysesToday, getUsageSummary } from "@/lib/usage";


export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Nastavení" };

export default function SettingsPage() {
  const db = getDb();
  const prefs = getPreferences(db);
  const config = getConfig();
  const dbPath = getDbPath();
  const backups = listBackups(dbPath);
  const usage = getUsageSummary(db);
  const usedToday = countAnalysesToday(db);
  const sizeKb = fs.existsSync(dbPath) ? Math.round(fs.statSync(dbPath).size / 1024) : 0;

  return (
    <div className="page">
      <header className="page-head">
        <div>
          <div className="eyebrow">Konfigurace</div>
          <h1>Nastavení</h1>
          <p className="lede">
            Provoz aplikace, klíče, limity a data. Klíče se nikdy nezobrazují a neukládají do
            databáze – čtou se jen ze serverového prostředí.
          </p>
        </div>
        <Link href="/api-spotreba" className="btn">
          <Icon name="usage" size={16} /> API a spotřeba
        </Link>
      </header>

      <div className="detail-grid">
        <section className="panel" style={{ padding: 20 }}>
          <h2 style={{ marginBottom: 14 }}>Provoz a chování</h2>
          <SettingsForm
            initial={{
              analysisDailyLimit: prefs.analysisDailyLimit,
              syncIntervalHours: prefs.syncIntervalHours,
              defaultAnalysisMode: prefs.defaultAnalysisMode,
              interestProfile: prefs.interestProfile,
            }}
          />
        </section>

        <aside style={{ display: "grid", gap: 14 }}>
          <section className="panel" style={{ padding: 16 }}>
            <div className="eyebrow">API klíče</div>
            <div style={{ display: "grid", gap: 9, marginTop: 10, fontSize: 13.5 }}>
              <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
                <span className="muted">YouTube API</span>
                <span className={config.youtubeApiKey ? "chip chip-success" : "chip chip-neutral"}>
                  {config.youtubeApiKey ? "nakonfigurováno" : "chybí"}
                </span>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
                <span className="muted">Gemini API</span>
                <span className={config.geminiApiKey ? "chip chip-success" : "chip chip-neutral"}>
                  {config.geminiApiKey ? "nakonfigurováno" : "chybí"}
                </span>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
                <span className="muted">Google Translate</span>
                <span className={config.googleTranslateApiKey ? "chip chip-success" : "chip chip-neutral"}>
                  {config.googleTranslateApiKey ? "nakonfigurováno" : "chybí"}
                </span>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
                <span className="muted">Model</span>
                <span className="mono">{config.geminiModel}</span>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
                <span className="muted">Denní limit</span>
                <span>
                  {usedToday} / {prefs.analysisDailyLimit}
                </span>
              </div>
            </div>
            <p className="tiny muted" style={{ marginTop: 10 }}>
              Klíče patří do <span className="mono">.env.local</span> v kořeni projektu. Soubor je v{" "}
              <span className="mono">.gitignore</span>.
            </p>
          </section>

          <section className="panel" style={{ padding: 16 }}>
            <div className="eyebrow">Databáze</div>
            <div style={{ display: "grid", gap: 6, marginTop: 10, fontSize: 13 }}>
              <span className="mono" style={{ wordBreak: "break-all" }}>{dbPath}</span>
              <span className="muted">
                {sizeKb} kB · schéma v{appliedVersions(db).join(", ") || "?"} · integrita:{" "}
                <strong style={{ color: integrityCheck(db) === "ok" ? "#8FE0BD" : "#E46B6B" }}>
                  {integrityCheck(db)}
                </strong>
              </span>
              <span className="muted">
                Záloh: {backups.length}
                {backups[0] ? ` (nejnovější ${(backups[0].size / 1024).toFixed(0)} kB)` : ""}
              </span>
            </div>
            <div style={{ marginTop: 12 }}>
              <BackupButton />
            </div>
            {backups.length > 0 ? (
              <ul className="tiny muted" style={{ margin: "12px 0 0 16px", padding: 0 }}>
                {backups.slice(0, 4).map((backup) => (
                  <li key={backup.name} style={{ marginBottom: 3, wordBreak: "break-all" }}>
                    {backup.name} · {(backup.size / 1024).toFixed(0)} kB
                  </li>
                ))}
              </ul>
            ) : null}
          </section>

          <section className="panel" style={{ padding: 16 }}>
            <div className="eyebrow">Automatizace</div>
            <pre
              className="mono"
              style={{
                margin: "10px 0 0",
                padding: 10,
                background: "#0D1319",
                borderRadius: 8,
                overflowX: "auto",
                fontSize: 12,
                lineHeight: 1.6,
              }}
            >
{`npm run sync          # RSS všechny aktivní kanály
npm run sync -- --channel UC...
npm run db:check      # integrita a počty
npm run db:backup     # záloha + ověření`}
            </pre>
            <p className="tiny muted" style={{ marginTop: 8 }}>
              Plánovač (Windows Task Scheduler / cron) spouští jen RSS. Gemini se nikdy nespouští
              automaticky.
            </p>
          </section>

          <section className="panel" style={{ padding: 16 }}>
            <div className="eyebrow">Spotřeba</div>
            <div style={{ display: "grid", gap: 6, marginTop: 10, fontSize: 13 }}>
              <span className="muted">
                Gemini požadavky celkem: <strong>{usage.geminiCreateRequests}</strong> create /{" "}
                {usage.geminiStatusRequests} status
              </span>
              <span className="muted">
                YouTube API volání: <strong>{usage.youtubeRequests}</strong>
              </span>
              <span className="muted">
                Tokeny: {usage.tokenInput} vstup / {usage.tokenOutput} výstup
              </span>
              <span className="chip chip-warn" style={{ justifySelf: "start" }}>
                cena NOT_VERIFIED
              </span>
            </div>
          </section>
        </aside>
      </div>
    </div>
  );
}
