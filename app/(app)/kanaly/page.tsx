import Link from "next/link";
import type { Metadata } from "next";
import { Icon } from "@/components/ui/Icon";
import { AddChannelForm } from "@/components/channels/AddChannelForm";
import { listCategories } from "@/lib/queries/videos";
import { SyncButton } from "@/components/channels/SyncButton";
import { ChannelToggle } from "@/components/channels/ChannelToggle";
import { ImportDialog } from "@/components/channels/ImportDialog";
import { DeleteChannelButton } from "@/components/channels/DeleteChannelButton";
import { CategoryEditor } from "@/components/channels/CategoryEditor";
import { ExportChannelsLinks } from "@/components/channels/ExportChannelsLinks";
import { getDb } from "@/lib/db/client";
import { countChannels, listChannels } from "@/lib/channels/service";
import { filterChannels, hasSearchTokens } from "@/lib/channels/filter";
import { lastSyncRun } from "@/lib/youtube/sync";
import { getConfig } from "@/lib/config";
import { formatDateTimeCs, relativeTimeCs } from "@/lib/shared/time";
import { statusClass } from "@/lib/ui/labels";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Sledované kanály" };

type SearchParams = Record<string, string | string[] | undefined>;

function one(value: string | string[] | undefined): string {
  if (Array.isArray(value)) return value[0] ?? "";
  return value ?? "";
}

