import Link from "next/link";
import type { Metadata } from "next";
import { Icon } from "@/components/ui/Icon";
import { getDb, getDbPath } from "@/lib/db/client";
import { getConfig } from "@/lib/config";
import { getPreferences } from "@/lib/preferences";
import { countAnalysesToday, getUsageSummary, recentUsage } from "@/lib/usage";
import { formatDateTimeCs } from "@/lib/shared/time";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "API a spotřeba" };

export default function UsagePage() {
  const db = getDb();
  const config = getConfig();
  const prefs = getPreferences(db);
  const summary = getUsageSummary(db);
  const usedToday = countAnalysesToday(db);
  const usage = recentUsage(db, 40);
  const remaining = prefs.analysisDailyLimit > 0 ? Math.max(0, prefs.analysisDailyLimit - usedToday) : null;

  return (
    <div className="page">
      <header className="page-head">
        <div>
          <div className="eyebrow">Náklady a kvóty</div>
          <h1>API a spotřeba</h1>
          <p className="lede">
            Evidence skutečně odeslaných požadavků. Cena se z API nedá spolehlivě zjistit, proto je
            označená jako NOT_VERIFIED. Aplikace nikdy netvrdí nulové náklady.
          </p>
        </div>
        <Link href="/nastaveni" className="btn">
          <Icon name="settings" size={16} /> Nastavení
        </Link>
      </header>

      <div className="kpi-row" style={{ marginBottom: 18 }}>
        <div className="kpi">
          <span className="kpi-label">Analytické POST</span>
          <span className="kpi-value">{summary.geminiCreateRequests}</span>
          <span className="kpi-hint">skutečně odeslané požadavky</span>
        </div>
        <div className="kpi">
          <span className="kpi-label">Kontroly stavu (GET)</span>
          <span className="kpi-value">{summary.geminiStatusRequests}</span>
          <span className="kpi-hint">nezakládají novou úlohu</span>
        </div>
        <div className="kpi">
          <span className="kpi-label">Dnes / limit</span>
          <span className="kpi-value">
            {usedToday}
            {prefs.analysisDailyLimit > 0 ? ` / ${prefs.analysisDailyLimit}` : ""}
          </span>
          <span className="kpi-hint">
            {remaining === null ? "limit vypnutý" : `zbývá ${remaining}`}
          </span>
        </div>
        <div className="kpi">
          <span className="kpi-label">Tokeny</span>
          <span className="kpi-value">{summary.tokenInput + summary.tokenOutput}</span>
          <span className="kpi-hint">
            {summary.tokenInput} vstup · {summary.tokenOutput} výstup
          </span>
        </div>
      </div>

      <div className="detail-grid">
        <section className="panel" style={{ overflow: "hidden" }}>
          <div className="panel-head">
            <h2>Poslední požadavky</h2>
            <span className="tiny muted">{usage.length} záznamů</span>
          </div>
          {usage.length === 0 ? (
            <div className="panel-body">
              <p className="muted" style={{ margin: 0 }}>
                Zatím žádné zaznamenané požadavky. RSS synchronizace se do spotřeby zapisuje jen u
                volání YouTube API přes @handle.
              </p>
            </div>
          ) : (
            <div style={{ overflowX: "auto" }}>
              <table className="table">
                <thead>
                  <tr>
                    <th>Kdy</th>
                    <th>Poskytovatel</th>
                    <th>Operace</th>
                    <th>Model</th>
                    <th>Tokeny</th>
                    <th>HTTP</th>
                    <th>Cena</th>
                  </tr>
                </thead>
                <tbody>
                  {usage.map((row) => (
                    <tr key={row.id}>
                      <td className="tiny">{formatDateTimeCs(row.created_at)}</td>
                      <td className="tiny">{row.provider}</td>
                      <td className="mono tiny">{row.operation}</td>
                      <td className="mono tiny">{row.model ?? "—"}</td>
                      <td className="mono tiny">
                        {row.token_input != null || row.token_output != null
                          ? `${row.token_input ?? "?"} / ${row.token_output ?? "?"}`
                          : "—"}
                      </td>
                      <td className="tiny">{row.http_status ?? "—"}</td>
                      <td>
                        <span className="chip chip-warn">{row.cost_status}</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        <aside style={{ display: "grid", gap: 14 }}>
          <section className="panel" style={{ padding: 16 }}>
            <div className="eyebrow">Konfigurace</div>
            <div style={{ display: "grid", gap: 8, marginTop: 10, fontSize: 13.5 }}>
              <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
                <span className="muted">YouTube API</span>
                <span className={config.youtubeApiKey ? "chip chip-success" : "chip chip-neutral"}>
                  {config.youtubeApiKey ? "klíč nastaven" : "bez klíče"}
                </span>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
                <span className="muted">Gemini API</span>
                <span className={config.geminiApiKey ? "chip chip-success" : "chip chip-neutral"}>
                  {config.geminiApiKey ? "klíč nastaven" : "bez klíče"}
                </span>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
                <span className="muted">Model</span>
                <span className="mono">{config.geminiModel}</span>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
                <span className="muted">Režim</span>
                <span>ruční po potvrzení</span>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
                <span className="muted">Automatická analýza</span>
                <span>vypnuto</span>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
                <span className="muted">YouTube volání</span>
                <span>{summary.youtubeRequests}</span>
              </div>
            </div>
            {!config.geminiApiKey ? (
              <p className="tiny" style={{ marginTop: 10, color: "#F0C483" }}>
                Bez GEMINI_API_KEY nelze analýzu odeslat. Zbytek aplikace funguje bez klíče.
              </p>
            ) : null}
          </section>

          <section className="panel" style={{ padding: 16 }}>
            <div className="eyebrow">Proč NOT_VERIFIED</div>
            <p className="tiny muted" style={{ marginTop: 8 }}>
              Gemini API nevrací fakturovanou cenu a <span className="mono">serviceTier</span> není
              doklad o tarifu. Aplikace proto eviduje jen počty požadavků a tokeny, které poskytovatel
              skutečně vrátí. Ceník si ověř u Google.
            </p>
            <a
              className="btn btn-sm"
              href="https://ai.google.dev/gemini-api/docs/pricing"
              target="_blank"
              rel="noreferrer noopener"
            >
              <Icon name="external" size={13} /> Oficiální ceník
            </a>
          </section>

          <section className="panel" style={{ padding: 16 }}>
            <div className="eyebrow">Kde jsou data</div>
            <p className="tiny muted" style={{ marginTop: 8, wordBreak: "break-all" }}>
              <span className="mono">{getDbPath()}</span>
            </p>
            <p className="tiny muted">
              Zálohy jsou ve složce <span className="mono">backups/</span> vedle databáze.
            </p>
          </section>
        </aside>
      </div>
    </div>
  );
}
