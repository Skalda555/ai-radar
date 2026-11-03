import Link from "next/link";
import type { Metadata } from "next";
import { Icon } from "@/components/ui/Icon";
import { getDb } from "@/lib/db/client";
import { KnowledgeItemActions } from "@/components/knowledge/KnowledgeItemActions";
import { AutoSubmitForm } from "@/components/ui/AutoSubmitForm";
import {
  knowledgeFacets,
  knowledgeStats,
  searchKnowledge,
  type KnowledgeFilters,
} from "@/lib/queries/knowledge";
import { ITEM_KIND_LABELS, STATUS_LABELS, VERIFICATION_HINTS, VERIFICATION_LABELS, verificationClass } from "@/lib/ui/labels";
import { relativeTimeCs } from "@/lib/shared/time";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Knihovna znalostí" };

type SearchParams = Record<string, string | string[] | undefined>;

function one(value: string | string[] | undefined): string {
  if (Array.isArray(value)) return value[0] ?? "";
  return value ?? "";
}

function pageHref(params: SearchParams, page: number): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    const single = one(value);
    if (single && key !== "page") search.set(key, single);
  }
  if (page > 1) search.set("page", String(page));
  const qs = search.toString();
  return qs ? `/znalosti?${qs}` : "/znalosti";
}