export default async function ChannelsPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const sp = await searchParams;
  const query = one(sp.q).trim();
  const db = getDb();
  const allChannels = listChannels(db);
  const filtering = hasSearchTokens(query);
  const channels = filterChannels(allChannels, query);
  const counts = countChannels(db);
  const run = lastSyncRun(db);
  const categories = listCategories(db);
  const hasYoutubeKey = getConfig().youtubeApiKey !== null;

  return (
    <div className="page">
      <header className="page-head">
        <div>
          <div className="eyebrow">Zdroje</div>
          <h1>Sledované kanály</h1>
          <p className="lede">
            Kanály se čtou z veřejného YouTube Atom feedu. Feed vrací posledních zhruba 15 videí,
            není to historický archiv. Synchronizace nikdy sama nespouští AI analýzu.
          </p>
        </div>
        <div style={{ display: "flex", gap: 9, flexWrap: "wrap" }}>
          <SyncButton />
          <ImportDialog />
          <ExportChannelsLinks query={query} count={channels.length} />
        </div>
      </header>

      {!hasYoutubeKey ? (
        <div className="notice notice-warn" style={{ marginBottom: 16, display: "block" }}>
          <strong>YOUTUBE_API_KEY není nastavený.</strong> Přímé Channel ID (UC… + 22 znaků) funguje i
          bez klíče. Převod @handle na Channel ID klíč vyžaduje – aplikace ho nikdy neodhaduje.
        </div>
      ) : null}

      <div style={{ display: "grid", gridTemplateColumns: "minmax(0,1fr)", gap: 16, marginBottom: 20 }}>
        <section className="panel-raised" style={{ padding: 18 }}>
          <h2 style={{ marginBottom: 8, fontSize: 15 }}>Přidat kanál</h2>
          <AddChannelForm compact suggestions={categories} />
        </section>
      </div>

      {run ? (
        <div
          className="panel"
          style={{ padding: 14, marginBottom: 18, display: "flex", gap: 12, flexWrap: "wrap", alignItems: "center" }}
        >
          <span className={statusClass(run.status)}>{run.status}</span>
          <span className="tiny muted">
            Poslední synchronizace: {formatDateTimeCs(run.finished_at)} ({relativeTimeCs(run.finished_at)}) ·
            zdroj {run.trigger} · nových {run.videos_new} · aktualizováno {run.videos_updated}
          </span>
          {run.error ? <span className="tiny" style={{ color: "#F0A3A3" }}>{run.error}</span> : null}
        </div>
      ) : null}

      <div className="section-head">
        <h2>
          <Icon name="channels" size={18} /> Kanály ({channels.length})
          {filtering ? <span className="muted" style={{ fontWeight: 400 }}> z {allChannels.length}</span> : null}
        </h2>
        <span className="tiny muted">{counts.active} aktivních</span>
      </div>

      <form method="get" action="/kanaly" className="channel-search" role="search" aria-label="Hledat v kanálech">
        <div className="filter-input-wrap" style={{ flex: 1, minWidth: 220 }}>
          <span className="filter-input-icon" aria-hidden="true">
            <Icon name="search" size={15} />
          </span>
          <input
            name="q"
            type="search"
            className="input"
            defaultValue={query}
            placeholder="Hledat podle názvu, handle, ID nebo kategorie…"
            aria-label="Hledat v kanálech"
          />
        </div>
        <button type="submit" className="btn btn-primary" style={{ minHeight: 44 }}>
          Hledat
        </button>
        {filtering ? (
          <Link href="/kanaly" className="btn btn-sm btn-ghost">
            Zrušit
          </Link>
        ) : null}
      </form>

      <p className="tiny muted" style={{ margin: "0 0 14px" }}>
        Export stáhne právě zobrazené kanály — s aktivním hledáním jen ty, které odpovídají.
        Formát CSV i JSON je stejný jako u importu, takže soubor jde zase naimportovat.
      </p>

      {channels.length === 0 ? (
        <div className="empty">
          <h3>{filtering ? "Žádný kanál neodpovídá hledání" : "Zatím žádné kanály"}</h3>
          <p>
            {filtering
              ? "Zkus jiný výraz — hledá se v názvu, handle, Channel ID i kategorii."
              : "Začni vložením @handle, adresy kanálu nebo přímo Channel ID. Nebo použij import CSV/JSON."}
          </p>
          {filtering ? (
            <Link href="/kanaly" className="btn">
              Zrušit hledání
            </Link>
          ) : null}
        </div>
      ) : (
        <div style={{ display: "grid", gap: 10 }}>
          {channels.map((channel) => (
            <article key={channel.channel_id} className="panel" style={{ padding: 14 }}>
              <div className="channel-row">
                <div style={{ minWidth: 0 }}>
                  <div style={{ display: "flex", gap: 7, alignItems: "center", flexWrap: "wrap" }}>
                    <h3 style={{ fontSize: 15 }}>{channel.title}</h3>
                    {!channel.is_active ? <span className="chip chip-neutral">pozastaveno</span> : null}
                    <span className="chip chip-neutral">priorita {channel.priority}/5</span>
                    <CategoryEditor channelId={channel.channel_id} category={channel.category} suggestions={categories} />
                  </div>
                  <div className="video-meta" style={{ marginTop: 5 }}>
                    <span className="mono">{channel.channel_id}</span>
                    {channel.handle ? <span>@{channel.handle.replace(/^@/, "")}</span> : null}
                    <span>{channel.video_count} videí</span>
                    <span>{channel.analyzed_count} analýz</span>
                    {channel.last_synced_at ? (
                      <span title={formatDateTimeCs(channel.last_synced_at)}>
                        sync {relativeTimeCs(channel.last_synced_at)}
                      </span>
                    ) : (
                      <span>nesynchronizováno</span>
                    )}
                  </div>
                  {channel.last_sync_error ? (
                    <div className="tiny" style={{ color: "#F0A3A3", marginTop: 6, wordBreak: "break-word" }}>
                      {channel.last_sync_error}
                    </div>
                  ) : null}
                </div>

                <div className="channel-actions">
                  <Link href={`/videa?channel=${channel.channel_id}`} className="btn btn-sm">
                    Videa
                  </Link>
                  <SyncButton channelId={channel.channel_id} label="Synchronizovat" variant="plain" />
                  <ChannelToggle channelId={channel.channel_id} active={Boolean(channel.is_active)} />
                  <DeleteChannelButton
                    channelId={channel.channel_id}
                    title={channel.title}
                    videos={channel.video_count}
                    analyses={channel.analyzed_count}
                    saved={channel.saved_count}
                  />
                  <a
                    className="btn btn-sm btn-ghost"
                    href={`https://www.youtube.com/channel/${channel.channel_id}`}
                    target="_blank"
                    rel="noreferrer noopener"
                    aria-label={`Otevřít ${channel.title} na YouTube`}
                    title="Otevřít na YouTube"
                  >
                    <Icon name="external" size={14} />
                  </a>
                </div>
              </div>
            </article>
          ))}
        </div>
      )}

      <p className="tiny muted" style={{ marginTop: 18 }}>
        Automatické plánování: frekvenci nastavíš v <Link href="/nastaveni" style={{ color: "#B6AEE8" }}>Nastavení</Link>.
        CLI synchronizace pro Task Scheduler: <span className="mono">npm run sync</span>.
      </p>
    </div>
  );
}
