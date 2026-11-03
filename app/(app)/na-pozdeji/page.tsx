import Link from "next/link";
import { Icon } from "@/components/ui/Icon";
import { VideoCard } from "@/components/videos/VideoCard";
import { FilterBar, Pagination, parseSort, parseStatus } from "@/components/videos/FilterBar";
import { getDb } from "@/lib/db/client";
import { listCategories, listTopics, listVideos } from "@/lib/queries/videos";
import { dbAll } from "@/lib/types";
import type { Metadata } from "next";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Na později" };

type SearchParams = Record<string, string | string[] | undefined>;

function one(value: string | string[] | undefined): string {
  if (Array.isArray(value)) return value[0] ?? "";
  return value ?? "";
}

export default async function SavedPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const sp = await searchParams;
  const db = getDb();

  const q = one(sp.q);
  const channel = one(sp.channel);
  const category = one(sp.category);
  const topic = one(sp.topic);
  const date = one(sp.date) || "all";
  const status = one(sp.status) || "ALL";
  const sort = one(sp.sort) || "newest";
  const minRelevance = one(sp.minRelevance);
  const page = Math.max(1, Number.parseInt(one(sp.page) || "1", 10) || 1);

  const result = listVideos(db, {
    savedOnly: true,
    q,
    channel: channel || undefined,
    category: category || undefined,
    topic: topic || undefined,
    date,
    status: parseStatus(status),
    sort: parseSort(sort),
    minRelevance: Number.parseFloat(minRelevance) || 0,
    page,
    perPage: 24,
  });

  const totalSaved = listVideos(db, { savedOnly: true, perPage: 1 }).total;
  const hasFilters =
    Boolean(q || channel || topic || category || minRelevance) ||
    date !== "all" ||
    status !== "ALL" ||
    sort !== "newest";

  const channels = dbAll<{ channel_id: string; title: string; video_count: number }>(
    db,
    `SELECT c.channel_id, c.title,
            (SELECT COUNT(*) FROM videos v WHERE v.channel_id = c.channel_id) AS video_count
       FROM channels c
      ORDER BY c.title COLLATE NOCASE`,
  );
  const topics = listTopics(db);
  const categories = listCategories(db);

  const values = { q, channel, topic, category, date, status, sort, minRelevance };

  return (
    <div className="page videa-page">
      <header className="page-head">
        <div>
          <div className="eyebrow">Fronta ke zhlédnutí</div>
          <h1>Na později</h1>
          <p className="lede">
            Videa, která sis odložil. Uložení přežije restart i synchronizaci metadat.
          </p>
        </div>
      </header>

      {totalSaved > 0 ? (
        <FilterBar action="/na-pozdeji" channels={channels} topics={topics} categories={categories} values={values} />
      ) : null}

      {totalSaved > 0 ? (
        <div className="result-bar">
          <span>
            {result.total} uložených odpovídá filtru
            {result.appliedTokens.length > 0 ? ` · ${result.appliedTokens.join(", ")}` : ""}
          </span>
          <span>Výsledky z lokální databáze</span>
        </div>
      ) : null}

      {result.rows.length === 0 ? (
        <div className="empty">
          <h3>{hasFilters ? "Žádné uložené video neodpovídá filtru" : "Zatím nic odloženo"}</h3>
          <p>
            {hasFilters
              ? "Zkus jiný výraz, širší datum nebo zruš filtry."
              : "Tlačítko „Na později“ je na každé kartě videa i v detailu. Odložená videa zůstávají oddělená od zbytku knihovny."}
          </p>
          <div style={{ display: "flex", gap: 9, justifyContent: "center", flexWrap: "wrap" }}>
            {hasFilters ? (
              <Link href="/na-pozdeji" className="btn">
                Zrušit filtry
              </Link>
            ) : null}
            <Link href="/videa" className="btn btn-primary">
              <Icon name="videos" size={16} /> Projít videa
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

      <Pagination action="/na-pozdeji" params={values} page={result.page} pages={result.pages} />
    </div>
  );
}