export default async function KnowledgePage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const sp = await searchParams;
  const db = getDb();

  const filters: KnowledgeFilters = {
    q: one(sp.q),
    topic: one(sp.topic),
    channel: one(sp.channel),
    tool: one(sp.tool),
    kind: one(sp.kind),
    verification: one(sp.verification),
    includeHidden: one(sp.hidden) === "1",
    page: Math.max(1, Number.parseInt(one(sp.page) || "1", 10) || 1),
    perPage: 20,
  };

  const result = searchKnowledge(db, filters);
  const facets = knowledgeFacets(db);
  const stats = knowledgeStats(db);

  return (
    <div className="page">
      <header className="page-head">
        <div>
          <div className="eyebrow">Znalostní báze</div>
          <h1>Knihovna znalostí</h1>
          <p className="lede">
            Poznatky ze všech dokončených analýz. Hledání běží v SQLite (FTS5), bez dalšího Gemini
            požadavku. Každý výsledek ukazuje původní video a časovou značku.
          </p>
        </div>
        <div style={{ display: "flex", gap: 7, flexWrap: "wrap" }}>
          <span className="chip chip-neutral">{stats.items} položek</span>
          <span className="chip chip-neutral">{stats.videos} videí</span>
          <span className="chip chip-neutral">{stats.tools} nástrojů</span>
          <span className="chip chip-success">{stats.verified} ověřených</span>
        </div>
      </header>

      <AutoSubmitForm action="/znalosti" className="panel" style={{ padding: 14, marginBottom: 16 }} ariaLabel="Filtry znalostí">
        <div
          className="filter-bar-knowledge"
        >
          <div>
            <label className="field-label" htmlFor="k-q">
              Hledat v poznatcích
            </label>
            <input
              id="k-q"
              name="q"
              type="search"
              className="input"
              defaultValue={filters.q}
              placeholder="subagenti, PRD, Codex Skills, MCP…"
            />
          </div>
          <div>
            <label className="field-label" htmlFor="k-topic">
              Téma
            </label>
            <select id="k-topic" name="topic" className="select" defaultValue={filters.topic}>
              <option value="">Vše</option>
              {facets.topics.map((topic) => (
                <option key={topic.value} value={topic.value}>
                  {topic.value} ({topic.count})
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="field-label" htmlFor="k-channel">
              Kanál
            </label>
            <select id="k-channel" name="channel" className="select" defaultValue={filters.channel}>
              <option value="">Vše</option>
              {facets.channels.map((channel) => (
                <option key={channel.value} value={channel.value}>
                  {channel.label} ({channel.count})
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="field-label" htmlFor="k-tool">
              Nástroj
            </label>
            <select id="k-tool" name="tool" className="select" defaultValue={filters.tool}>
              <option value="">Vše</option>
              {facets.tools.map((tool) => (
                <option key={tool.value} value={tool.value}>
                  {tool.value} ({tool.count})
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="field-label" htmlFor="k-kind">
              Typ poznatku
            </label>
            <select id="k-kind" name="kind" className="select" defaultValue={filters.kind}>
              <option value="">Vše</option>
              {facets.kinds.map((kind) => (
                <option key={kind.value} value={kind.value}>
                  {ITEM_KIND_LABELS[kind.value] ?? kind.value} ({kind.count})
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="field-label" htmlFor="k-verification">
              Ověření
            </label>
            <select id="k-verification" name="verification" className="select" defaultValue={filters.verification}>
              <option value="">Vše</option>
              {facets.verifications.map((verification) => (
                <option key={verification.value} value={verification.value}>
                  {VERIFICATION_LABELS[verification.value] ?? verification.value} ({verification.count})
                </option>
              ))}
            </select>
          </div>
          <label style={{ display: "flex", gap: 7, alignItems: "center", alignSelf: "end", minHeight: 40 }}>
            <input
              type="checkbox"
              name="hidden"
              value="1"
              defaultChecked={filters.includeHidden}
              style={{ width: 16, height: 16 }}
            />
            <span className="tiny">Zobrazit i skrytá videa</span>
          </label>
          <div style={{ display: "flex", gap: 8 }}>
            <button type="submit" className="btn btn-primary" style={{ minHeight: 40 }}>
              Hledat
            </button>
            <Link href="/znalosti" className="btn btn-ghost" style={{ minHeight: 40 }}>
              Zrušit
            </Link>
          </div>
        </div>
        <p className="tiny muted" style={{ margin: "10px 2px 0" }}>
          {result.total} položek odpovídá filtru
          {result.tokens.length > 0 ? ` · hledané výrazy: ${result.tokens.join(", ")}` : ""}
          {result.usedFts ? " · fulltext FTS5" : " · bez fulltextu"}
        </p>
      </AutoSubmitForm>

      {result.rows.length === 0 ? (
        <div className="empty">
          <h3>Knihovna je prázdná nebo filtr nic nenašel</h3>
          <p>
            Poznatky vznikají až z dokončených AI analýz. Otevři video, spusť analýzu po potvrzení a
            výsledek se sem uloží včetně časových značek.
          </p>
          <div style={{ display: "flex", gap: 9, justifyContent: "center", flexWrap: "wrap" }}>
            <Link href="/videa" className="btn btn-primary">
              <Icon name="videos" size={16} /> Přejít na videa
            </Link>
            <Link href="/znalosti" className="btn">
              Zrušit filtry
            </Link>
          </div>
        </div>
      ) : (
        <form method="get" action="/api/export/knowledge">
          <div style={{ display: "grid", gap: 10 }}>
            {result.rows.map((row) => (
              <article key={row.id} className="item-block" style={{ marginBottom: 0 }}>
                <div style={{ display: "flex", gap: 10, alignItems: "flex-start" }}>
                  <input
                    type="checkbox"
                    name="ids"
                    value={row.id}
                    aria-label={`Vybrat poznatek: ${row.text_cs.slice(0, 60)}`}
                    style={{ marginTop: 5, width: 17, height: 17, flex: "none" }}
                  />
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 5 }}>
                      <span className="chip chip-neutral">{ITEM_KIND_LABELS[row.kind] ?? row.kind}</span>
                      <span className={verificationClass(row.verification_status)} title={VERIFICATION_HINTS[row.verification_status]}>
                        {VERIFICATION_LABELS[row.verification_status] ?? row.verification_status}
                      </span>
                      {row.timestamp_url ? (
                        <a href={row.timestamp_url} target="_blank" rel="noreferrer noopener" className="chip chip-teal">
                          <Icon name="clock" size={11} /> čas ve videu
                        </a>
                      ) : null}
                    </div>
                    <p style={{ margin: "0 0 4px", fontWeight: 550, color: "#E3EAF2" }}>{row.text_cs}</p>
                    {row.detail_cs ? (
                      <p className="tiny" style={{ margin: "0 0 6px", color: "#AEBBC8" }}>
                        {row.detail_cs}
                      </p>
                    ) : null}
                    <div className="tiny muted">
                      <Link href={`/video/${row.video_id}`} style={{ color: "#B6AEE8" }}>
                        {row.video_title}
                      </Link>{" "}
                      · {row.channel_title} · {relativeTimeCs(row.published_at)}
                      {row.tool_name ? ` · nástroj ${row.tool_name}` : ""}
                      {row.video_knowledge_hidden ? " · skryté video" : ""}
                    </div>
                    <KnowledgeItemActions
                      itemId={row.id}
                      videoId={row.video_id}
                      curated={Boolean(row.curated_at)}
                      videoHidden={Boolean(row.video_knowledge_hidden)}
                    />
                  </div>
                </div>
              </article>
            ))}
          </div>

          <div
            className="panel"
            style={{ padding: 14, marginTop: 16, display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}
          >
            <span className="tiny muted" style={{ marginRight: "auto" }}>
              Vyber poznatky a exportuj je se zdroji a stavem ověření.
            </span>
            <label className="field-label" htmlFor="export-format" style={{ margin: 0 }}>
              Formát
            </label>
            <select id="export-format" name="format" className="select" style={{ width: 120, minHeight: 38 }}>
              <option value="md">Markdown</option>
              <option value="json">JSON</option>
            </select>
            <button type="submit" className="btn btn-primary">
              <Icon name="download" size={15} /> Exportovat vybrané
            </button>
          </div>
        </form>
      )}

      {result.pages > 1 ? (
        <nav className="pagination" aria-label="Stránkování znalostí">
          {result.page > 1 ? (
            <Link href={pageHref(sp, result.page - 1)} className="btn btn-sm">
              <Icon name="chevronLeft" size={14} /> Předchozí
            </Link>
          ) : (
            <span className="btn btn-sm" style={{ opacity: 0.4 }} aria-disabled="true">
              <Icon name="chevronLeft" size={14} /> Předchozí
            </span>
          )}
          <span className="tiny muted">
            Strana {result.page} z {result.pages}
          </span>
          {result.page < result.pages ? (
            <Link href={pageHref(sp, result.page + 1)} className="btn btn-sm">
              Další <Icon name="chevronRight" size={14} />
            </Link>
          ) : (
            <span className="btn btn-sm" style={{ opacity: 0.4 }} aria-disabled="true">
              Další <Icon name="chevronRight" size={14} />
            </span>
          )}
        </nav>
      ) : null}

      <p className="tiny muted" style={{ marginTop: 20 }}>
        Stavy: {Object.entries(STATUS_LABELS).slice(0, 5).map(([, label]) => label).join(" · ")}. Ověření
        znamená ruční kontrolu u zdroje, ne automatické potvrzení modelem.
      </p>
    </div>
  );
}
