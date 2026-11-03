import type { Db } from "../db/client";
import { dbAll, dbGet, type AnalysisItemRow } from "../types";
import { fold } from "../shared/text";

export type KnowledgeFilters = {
  q?: string;
  topic?: string;
  channel?: string;
  tool?: string;
  kind?: string;
  verification?: string;
  includeHidden?: boolean;
  curatedOnly?: boolean;
  page?: number;
  perPage?: number;
};

export type KnowledgeRow = AnalysisItemRow & {
  video_title: string;
  channel_title: string;
  channel_id: string;
  published_at: string;
  analysis_title_cs: string | null;
  relevance_score: number | null;
  video_knowledge_hidden: string | null;
};

export type KnowledgeResult = {
  rows: KnowledgeRow[];
  total: number;
  page: number;
  pages: number;
  usedFts: boolean;
  tokens: string[];
};

function buildMatchQuery(q: string): { match: string; tokens: string[] } {
  const tokens = fold(q)
    .split(" ")
    .filter((token) => token.length >= 2)
    .slice(0, 6);
  return {
    match: tokens.map((token) => `"${token}"*`).join(" AND "),
    tokens,
  };
}

export function searchKnowledge(db: Db, filters: KnowledgeFilters = {}): KnowledgeResult {
  const { match, tokens } = buildMatchQuery(filters.q ?? "");
  const perPage = Math.min(50, Math.max(1, filters.perPage ?? 20));
  const page = Math.max(1, filters.page ?? 1);
  const offset = (page - 1) * perPage;
  const usedFts = match.length > 0;

  const clauses: string[] = [];
  const params: (string | number)[] = [];

  if (usedFts) {
    clauses.push("i.id IN (SELECT rowid FROM knowledge_fts WHERE knowledge_fts MATCH ?)");
    params.push(match);
  }
  if (filters.topic) {
    clauses.push("v.topics LIKE ?");
    params.push(`%${filters.topic}%`);
  }
  if (filters.channel) {
    clauses.push("v.channel_id = ?");
    params.push(filters.channel);
  }
  if (filters.tool) {
    clauses.push("i.tool_name LIKE ?");
    params.push(`%${filters.tool}%`);
  }
  if (filters.kind) {
    clauses.push("i.kind = ?");
    params.push(filters.kind);
  }
  if (filters.verification) {
    clauses.push("i.verification_status = ?");
    params.push(filters.verification);
  }
  if (!filters.includeHidden) {
    clauses.push("v.knowledge_hidden_at IS NULL");
  }
  if (filters.curatedOnly) {
    clauses.push("i.curated_at IS NOT NULL");
  }

  const where = clauses.length > 0 ? `WHERE ${clauses.join(" AND ")}` : "";
  const from = `
    FROM analysis_items i
    JOIN analyses a ON a.id = i.analysis_id
    JOIN videos v ON v.video_id = i.video_id
    JOIN channels c ON c.channel_id = v.channel_id
    ${where}
  `;

  const totalRow = db
    .prepare(`SELECT COUNT(*) AS c ${from}`)
    .get(...params) as unknown as { c: number } | undefined;
  const total = Number(totalRow?.c ?? 0);

  const order = usedFts
    ? `ORDER BY (SELECT rank FROM knowledge_fts WHERE rowid = i.id), v.published_at DESC`
    : `ORDER BY v.published_at DESC, i.ordinal ASC`;

  const rows = db
    .prepare(
      `SELECT i.*, v.title AS video_title, v.channel_id, v.published_at,
              v.knowledge_hidden_at AS video_knowledge_hidden,
              c.title AS channel_title, a.title_cs AS analysis_title_cs, a.relevance_score
       ${from} ${order} LIMIT ? OFFSET ?`,
    )
    .all(...params, perPage, offset) as unknown as KnowledgeRow[];

  return {
    rows,
    total,
    page,
    pages: Math.max(1, Math.ceil(total / perPage)),
    usedFts,
    tokens,
  };
}

export function knowledgeFacets(db: Db): {
  topics: { value: string; count: number }[];
  channels: { value: string; label: string; count: number }[];
  tools: { value: string; count: number }[];
  kinds: { value: string; count: number }[];
  verifications: { value: string; count: number }[];
} {
  const topicRows = dbAll<{ topics: string | null }>(
    db,
    `SELECT DISTINCT v.topics FROM analysis_items i JOIN videos v ON v.video_id = i.video_id`,
  );
  const topicCounts = new Map<string, number>();
  for (const row of topicRows) {
    for (const topic of (row.topics ?? "").split(",").map((value) => value.trim()).filter(Boolean)) {
      topicCounts.set(topic, (topicCounts.get(topic) ?? 0) + 1);
    }
  }

  return {
    topics: [...topicCounts.entries()]
      .map(([value, count]) => ({ value, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 25),
    channels: dbAll<{ value: string; label: string; count: number }>(
      db,
      `SELECT c.channel_id AS value, c.title AS label, COUNT(i.id) AS count
         FROM analysis_items i
         JOIN videos v ON v.video_id = i.video_id
         JOIN channels c ON c.channel_id = v.channel_id
        GROUP BY c.channel_id ORDER BY count DESC`,
    ),
    tools: dbAll<{ value: string; count: number }>(
      db,
      `SELECT tool_name AS value, COUNT(*) AS count FROM analysis_items
        WHERE tool_name IS NOT NULL AND tool_name != '' GROUP BY tool_name ORDER BY count DESC LIMIT 25`,
    ),
    kinds: dbAll<{ value: string; count: number }>(
      db,
      `SELECT kind AS value, COUNT(*) AS count FROM analysis_items GROUP BY kind ORDER BY count DESC`,
    ),
    verifications: dbAll<{ value: string; count: number }>(
      db,
      `SELECT verification_status AS value, COUNT(*) AS count FROM analysis_items GROUP BY verification_status`,
    ),
  };
}

export function knowledgeStats(db: Db): { items: number; videos: number; tools: number; verified: number } {
  const row = dbGet<{ items: number; videos: number; tools: number; verified: number }>(
    db,
    `SELECT
       (SELECT COUNT(*) FROM analysis_items) AS items,
       (SELECT COUNT(DISTINCT video_id) FROM analysis_items) AS videos,
       (SELECT COUNT(DISTINCT tool_name) FROM analysis_items WHERE tool_name IS NOT NULL) AS tools,
       (SELECT COUNT(*) FROM analysis_items WHERE verification_status IN ('USER_VERIFIED','SOURCE_SUPPORTED')) AS verified`,
  );
  return {
    items: Number(row?.items ?? 0),
    videos: Number(row?.videos ?? 0),
    tools: Number(row?.tools ?? 0),
    verified: Number(row?.verified ?? 0),
  };
}
