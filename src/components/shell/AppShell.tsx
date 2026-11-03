import Link from "next/link";
import { Icon } from "../ui/Icon";
import { NavLinks } from "./NavLinks";
import { MobileNav } from "./MobileNav";
import { buildNav } from "./nav";
import { relativeTimeCs } from "@/lib/shared/time";
import type { ShellData } from "@/lib/queries/shell";

function ServicePill({ ok, label }: { ok: boolean; label: string }) {
  return (
    <span className="signal-item" title={ok ? `${label}: nakonfigurováno` : `${label}: chybí klíč`}>
      <span className={ok ? "chip chip-success" : "chip chip-neutral"}>
        <span className="dot" />
        {label}
      </span>
    </span>
  );
}

export function AppShell({ data, children }: { data: ShellData; children: React.ReactNode }) {
  const groups = buildNav(data);
  const syncOk = data.lastSync?.status === "OK";

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <Link href="/" className="brand">
          <span className="brand-mark">
            <Icon name="radar" size={19} />
          </span>
          <span>
            <span className="brand-title">AI Radar</span>
            <span className="brand-sub" style={{ display: "block" }}>
              méně šumu
            </span>
          </span>
        </Link>

        <NavLinks groups={groups} />

        <div style={{ marginTop: "auto", display: "grid", gap: 10 }}>
          <div className="panel" style={{ padding: "11px 12px" }}>
            <div className="tiny muted" style={{ marginBottom: 6 }}>
              Stav služeb
            </div>
            <div style={{ display: "grid", gap: 6 }}>
              <div className="signal-item">
                <span className={data.youtubeKey ? "dot" : "dot"} style={{ color: data.youtubeKey ? "#35B989" : "#8492a2" }} />
                <span className="tiny">YouTube API {data.youtubeKey ? "připojeno" : "bez klíče"}</span>
              </div>
              <div className="signal-item">
                <span className="dot" style={{ color: data.geminiKey ? "#35B989" : "#8492a2" }} />
                <span className="tiny">Gemini {data.geminiKey ? "připojeno" : "bez klíče"}</span>
              </div>
              <div className="signal-item">
                <span className="dot" style={{ color: syncOk ? "#35B989" : "#8492a2" }} />
                <span className="tiny">RSS {data.lastSync ? relativeTimeCs(data.lastSync.finishedAt) : "nesynchronizováno"}</span>
              </div>
            </div>
          </div>
          <div className="tiny" style={{ color: "#6d7a88", padding: "0 10px" }}>
            Verze 1.0 · lokální provoz
          </div>
        </div>
      </aside>

      <div className="main-col">
        <MobileNav groups={groups} />

        <div className="signal-rail" aria-label="Stav systému">
          <span className="signal-item">
            <span className={syncOk ? "dot dot-pulse" : "dot"} style={{ color: syncOk ? "#35B989" : "#E9A548" }} />
            <span>
              {data.lastSync ? (
                <>
                  Synchronizace <strong>{relativeTimeCs(data.lastSync.finishedAt)}</strong>
                  {data.lastSync.videosNew > 0 ? <> · <strong>{data.lastSync.videosNew}</strong> nových</> : null}
                </>
              ) : (
                "Zatím žádná synchronizace"
              )}
            </span>
          </span>

          <span style={{ width: 1, height: 18, background: "rgba(255,255,255,0.1)" }} aria-hidden="true" />

          <span className="signal-item">
            <Icon name="videos" size={14} />
            <strong>{data.videoCount}</strong> videí
          </span>
          <span className="signal-item">
            <Icon name="knowledge" size={14} />
            <strong>{data.knowledgeCount}</strong> poznatků
          </span>
          <span className="signal-item">
            <Icon name="processing" size={14} />
            <strong>{data.activeJobs}</strong> běžících · <strong>{data.pendingAnalyses}</strong> čeká
          </span>

          <span style={{ marginLeft: "auto", display: "flex", gap: 8 }}>
            <ServicePill ok={data.youtubeKey} label="YouTube API" />
            <ServicePill ok={data.geminiKey} label="Gemini" />
          </span>
        </div>

        <main>{children}</main>
      </div>
    </div>
  );
}
