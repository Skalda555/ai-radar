import Link from "next/link";
import type { Metadata } from "next";
import { Icon } from "@/components/ui/Icon";
import { KnowledgeItemActions } from "@/components/knowledge/KnowledgeItemActions";
import { getDb } from "@/lib/db/client";
import { searchKnowledge } from "@/lib/queries/knowledge";
import { ITEM_KIND_LABELS, VERIFICATION_LABELS, verificationClass, VERIFICATION_HINTS } from "@/lib/ui/labels";
import { relativeTimeCs } from "@/lib/shared/time";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Databáze znalostí" };

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
  return qs ? `/databaze?${qs}` : "/databaze";
}

export default async function KnowledgeDatabasePage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const sp = await searchParams;
  const db = getDb();
  const q = one(sp.q);
  const page = Math.max(1, Number.parseInt(one(sp.page) || "1", 10) || 1);

  const result = searchKnowledge(db, {
    q,
    curatedOnly: true,
    // Databáze je vědomě uložený výběr, takže skrytí videa v knihovně ho neovlivní.
    includeHidden: true,
    page,
    perPage: 30,
  });

  return (
    <div className="page">
      <header className="page-head">
        <div>
          <div className="eyebrow">Vlastní výběr</div>
          <h1>Databáze znalostí</h1>
          <p className="lede">
            Poznatky, které sis vědomě uložil z knihovny. Tady zůstávají bez ohledu na to, co se
            skryje v knihovně, a dají se exportovat jako Markdown nebo JSON se zdrojem a stavem
            ověření.
          </p>
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <span className="chip chip-neutral">{result.total} uložených</span>
          <Link href="/znalosti" className="btn">
            <Icon name="knowledge" size={16} /> Do knihovny
          </Link>
        </div>
      </header>

      <form method="get" action="/databaze" className="panel" role="search" style={{ padding: 14, marginBottom: 16 }}>
        <div style={{ display: "grid", gridTemplateColumns: "minmax(0,1fr) auto", gap: 9, alignItems: "end" }}>
          <div>
            <label className="field-label" htmlFor="db-q">
              Hledat v uložených znalostech
            </label>
            <input
              id="db-q"
              name="q"
              type="search"
              className="input"
              defaultValue={q}
              placeholder="např. subagenti, MCP, testování"
            />
          </div>
          <button type="submit" className="btn btn-primary" style={{ minHeight: 44 }}>
            Hledat
          </button>
        </div>
      </form>

      {result.rows.length === 0 ? (
        <div className="empty">
          <h3>Databáze je zatím prázdná</h3>
          <p>
            V Knihovně znalostí najdi poznatek a klikni na „Uložit do databáze". Záznam se objeví
            tady i s odkazem na video a časovou značkou.
          </p>
          <Link href="/znalosti" className="btn btn-primary">
            <Icon name="knowledge" size={16} /> Otevřít knihovnu
          </Link>
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
                      {row.video_knowledge_hidden ? <span className="chip chip-neutral">video skryté v knihovně</span> : null}
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

          <div className="panel" style={{ padding: 14, marginTop: 16, display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
            <span className="tiny muted" style={{ marginRight: "auto" }}>
              Vyber záznamy a exportuj je se zdroji a stavem ověření.
            </span>
            <label className="field-label" htmlFor="db-format" style={{ margin: 0 }}>
              Formát
            </label>
            <select id="db-format" name="format" className="select" style={{ width: 120, minHeight: 40 }}>
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
        <nav className="pagination" aria-label="Stránkování databáze">
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
    </div>
  );
}
