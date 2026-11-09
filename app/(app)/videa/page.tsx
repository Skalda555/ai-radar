import Link from "next/link";
import { Icon } from "@/components/ui/Icon";
import { VideoCard } from "@/components/videos/VideoCard";
import { FilterBar, Pagination, parseSort, parseStatus } from "@/components/videos/FilterBar";
import { getDb } from "@/lib/db/client";
import { countUntranslatedTitles } from "@/lib/translate/titles";
import { TranslateTitlesButton } from "@/components/videos/TranslateTitlesButton";
import { listCategories, listTopics, listVideos, DEFAULT_SORT } from "@/lib/queries/videos";
import { dbAll } from "@/lib/types";
import type { Metadata } from "next";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Videa" };

type SearchParams = Record<string, string | string[] | undefined>;

function one(value: string | string[] | undefined): string {
  if (Array.isArray(value)) return value[0] ?? "";
  return value ?? "";
}

export default async function VideosPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const sp = await searchParams;
  const db = getDb();

  const q = one(sp.q);
  const channel = one(sp.channel);
  const category = one(sp.category);
  const topic = one(sp.topic);
  const date = one(sp.date) || "all";
  const status = one(sp.status) || "ALL";
  // The list opens on the relevance estimate; "Nejnovější" stays a visible option.
  const sort = parseSort(one(sp.sort), DEFAULT_SORT);
  const minRelevance = one(sp.minRelevance);
  const page = Math.max(1, Number.parseInt(one(sp.page) || "1", 10) || 1);

  const result = listVideos(db, {
    q,
    channel: channel || undefined,
    category: category || undefined,
    topic: topic || undefined,
    date,
    status: parseStatus(status),
    sort,
    minRelevance: Number.parseFloat(minRelevance) || 0,
    page,
    perPage: 24,
  });

  const channels = dbAll<{ channel_id: string; title: string; video_count: number }>(
    db,
    `SELECT c.channel_id, c.title,
            (SELECT COUNT(*) FROM videos v WHERE v.channel_id = c.channel_id) AS video_count
       FROM channels c
      ORDER BY c.title COLLATE NOCASE`,
  );
  const topics = listTopics(db);
  const categories = listCategories(db);
  const untranslated = countUntranslatedTitles(db);

  const values = { q, channel, topic, category, date, status, sort, minRelevance };

  return (
    <div className="page videa-page">
      <header className="page-head">
        <div>
          <div className="eyebrow">Knihovna videí</div>
          <h1>Videa</h1>
          <p className="lede">
            Prohlédni synchronizované YouTube novinky podle kanálu, tématu i stavu analýzy.
          </p>
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <TranslateTitlesButton pending={untranslated} />
          <Link href="/kanaly" className="btn">
            <Icon name="sync" size={16} />
            Synchronizace a kanály
          </Link>
        </div>
      </header>

      <FilterBar
        action="/videa"
        channels={channels}
        topics={topics}
        categories={categories}
        values={values}
      />

      <div className="result-bar">
        <span>
          {result.total} videí odpovídá filtru
          {result.appliedTokens.length > 0 ? ` · ${result.appliedTokens.join(", ")}` : ""}
        </span>
        <span>Výsledky z lokální databáze</span>
      </div>

      {result.rows.length === 0 ? (
        <div className="empty">
          <h3>Žádné video neodpovídá filtru</h3>
          <p>
            Zkus jiný výraz, širší datum nebo zruš filtry. Pokud je databáze prázdná, přidej kanál a
            spusť synchronizaci.
          </p>
          <div style={{ display: "flex", gap: 9, justifyContent: "center", flexWrap: "wrap" }}>
            <Link href="/videa" className="btn">
              Zrušit filtry
            </Link>
            <Link href="/kanaly" className="btn btn-primary">
              Spravovat kanály
            </Link>
          </div>
        </div>
      ) : (
        <div className="card-grid">
          {result.rows.map((video) => (
            <VideoCard key={video.video_id} video={video} />
          ))}
        </div>
      )}

      <Pagination action="/videa" params={values} page={result.page} pages={result.pages} />
    </div>
  );
}
