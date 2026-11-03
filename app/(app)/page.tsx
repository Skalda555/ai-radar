import Link from "next/link";
import { Icon } from "@/components/ui/Icon";
import { VideoCard } from "@/components/videos/VideoCard";
import { SyncButton } from "@/components/channels/SyncButton";
import { AddChannelForm } from "@/components/channels/AddChannelForm";
import { getDb } from "@/lib/db/client";
import { getDashboardData } from "@/lib/queries/dashboard";
import { countChannels } from "@/lib/channels/service";
import { formatDateTimeCs, relativeTimeCs } from "@/lib/shared/time";

export const dynamic = "force-dynamic";

export default function DashboardPage() {
  const db = getDb();
  const data = getDashboardData(db);
  const channels = countChannels(db);
  const hasAnalysis = data.important.some((video) => video.analysis_score !== null);

  return (
    <div className="page">
      <header className="page-head">
        <div>
          <div className="eyebrow">AI Radar · pracovní přehled</div>
          <h1>Přehled AI novinek</h1>
          <p className="lede">
            Co nového přišlo ze sledovaných kanálů, co stojí za pozornost a co se z toho dá rovnou
            použít. Data jsou z reálných YouTube feedů.
          </p>
        </div>
        <div style={{ display: "flex", gap: 9, flexWrap: "wrap" }}>
          <SyncButton />
          <Link href="/kanaly" className="btn">
            <Icon name="plus" size={16} />
            Přidat kanál
          </Link>
        </div>
      </header>

      {channels.total === 0 ? (
        <section className="panel-raised" style={{ padding: 24, marginBottom: 22 }}>
          <div className="eyebrow" style={{ marginBottom: 8 }}>
            První spuštění
          </div>
          <h2 style={{ marginBottom: 6 }}>Začni sledováním prvního YouTube kanálu.</h2>
          <p className="lede" style={{ marginBottom: 18 }}>
            Vlož adresu kanálu nebo rovnou stabilní Channel ID. Aplikace stáhne veřejný Atom feed,
            uloží videa do lokální SQLite a spočítá levný odhad relevance z metadat. Žádná placená AI
            analýza se nespustí sama.
          </p>
          <AddChannelForm />
        </section>
      ) : null}

      <div className="kpi-row">
        <div className="kpi">
          <span className="kpi-label">
            <Icon name="videos" size={14} /> Nová videa
          </span>
          <span className="kpi-value">{data.newVideos7d}</span>
          <span className="kpi-hint">zaznamenaná za posledních 7 dní</span>
        </div>
        <div className="kpi">
          <span className="kpi-label">
            <Icon name="check" size={14} /> Hotové analýzy
          </span>
          <span className="kpi-value">{data.completedAnalyses}</span>
          <span className="kpi-hint">
            {data.failedJobs > 0 ? `${data.failedJobs} úloh selhalo` : "bez selhání"}
          </span>
        </div>
        <div className="kpi">
          <span className="kpi-label">
            <Icon name="processing" size={14} /> Čeká na analýzu
          </span>
          <span className="kpi-value">{data.pendingAnalyses}</span>
          <span className="kpi-hint">aktivní nebo neznámé úlohy</span>
        </div>
        <div className="kpi">
          <span className="kpi-label">
            <Icon name="saved" size={14} /> Na později
          </span>
          <span className="kpi-value">{data.savedCount}</span>
          <span className="kpi-hint">z {data.totalVideos} uložených videí</span>
        </div>
      </div>

      {data.lastSync ? (
        <div
          style={{
            display: "flex",
            gap: 14,
            alignItems: "center",
            flexWrap: "wrap",
            marginTop: 14,
            fontSize: 13,
            color: "var(--color-muted)",
          }}
        >
          <span>
            Poslední synchronizace:{" "}
            <strong style={{ color: "var(--color-ink)" }}>{formatDateTimeCs(data.lastSync.finishedAt)}</strong>{" "}
            ({relativeTimeCs(data.lastSync.finishedAt)})
          </span>
          <span
            className={data.lastSync.status === "OK" ? "chip chip-success" : "chip chip-danger"}
          >
            {data.lastSync.status === "OK" ? "bez chyb" : "s chybou"}
          </span>
          {data.lastSync.error ? (
            <span className="tiny" style={{ color: "#F0A3A3" }}>
              {data.lastSync.error}
            </span>
          ) : null}
        </div>
      ) : null}

      {data.totalVideos === 0 && channels.total > 0 ? (
        <div className="empty" style={{ marginTop: 26 }}>
          <h3>Kanály jsou přidané, ale zatím bez videí</h3>
          <p>Spusť synchronizaci. Feed vrací posledních zhruba 15 videí na kanál.</p>
          <SyncButton label="Synchronizovat nyní" />
        </div>
      ) : null}

      {data.important.length > 0 ? (
        <section>
          <div className="section-head">
            <h2>
              <Icon name="spark" size={18} /> Nejdůležitější novinky
            </h2>
            <span className="tiny muted">
              {hasAnalysis ? "podle relevance po analýze" : "odhad z metadat, bez AI analýzy"}
            </span>
          </div>
          <div className="card-grid">
            {data.important.map((video) => (
              <VideoCard key={video.video_id} video={video} />
            ))}
          </div>
        </section>
      ) : null}

      {data.latest.rows.length > 0 ? (
        <section>
          <div className="section-head">
            <h2>
              <Icon name="videos" size={18} /> Nejnovější videa
            </h2>
            <Link href="/videa" className="btn btn-sm btn-ghost">
              Zobrazit všechna <Icon name="arrowRight" size={14} />
            </Link>
          </div>
          <div className="card-grid">
            {data.latest.rows.map((video) => (
              <VideoCard key={video.video_id} video={video} />
            ))}
          </div>
        </section>
      ) : null}

    </div>
  );
}
