import type { Db } from "../db/client";
import { dbAll } from "../types";
import { formatDateCs } from "../shared/time";
import { ITEM_KIND_LABELS, VERIFICATION_HINTS, VERIFICATION_LABELS } from "../ui/labels";
import type { KnowledgeRow } from "../queries/knowledge";

export type KnowledgeExportBundle = {
  exported_at: string;
  items: {
    id: number;
    kind: string;
    text_cs: string;
    detail_cs: string | null;
    verification_status: string;
    timestamp_seconds: number | null;
    timestamp_url: string | null;
    tool_name: string | null;
    tool_url: string | null;
    prompt_kind: string | null;
    prompt_text: string | null;
    video: { video_id: string; title: string; url: string; channel: string; published_at: string };
  }[];
};

export function loadKnowledgeItems(db: Db, ids: number[]): KnowledgeRow[] {
  if (ids.length === 0) return [];
  const placeholders = ids.map(() => "?").join(",");
  return dbAll<KnowledgeRow>(
    db,
    `SELECT i.*, v.title AS video_title, v.channel_id, v.published_at,
            c.title AS channel_title, a.title_cs AS analysis_title_cs, a.relevance_score
       FROM analysis_items i
       JOIN analyses a ON a.id = i.analysis_id
       JOIN videos v ON v.video_id = i.video_id
       JOIN channels c ON c.channel_id = v.channel_id
      WHERE i.id IN (${placeholders})
      ORDER BY v.published_at DESC, i.ordinal ASC`,
    ...ids,
  );
}

function ts(seconds: number | null): string {
  if (seconds == null) return "";
  const s = Math.max(0, Math.round(seconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  return h > 0 ? `${h}:${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}` : `${m}:${String(sec).padStart(2, "0")}`;
}

export function knowledgeToMarkdown(rows: KnowledgeRow[]): string {
  const lines: string[] = [];
  lines.push(`# AI Radar — vybrané poznatky`);
  lines.push("");
  lines.push(`> Export ${rows.length} položek · ${formatDateCs(new Date().toISOString())}`);
  lines.push("");
  lines.push(
    "Stav ověření je uvedený u každé položky. AI extrakce ani vysoká jistota modelu neznamenají nezávislé ověření.",
  );
  lines.push("");

  let currentVideo = "";
  for (const row of rows) {
    if (row.video_id !== currentVideo) {
      currentVideo = row.video_id;
      lines.push(`## ${row.video_title}`);
      lines.push("");
      lines.push(`- Kanál: ${row.channel_title}`);
      lines.push(`- Video: https://www.youtube.com/watch?v=${row.video_id}`);
      lines.push(`- Publikováno: ${formatDateCs(row.published_at)}`);
      lines.push("");
    }
    lines.push(`### ${ITEM_KIND_LABELS[row.kind] ?? row.kind}`);
    lines.push("");
    lines.push(row.text_cs);
    if (row.detail_cs) {
      lines.push("");
      lines.push(row.detail_cs);
    }
    if (row.timestamp_seconds != null) {
      lines.push("");
      lines.push(`Čas: ${ts(row.timestamp_seconds)} – ${row.timestamp_url ?? ""}`);
    }
    if (row.tool_name) {
      lines.push("");
      lines.push(`Nástroj: ${row.tool_name}${row.tool_url ? ` – ${row.tool_url}` : ""}`);
    }
    if (row.prompt_text) {
      lines.push("");
      lines.push("```text");
      lines.push(row.prompt_text);
      lines.push("```");
    }
    lines.push("");
    lines.push(
      `Ověření: **${VERIFICATION_LABELS[row.verification_status] ?? row.verification_status}** — ${
        VERIFICATION_HINTS[row.verification_status] ?? ""
      }`,
    );
    lines.push("");
  }

  return lines.join("\n");
}

export function knowledgeToJson(rows: KnowledgeRow[]): KnowledgeExportBundle {
  return {
    exported_at: new Date().toISOString(),
    items: rows.map((row) => ({
      id: row.id,
      kind: row.kind,
      text_cs: row.text_cs,
      detail_cs: row.detail_cs,
      verification_status: row.verification_status,
      timestamp_seconds: row.timestamp_seconds,
      timestamp_url: row.timestamp_url,
      tool_name: row.tool_name,
      tool_url: row.tool_url,
      prompt_kind: row.prompt_kind,
      prompt_text: row.prompt_text,
      video: {
        video_id: row.video_id,
        title: row.video_title,
        url: `https://www.youtube.com/watch?v=${row.video_id}`,
        channel: row.channel_title,
        published_at: row.published_at,
      },
    })),
  };
}
